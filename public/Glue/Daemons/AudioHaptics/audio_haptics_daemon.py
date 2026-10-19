"""
Audio to Haptic Daemon (Gestolumina PWM & Multi-Band Engine)
Captures desktop system audio in real-time via WASAPI loopback,
applies multi-band frequency analysis (Sub-Bass, Punch, and Snap)
with Gestolumina-style adaptive AGC and dual-EMA onset detection,
and renders true analog PWM envelopes and haptic primitives on the Pixel 6a.
Supports real-time dynamic config reloading without dropping audio frames.
"""

import os
import sys
import time
import json
import signal
import atexit
import ctypes
import threading
import subprocess
import socket
from typing import Optional, Tuple

import numpy as np
from scipy import signal as dsp_signal
import pyaudiowpatch as pyaudio

# --- Paths & Constants ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "haptics.log")
PID_FILE = os.path.join(BASE_DIR, "haptics.pid")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
MUTEX_NAME = "Global\\AudioHapticsDaemon_Gestolumina_SingleInstance"


def log(msg: str):
    timestamp = time.strftime("[%Y-%m-%d %H:%M:%S]")
    line = f"{timestamp} {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def get_adb_path() -> str:
    local_adb = os.path.abspath(
        os.path.join(BASE_DIR, "..", "USBTethering", "platform-tools", "adb.exe")
    )
    if os.path.exists(local_adb):
        return local_adb
    return "adb.exe"


def acquire_single_instance_mutex():
    try:
        kernel32 = ctypes.windll.kernel32
        mutex = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            return False
        return True
    except Exception:
        return True


class GoveeAudioSyncBridge:
    """Non-blocking background bridge to pulse Govee smart lights on audio transients."""
    def __init__(self):
        self.last_pulse_time = 0.0
        self.manager = None
        self.initialized = False
        self._busy = False
        self._init_lock = threading.Lock()
        # Pre-initialize in background thread to avoid drop on first audio hit
        threading.Thread(target=self._init_manager, daemon=True).start()

    def _init_manager(self):
        with self._init_lock:
            if self.manager is not None:
                return
            try:
                govee_path = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "..", "MiniProjects", "goveeLightsControls"))
                if not os.path.isdir(govee_path):
                    log(f"[GoveeSync] Path not found: {govee_path}")
                    return
                if govee_path not in sys.path:
                    sys.path.insert(0, govee_path)
                from govee_api import GoveeManager
                self.manager = GoveeManager()
                self.manager.refresh_devices()
                self.manager.scan_lan(timeout=1.0)
                self.initialized = True
                devs = [f"{d.name} ({'LAN' if d.lan_ip else 'Cloud'})" for d in self.manager.devices.values()]
                log(f"[GoveeSync] Successfully initialized Govee bridge. Discovered {len(devs)} device(s): {', '.join(devs)}")
            except Exception as e:
                log(f"[GoveeSync Init Error] {e}")

    def trigger_hit(self, velocity: float, peak_amp: int, is_deep_sub: bool):
        now = time.time()
        has_lan = bool(self.manager and any(d.lan_ip for d in self.manager.devices.values()))
        cooldown = 0.16 if has_lan else 1.2
        if now - self.last_pulse_time < cooldown or self._busy:
            return
        self.last_pulse_time = now
        self._busy = True
        threading.Thread(target=self._do_pulse, args=(velocity, peak_amp, is_deep_sub, has_lan), daemon=True).start()

    def _do_pulse(self, velocity: float, peak_amp: int, is_deep_sub: bool, has_lan: bool):
        try:
            if not self.initialized:
                self._init_manager()

            if not self.manager or not self.manager.devices:
                return

            # Sub-bass: Vibrant Magenta/Pink (255, 42, 133); Punch / Snare: Cyan (0, 200, 255)
            r, g, b = (255, 42, 133) if is_deep_sub else (0, 200, 255)
            pulse_brightness = min(100, max(50, int(peak_amp / 255.0 * 100)))

            for mac in list(self.manager.devices.keys()):
                self.manager.set_brightness(mac, pulse_brightness, debounce=False)
                self.manager.set_color_rgb(mac, r, g, b)

            if has_lan:
                time.sleep(0.14)
                # Return smoothly to calm ambient floor (15%)
                for mac in list(self.manager.devices.keys()):
                    self.manager.set_brightness(mac, 15, debounce=False)
        except Exception as e:
            log(f"[GoveeSync Pulse Error] {e}")
        finally:
            self._busy = False


class GestoluminaAudioHapticsDaemon:
    def __init__(self):
        self.adb = get_adb_path()
        self.running = True
        self.adb_shell: Optional[subprocess.Popen] = None
        self.lock = threading.Lock()

        # Default configuration with tactile punch authority
        self.config = {
            "enabled": True,
            "amplitude_scale": 2.0,
            "base_amplitude": 70,
            "punch_duration_ms": 90,
            "noise_floor": 0.010,
            "min_velocity": 0.018,
            "enable_snap_primitives": True,
            "sub_bass_low_hz": 30,
            "sub_bass_high_hz": 90,
            "mid_punch_high_hz": 220,
            "snap_high_hz": 1200,
            "mode": "gestolumina_pwm",
            "govee_sync": False,
        }
        self.last_config_mtime = 0.0
        self.last_config_check = 0.0
        self._load_config()

        # Non-blocking Govee smart light audio sync bridge
        self.govee_bridge = GoveeAudioSyncBridge()

        # Localhost UDP Telemetry Broadcaster (Port 48123)
        self.udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.udp_target = ("127.0.0.1", 48123)
        self.last_telemetry_time = 0.0

        # Dynamic PWM Envelope & Visualizer State
        self.current_peak_amp = 0
        self.current_envelope_end = 0.0
        self.total_envelope_ms = 0
        self.last_hit_triggered = False

        # Audio stream variables
        self.pa = pyaudio.PyAudio()
        self.stream = None
        self.sample_rate = 48000
        self.channels = 2

        # DSP Filterbank (Sub-Bass, Punch, and Snap)
        self._init_filters()

        # Gestolumina AGC & Dual Exponential Moving Average state
        self.bass_slow_ema = 0.01
        self.bass_fast_ema = 0.01
        self.last_fast_ema = 0.01
        self.max_bass = 0.05

        # Timing and telemetry
        self.cooldown_until = 0.0
        self.trigger_count = 0
        self.last_log_time = time.time()

        # Start persistent ADB Shell pipeline
        self._init_adb_shell()

    def _load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                self.last_config_mtime = os.path.getmtime(CONFIG_FILE)
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.config.update(data)
            except Exception:
                pass

    def _init_filters(self):
        nyquist = self.sample_rate * 0.5
        sub_low = max(0.001, min(0.94, self.config.get("sub_bass_low_hz", 30) / nyquist))
        sub_high = max(sub_low + 0.01, min(0.95, self.config.get("sub_bass_high_hz", 85) / nyquist))
        punch_high = max(sub_high + 0.01, min(0.96, self.config.get("mid_punch_high_hz", 220) / nyquist))
        snap_high = max(punch_high + 0.01, min(0.97, self.config.get("snap_high_hz", 1200) / nyquist))

        # 2nd-order Butterworth bandpass filters
        self.b_sub, self.a_sub = dsp_signal.butter(2, [sub_low, sub_high], btype="band")
        self.b_punch, self.a_punch = dsp_signal.butter(2, [sub_high, punch_high], btype="band")
        self.b_snap, self.a_snap = dsp_signal.butter(2, [punch_high, snap_high], btype="band")

        self.zi_sub = dsp_signal.lfilter_zi(self.b_sub, self.a_sub)
        self.zi_punch = dsp_signal.lfilter_zi(self.b_punch, self.a_punch)
        self.zi_snap = dsp_signal.lfilter_zi(self.b_snap, self.a_snap)

    def _init_adb_shell(self):
        with self.lock:
            if self.adb_shell:
                try:
                    self.adb_shell.terminate()
                except Exception:
                    pass
                self.adb_shell = None

            try:
                subprocess.run(
                    [self.adb, "start-server"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
                )
                self.adb_shell = subprocess.Popen(
                    [self.adb, "shell"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
                )
            except Exception as e:
                log(f"Failed to open persistent ADB shell: {e}")

    def send_command(self, cmd: str):
        with self.lock:
            if not self.adb_shell or self.adb_shell.poll() is not None:
                self._init_adb_shell()

            if self.adb_shell and self.adb_shell.stdin:
                try:
                    self.adb_shell.stdin.write(cmd)
                    self.adb_shell.stdin.flush()
                    self.trigger_count += 1
                except Exception:
                    self._init_adb_shell()

    def _build_envelope(self, v: float, is_snap: bool, is_deep_sub: bool) -> Tuple[str, int, int]:
        """
        Builds a multi-stage continuous PWM ramp or native hardware primitive
        with tactile authority and resonant LRA hold times.
        Returns: (command_string, total_duration_ms, peak_amplitude)
        """
        punch_dur = int(self.config.get("punch_duration_ms", 90))
        base_amp = int(self.config.get("base_amplitude", 70))
        scale = float(self.config.get("amplitude_scale", 2.0))

        if is_snap and v < 0.45:
            # Crisp percussive snap for snares and transients
            prim_scale = round(min(1.0, 0.40 + v * 0.60), 2)
            prim_id = 7 if v < 0.22 else 1  # 7=TICK (26ms), 1=CLICK (45ms)
            dur = 26 if prim_id == 7 else 45
            peak_amp = int(prim_scale * 255)
            return f"cmd vibrator_manager synced -f -B primitives {prim_id} {prim_scale}\n", dur, peak_amp

        # S-curve velocity to peak amplitude with generous base floor
        v_eff = min(1.0, max(0.05, (v ** 0.75) * (scale / 1.6)))
        peak_amp = int(min(255, max(base_amp, base_amp + (255 - base_amp) * v_eff)))

        if peak_amp < 110:
            # Low-intensity tactile flutter (soft acoustic tap, gentle bass note)
            # Ensure at least 45ms hold for the LRA mass to overcome inertia
            hold_ms = max(40, int(punch_dur * 0.55))
            a1 = max(25, int(peak_amp * 0.55))
            a2 = peak_amp
            a3 = max(15, int(peak_amp * 0.35))
            dur = 8 + hold_ms + 18 + 8
            return f"cmd vibrator_manager synced -f -B waveform -a -c 8 {a1} {hold_ms} {a2} 18 {a3} 8 0\n", dur, peak_amp

        elif peak_amp < 190:
            # Medium-intensity punch (standard kick drum, bass guitar pluck)
            hold_ms = max(60, punch_dur)
            a1 = max(40, int(peak_amp * 0.55))
            a2 = peak_amp
            a3 = max(25, int(peak_amp * 0.42))
            a4 = max(12, int(peak_amp * 0.22))
            dur = 10 + hold_ms + 24 + 14 + 8
            return f"cmd vibrator_manager synced -f -B waveform -a -c 10 {a1} {hold_ms} {a2} 24 {a3} 14 {a4} 8 0\n", dur, peak_amp

        else:
            # Heavy-intensity impact (heavy 808 kick, sub drop, cinematic explosion)
            # Resonant peak hold of 90ms-125ms gives full physical rumble
            hold_ms = max(80, int(punch_dur * (1.25 if is_deep_sub else 1.05)))
            a1 = int(peak_amp * 0.60)
            a2 = peak_amp
            a3 = int(peak_amp * 0.50)
            a4 = int(peak_amp * 0.28)
            dur = 12 + hold_ms + 28 + 18 + 8
            return f"cmd vibrator_manager synced -f -B waveform -a -c 12 {a1} {hold_ms} {a2} 28 {a3} 18 {a4} 8 0\n", dur, peak_amp

    def _audio_callback(self, in_data, frame_count, time_info, status_flags):
        try:
            now = time.time()

            # Dynamic config reload check every 250ms
            if now - self.last_config_check >= 0.25:
                self.last_config_check = now
                if os.path.exists(CONFIG_FILE):
                    try:
                        mtime = os.path.getmtime(CONFIG_FILE)
                        if mtime > self.last_config_mtime:
                            self._load_config()
                            self._init_filters()
                            log(f"Config updated dynamically: Scale={self.config.get('amplitude_scale')}x, BaseAmp={self.config.get('base_amplitude')}, PunchDur={self.config.get('punch_duration_ms')}ms, Enabled={self.config.get('enabled')}")
                    except Exception:
                        pass

            # Convert binary audio buffer to numpy float32
            audio_data = np.frombuffer(in_data, dtype=np.float32)
            if self.channels > 1:
                audio_data = audio_data.reshape(-1, self.channels).mean(axis=1)

            # Apply 3-Band IIR Filterbank
            f_sub, self.zi_sub = dsp_signal.lfilter(self.b_sub, self.a_sub, audio_data, zi=self.zi_sub)
            f_punch, self.zi_punch = dsp_signal.lfilter(self.b_punch, self.a_punch, audio_data, zi=self.zi_punch)
            f_snap, self.zi_snap = dsp_signal.lfilter(self.b_snap, self.a_snap, audio_data, zi=self.zi_snap)

            # Calculate band energies (RMS + Peak blend)
            sub_energy = float(0.5 * np.sqrt(np.mean(f_sub ** 2)) + 0.5 * np.max(np.abs(f_sub)))
            punch_energy = float(0.5 * np.sqrt(np.mean(f_punch ** 2)) + 0.5 * np.max(np.abs(f_punch)))
            snap_energy = float(0.5 * np.sqrt(np.mean(f_snap ** 2)) + 0.5 * np.max(np.abs(f_snap)))

            # Composite bass energy
            bass_energy = sub_energy * 0.65 + punch_energy * 0.35

            # Gestolumina Dual EMA Tracking
            self.bass_slow_ema = 0.992 * self.bass_slow_ema + 0.008 * bass_energy
            self.bass_fast_ema = 0.70 * self.bass_fast_ema + 0.30 * bass_energy

            # Automatic Gain Control (AGC) - adaptive dynamic headroom
            noise_floor = self.config.get("noise_floor", 0.010)
            if bass_energy > self.max_bass:
                self.max_bass = bass_energy
            elif self.max_bass > (3.0 * self.bass_slow_ema) and self.max_bass > noise_floor:
                self.max_bass *= 0.995

            # Calculate transient onset velocity
            surge = max(0.0, self.bass_fast_ema - self.bass_slow_ema)
            rise = max(0.0, self.bass_fast_ema - self.last_fast_ema)
            self.last_fast_ema = self.bass_fast_ema

            headroom = max(noise_floor, self.max_bass)
            velocity = (0.5 * rise + 0.5 * surge) / max(0.005, headroom * 0.35)

            min_vel = self.config.get("min_velocity", 0.018)
            is_enabled = bool(self.config.get("enabled", True))
            govee_sync = bool(self.config.get("govee_sync", False))
            hit_this_frame = False

            # Trigger condition: sudden upward surge above ambient floor (evaluates when either haptics or Govee sync is enabled)
            if (is_enabled or govee_sync) and now >= self.cooldown_until and velocity > min_vel and bass_energy > (1.15 * self.bass_slow_ema):
                scale = self.config.get("amplitude_scale", 2.0)
                norm_v = min(1.0, max(0.0, (velocity - min_vel) / (0.75 - min_vel)))
                v_curved = min(1.0, max(0.05, (norm_v ** 0.85) * scale))

                is_snap = (
                    self.config.get("enable_snap_primitives", True)
                    and (snap_energy > punch_energy * 1.3)
                    and (snap_energy > sub_energy * 1.8)
                )

                is_deep_sub = sub_energy > (punch_energy * 1.25)

                cmd, duration_ms, peak_amp = self._build_envelope(v_curved, is_snap, is_deep_sub)
                if is_enabled:
                    self.send_command(cmd)

                if govee_sync:
                    self.govee_bridge.trigger_hit(v_curved, peak_amp, is_deep_sub)

                self.current_peak_amp = peak_amp
                self.current_envelope_end = now + duration_ms / 1000.0
                self.total_envelope_ms = duration_ms
                hit_this_frame = True

                # Set anti-collision cooldown to exact envelope length + safety padding (16ms)
                self.cooldown_until = now + (duration_ms + 16) / 1000.0

            # Calculate dynamic active PWM duty cycle (0 - 100%)
            if now < self.current_envelope_end and self.total_envelope_ms > 0:
                rem = max(0.0, (self.current_envelope_end - now) / (self.total_envelope_ms / 1000.0))
                active_pwm = int((self.current_peak_amp / 255.0) * 100 * (rem ** 0.5))
            else:
                active_pwm = 0

            # Localhost UDP Telemetry Stream (35-40 FPS)
            if now - self.last_telemetry_time >= 0.025:
                self.last_telemetry_time = now
                try:
                    payload = json.dumps({
                        "energy": round(bass_energy, 4),
                        "sub": round(sub_energy, 4),
                        "punch": round(punch_energy, 4),
                        "snap": round(snap_energy, 4),
                        "vel": round(velocity, 4),
                        "pwm": active_pwm,
                        "hit": hit_this_frame,
                        "peak": self.current_peak_amp if active_pwm > 0 else 0,
                        "enabled": is_enabled,
                    }).encode("utf-8")
                    self.udp_sock.sendto(payload, self.udp_target)
                except Exception:
                    pass

            # Periodic status logging every 2 minutes
            if now - self.last_log_time >= 120.0:
                self.last_log_time = now
                log(f"AudioHaptics active: {self.trigger_count} haptic hits delivered. Headroom: {self.max_bass:.4f}, Baseline: {self.bass_slow_ema:.4f}")

        except Exception:
            pass

        return (None, pyaudio.paContinue)

    def run(self):
        log("=" * 60)
        log("Audio to Haptic Daemon (Gestolumina PWM Engine) starting...")
        log("=" * 60)

        # Locate WASAPI Default Output Device and its Loopback Twin
        loopback_device = None
        try:
            wasapi_info = self.pa.get_host_api_info_by_type(pyaudio.paWASAPI)
            default_out = self.pa.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
            log(f"Default Windows Audio Endpoint: {default_out['name']}")

            for dev in self.pa.get_loopback_device_info_generator():
                if default_out["name"] in dev["name"]:
                    loopback_device = dev
                    break

            if not loopback_device:
                for dev in self.pa.get_loopback_device_info_generator():
                    loopback_device = dev
                    break
        except Exception as e:
            log(f"Error enumerating audio loopback endpoints: {e}")

        if not loopback_device:
            log("Error: No WASAPI Loopback audio device could be found.")
            return

        log(f"Selected Loopback Capture Device: {loopback_device['name']}")
        self.sample_rate = int(loopback_device["defaultSampleRate"])
        self.channels = int(loopback_device["maxInputChannels"])

        # Re-initialize filters with exact sample rate
        self._init_filters()

        try:
            self.stream = self.pa.open(
                format=pyaudio.paFloat32,
                channels=self.channels,
                rate=self.sample_rate,
                input=True,
                input_device_index=loopback_device["index"],
                frames_per_buffer=512,
                stream_callback=self._audio_callback,
            )
            log("Gestolumina PWM Haptic Engine active. Dynamic range: 0% to 100% duty cycle.")
        except Exception as e:
            log(f"Failed to open audio stream: {e}")
            return

        while self.running:
            time.sleep(0.5)

    def stop(self):
        self.running = False
        try:
            if self.stream:
                self.stream.stop_stream()
                self.stream.close()
        except Exception:
            pass
        try:
            self.pa.terminate()
        except Exception:
            pass
        with self.lock:
            if self.adb_shell:
                try:
                    self.adb_shell.terminate()
                except Exception:
                    pass
                self.adb_shell = None
        log("Audio to Haptic Daemon stopped cleanly.")


def main():
    if not acquire_single_instance_mutex():
        log("Another instance of audio_haptics_daemon is already running. Exiting.")
        sys.exit(0)

    with open(PID_FILE, "w", encoding="utf-8") as f:
        f.write(str(os.getpid()))

    def cleanup():
        try:
            if os.path.exists(PID_FILE):
                os.remove(PID_FILE)
        except Exception:
            pass

    atexit.register(cleanup)

    daemon = GestoluminaAudioHapticsDaemon()

    def signal_handler(signum, frame):
        daemon.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        daemon.run()
    except KeyboardInterrupt:
        daemon.stop()


if __name__ == "__main__":
    main()
