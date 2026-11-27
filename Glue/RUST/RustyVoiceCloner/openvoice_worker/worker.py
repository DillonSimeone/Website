"""
Persistent OpenVoice v2 Tone-Color Conversion Worker for RustyVoiceCloner & speech-bridge.

Protocol (JSON lines over stdin/stdout when run with --daemon):
  Startup prints: {"status": "ready", "device": "cuda:0"}
  Commands:
    {"cmd": "ping"}
    {"cmd": "extract_se", "ref": "<path.wav>", "out": "<path.pth>"}
    {"cmd": "convert", "src_wav": "<in.wav>", "src_key": "<piper_name>", "tgt_se": "<dillon.pth>", "out_wav": "<out.wav>"}
    {"cmd": "quit"}

One-shot CLI:
  python worker.py --extract-se --ref <ref.wav> --out <profile.pth>
"""

import argparse
import json
import os
import sys
import traceback
from pathlib import Path

import torch


def find_converter_dir() -> Path:
    here = Path(__file__).resolve().parent
    candidates = [
        here / "checkpoints_v2" / "converter",
        here / "checkpoints_v2" / "checkpoints_v2" / "converter",
    ]
    for c in candidates:
        if (c / "config.json").is_file() and (c / "checkpoint.pth").is_file():
            return c
    raise FileNotFoundError(
        "OpenVoice v2 converter checkpoints not found. Run Setup.bat in openvoice_worker/ first."
    )


def load_converter():
    import contextlib
    from openvoice.api import OpenVoiceBaseClass, ToneColorConverter

    class FastToneColorConverter(ToneColorConverter):
        def __init__(self, config_path, device="cuda:0"):
            OpenVoiceBaseClass.__init__(self, config_path, device=device)
            self.watermark_model = None
            self.version = getattr(self.hps, "_version_", "v2")

    ckpt_dir = find_converter_dir()
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    # Keep stdout clean JSON-only so Rust daemon handshake never trips on library print()s.
    with contextlib.redirect_stdout(sys.stderr):
        converter = FastToneColorConverter(str(ckpt_dir / "config.json"), device=device)
        converter.load_ckpt(str(ckpt_dir / "checkpoint.pth"))
    return converter, device


def fast_convert_wav(converter, src_wav: str, src_se, tgt_se, out_wav: str, tau: float = 0.3):
    import soundfile as sf
    from openvoice.mel_processing import spectrogram_torch

    hps = converter.hps
    target_sr = hps.data.sampling_rate
    audio, sr = sf.read(src_wav, dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != target_sr:
        import librosa

        audio = librosa.resample(audio, orig_sr=sr, target_sr=target_sr)

    with torch.inference_mode():
        y = torch.from_numpy(audio).to(converter.device, non_blocking=True).unsqueeze(0)
        spec = spectrogram_torch(
            y,
            hps.data.filter_length,
            target_sr,
            hps.data.hop_length,
            hps.data.win_length,
            center=False,
        )
        spec_lengths = torch.tensor([spec.size(-1)], dtype=torch.long, device=converter.device)
        out_audio = (
            converter.model.voice_conversion(
                spec, spec_lengths, sid_src=src_se, sid_tgt=tgt_se, tau=tau
            )[0][0, 0]
            .detach()
            .cpu()
            .float()
            .numpy()
        )
    Path(out_wav).parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_wav, out_audio, target_sr)


def extract_se_file(converter, ref_wav: str, out_pth: str) -> str:
    ref_path = Path(ref_wav)
    if not ref_path.is_file():
        raise FileNotFoundError(f"Reference WAV not found: {ref_wav}")
    out_path = Path(out_pth)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    se = converter.extract_se([str(ref_path)])
    torch.save(se.cpu(), str(out_path))
    return str(out_path)


def run_daemon():
    try:
        converter, device = load_converter()
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}), flush=True)
        sys.exit(1)

    src_se_cache: dict[str, torch.Tensor] = {}
    tgt_se_cache: dict[str, torch.Tensor] = {}
    src_cache_dir = Path(__file__).resolve().parent / "src_se_cache"
    src_cache_dir.mkdir(parents=True, exist_ok=True)

    print(json.dumps({"status": "ready", "device": device}), flush=True)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            cmd = req.get("cmd")

            if cmd == "ping":
                resp = {"ok": True, "device": device}

            elif cmd == "quit":
                print(json.dumps({"ok": True}), flush=True)
                break

            elif cmd == "extract_se":
                out_path = extract_se_file(converter, req["ref"], req["out"])
                # Invalidate cached target SE if overwritten
                tgt_se_cache.pop(out_path, None)
                resp = {"ok": True, "out": out_path}

            elif cmd == "convert":
                src_wav = req["src_wav"]
                src_key = req.get("src_key") or src_wav
                tgt_se_path = req["tgt_se"]
                out_wav = req["out_wav"]

                if src_key not in src_se_cache:
                    safe_key = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in src_key)
                    disk_se = src_cache_dir / f"{safe_key}.pth"
                    if disk_se.is_file():
                        src_se_cache[src_key] = torch.load(
                            str(disk_se), map_location=device, weights_only=True
                        ).to(device)
                    else:
                        se = converter.extract_se([src_wav]).to(device)
                        torch.save(se.cpu(), str(disk_se))
                        src_se_cache[src_key] = se
                src_se = src_se_cache[src_key]

                if tgt_se_path not in tgt_se_cache:
                    if not os.path.isfile(tgt_se_path):
                        raise FileNotFoundError(f"Target SE not found: {tgt_se_path}")
                    tgt_se_cache[tgt_se_path] = torch.load(
                        tgt_se_path, map_location=device, weights_only=True
                    ).to(device)
                tgt_se = tgt_se_cache[tgt_se_path]

                fast_convert_wav(converter, src_wav, src_se, tgt_se, out_wav)
                resp = {"ok": True, "out_wav": out_wav}

            else:
                resp = {"ok": False, "error": f"Unknown command: {cmd}"}

        except Exception as exc:
            resp = {
                "ok": False,
                "error": str(exc),
                "trace": traceback.format_exc(),
            }

        print(json.dumps(resp), flush=True)


def main():
    parser = argparse.ArgumentParser(description="OpenVoice v2 worker")
    parser.add_argument("--daemon", action="store_true", help="Run JSON-lines stdio daemon")
    parser.add_argument("--extract-se", action="store_true", help="Extract speaker embedding")
    parser.add_argument("--ref", help="Reference WAV path for --extract-se")
    parser.add_argument("--out", help="Output .pth path for --extract-se")
    args = parser.parse_args()

    if args.daemon:
        run_daemon()
    elif args.extract_se:
        if not args.ref or not args.out:
            parser.error("--extract-se requires --ref and --out")
        converter, _ = load_converter()
        out_path = extract_se_file(converter, args.ref, args.out)
        print(json.dumps({"ok": True, "out": out_path}), flush=True)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
