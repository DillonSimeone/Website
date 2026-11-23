import asyncio
import os
import struct
import subprocess
import sys
import time
import wave
from pathlib import Path

import numpy as np
from bleak import BleakClient, BleakScanner

DEVICE_NAME = "C3-BLE-MIC"
AUDIO_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef1"
SAMPLE_RATE = 16000
TEST_PHRASE = "The quick brown fox jumps over the lazy dog seven times."
RECORD_SECONDS = 6.5

SPEECH_BRIDGE_DIR = Path(r"C:\Users\Dillo\OneDrive\Desktop\Github\Website\public\Glue\RUST\speech-bridge")
SPEECH_BENCH_EXE = SPEECH_BRIDGE_DIR / "speech-bench.exe"
OUT_WAV = Path(__file__).resolve().parent / "test_capture.wav"


IMA_INDEX_TABLE = (-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8)
IMA_STEP_TABLE = (
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
    3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
    12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
)


def decode_ima_adpcm_packet(payload: bytes) -> np.ndarray:
    """Decode 4-byte state header (pred:i16, index:u8, res:u8) + packed 4-bit ADPCM nibbles."""
    pred, index, _ = struct.unpack_from("<hBB", payload, 0)
    index = min(max(index, 0), 88)
    adpcm_bytes = payload[4:]
    out = np.empty(len(adpcm_bytes) * 2, dtype=np.int16)

    pos = 0
    for b in adpcm_bytes:
        for nib in (b & 0x0F, (b >> 4) & 0x0F):
            step = IMA_STEP_TABLE[index]
            diff = step >> 3
            if nib & 4:
                diff += step
            if nib & 2:
                diff += step >> 1
            if nib & 1:
                diff += step >> 2
            if nib & 8:
                pred -= diff
            else:
                pred += diff
            if pred > 32767:
                pred = 32767
            elif pred < -32768:
                pred = -32768
            index += IMA_INDEX_TABLE[nib]
            if index < 0:
                index = 0
            elif index > 88:
                index = 88
            out[pos] = pred
            pos += 1
    return out


def speak_phrase_windows(text: str) -> None:
    """Speak the test phrase via Windows System.Speech SAPI synthesizer."""
    ps_cmd = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.Volume = 100; "
        "$s.Rate = 0; "
        f"$s.Speak('{text}')"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def capture_ble_audio() -> tuple[np.ndarray, int, int]:
    print(f"Scanning for BLE device '{DEVICE_NAME}'...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=15.0)
    if device is None:
        raise RuntimeError(f"Could not find BLE device '{DEVICE_NAME}'. Check power/advertising.")

    print(f"Found {device.name} ({device.address}). Connecting...")

    raw_packets: list[bytes] = []
    stats = {
        "total_packets": 0,
        "dropped_packets": 0,
        "expected_seq": None,
    }

    def on_notify(_sender: int, data: bytearray) -> None:
        if len(data) < 6:
            return
        seq = struct.unpack_from("<H", data, 0)[0]

        if stats["expected_seq"] is not None:
            diff = (seq - stats["expected_seq"]) & 0xFFFF
            if diff > 0 and diff < 1000:
                stats["dropped_packets"] += diff

        stats["expected_seq"] = (seq + 1) & 0xFFFF
        stats["total_packets"] += 1
        raw_packets.append(bytes(data[2:]))

    async with BleakClient(device, timeout=15.0) as client:
        print(f"Connected! Negotiated MTU: {client.mtu_size} bytes")
        await client.start_notify(AUDIO_CHAR_UUID, on_notify)
        print("Subscribed to audio notifications. Recording & speaking...")

        # Brief pre-roll (0.6 s) before speaking
        await asyncio.sleep(0.6)
        t_start = time.monotonic()

        # Run blocking TTS in worker thread while BLE asyncio loop receives packets
        tts_task = asyncio.to_thread(speak_phrase_windows, TEST_PHRASE)
        await tts_task

        # Post-roll to catch reverb/tail up to RECORD_SECONDS
        elapsed = time.monotonic() - t_start + 0.6
        remaining = max(0.8, RECORD_SECONDS - elapsed)
        await asyncio.sleep(remaining)

        try:
            await client.stop_notify(AUDIO_CHAR_UUID)
        except Exception:
            pass

    if not raw_packets:
        return np.zeros(0, dtype=np.int16), 0, 0

    pcm_chunks = [
        decode_ima_adpcm_packet(p) if len(p) == 244 else np.frombuffer(p, dtype="<i2").copy()
        for p in raw_packets
    ]
    audio = np.concatenate(pcm_chunks)
    return audio, stats["total_packets"], stats["dropped_packets"]


def save_wav(path: Path, audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio.tobytes())


def run_speech_bridge_stt(wav_path: Path, ref_text: str) -> tuple[bool, str]:
    if not SPEECH_BENCH_EXE.exists():
        raise FileNotFoundError(f"speech-bench.exe not found at {SPEECH_BENCH_EXE}")

    cmd = [
        str(SPEECH_BENCH_EXE),
        "--speech",
        str(wav_path),
        "--ref",
        ref_text,
        "--engines",
        "parakeet",
        "--snrs",
        "clean",
        "--show-hyp",
    ]
    print("\nRunning speech-bridge STT (Parakeet TDT 0.6B CUDA)...")
    res = subprocess.run(
        cmd,
        cwd=str(SPEECH_BRIDGE_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    output = res.stdout + ("\n" + res.stderr if res.stderr.strip() else "")
    print(output)
    return res.returncode == 0, output


async def main() -> int:
    audio, total_pkts, dropped_pkts = await capture_ble_audio()

    if len(audio) == 0 or total_pkts == 0:
        print("FAIL: Zero audio packets received.")
        return 1

    save_wav(OUT_WAV, audio, SAMPLE_RATE)

    expected_pkts = total_pkts + dropped_pkts
    drop_pct = (100.0 * dropped_pkts / expected_pkts) if expected_pkts > 0 else 100.0
    duration_s = len(audio) / SAMPLE_RATE
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    peak = int(np.max(np.abs(audio.astype(np.int32))))
    dc_mean = float(np.mean(audio))
    clipped = int(np.sum(np.abs(audio.astype(np.int32)) >= 32760))
    clip_pct = 100.0 * clipped / len(audio)

    print("\n--- BLE Audio Capture Summary ---")
    print(f"Saved WAV       : {OUT_WAV}")
    print(f"Duration        : {duration_s:.2f} s ({len(audio)} samples)")
    print(f"Packets         : {total_pkts} received, {dropped_pkts} dropped ({drop_pct:.2f}% loss)")
    print(f"DC Mean         : {dc_mean:.1f}")
    print(f"RMS Amplitude   : {rms:.1f}")
    print(f"Peak Amplitude  : {peak} / 32767")
    print(f"Clipped Samples : {clipped} ({clip_pct:.3f}%)")

    ok, stt_out = run_speech_bridge_stt(OUT_WAV, TEST_PHRASE)

    if drop_pct >= 2.0:
        print(f"FAIL: Packet loss {drop_pct:.2f}% >= 2.0%")
        return 2
    if rms < 50.0:
        print(f"FAIL: Audio RMS {rms:.1f} too low (silent/dead mic).")
        return 3
    if clip_pct > 2.0:
        print(f"FAIL: Audio clipping {clip_pct:.2f}% > 2.0%.")
        return 4
    if not ok:
        print("FAIL: speech-bench.exe returned non-zero exit code.")
        return 5

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
