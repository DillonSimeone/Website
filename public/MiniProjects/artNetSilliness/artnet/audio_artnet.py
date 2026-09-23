import sys
import os
import time
import subprocess
import socket
import json
import threading
import webbrowser
import shutil

# ==============================================================================
# DEPENDENCY AUTO-CHECKER
# ==============================================================================
REQUIRED_PACKAGES = {
    "numpy": "numpy",
    "sounddevice": "sounddevice",
    "stupidArtnet": "stupidartnet"
}

def ensure_python_dependencies():
    missing = []
    for mod_name, pkg_name in REQUIRED_PACKAGES.items():
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg_name)
    
    if missing:
        print(f"[!] Missing required Python package(s): {', '.join(missing)}")
        print("[*] Attempting automatic installation via pip...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
            print("[+] All missing packages installed successfully!\n")
        except Exception as e:
            print(f"[!] Auto-installation failed: {e}")
            print(f"[!] Please install manually using:\n    pip install -r requirements.txt\n")
            sys.exit(1)

ensure_python_dependencies()

import numpy as np
import sounddevice as sd
from stupidArtnet import StupidArtnet

try:
    import ctypes
except ImportError:
    ctypes = None

# ==============================================================================
# CONFIGURATION
# ==============================================================================
TARGET_IP = '192.168.0.100'  # The IP of your Art-Net controller
PIXELS_PER_PORT = 300        # Pixels on one light (updated dynamically)
TOTAL_UNIVERSES_TO_SEND = 32 # Broad block of universes to broadcast to

PIXELS_PER_UNIVERSE = 170
CHANNELS_PER_UNIVERSE = 512

FPS = 45
AUDIO_SAMPLE_RATE = 44100
FFT_WINDOW_SIZE = 4096

# Visualizer parameters (updated dynamically via UDP control)
visualizer_settings = {
    "animation": "spectrum",
    "pixels": 300,
    "gain": 5.0,
    "smoothing": 0.7,
    "threshold": 0.001
}
running = True
node_process = None
settings_lock = threading.Lock()

# One light is about 300 RGB pixels, which is two Art-Net universes.
# The same frame is repeated across the remaining universes so every
# light shows the full pattern instead of a slice of a longer strip.
#
# Levels use log-spaced bands (narrower on the bass, wider on the treble),
# a fast attack, and a slow release. That is the same shaping WLED and
# Pixelblaze use. Those projects are whole programs, not a folder of
# effects this script can import.
N_BANDS = 32
BAND_MIN_HZ = 40.0
BAND_MAX_HZ = 16000.0


def _mel(hz):
    return 2595.0 * np.log10(1.0 + np.asarray(hz, dtype=float) / 700.0)


def _hz_from_mel(mel):
    return 700.0 * (np.power(10.0, np.asarray(mel, dtype=float) / 2595.0) - 1.0)


def build_band_bins(sample_rate, fft_size, n_bands=N_BANDS):
    """Mel-spaced FFT bin edges from BAND_MIN_HZ to BAND_MAX_HZ."""
    n_freq = fft_size // 2 + 1
    df = sample_rate / float(fft_size)
    edges_mel = np.linspace(_mel(BAND_MIN_HZ), _mel(BAND_MAX_HZ), n_bands + 1)
    edges_hz = _hz_from_mel(edges_mel)
    bins = np.clip(np.round(edges_hz / df).astype(int), 1, n_freq - 1)
    for i in range(1, bins.size):
        if bins[i] <= bins[i - 1]:
            bins[i] = min(n_freq - 1, int(bins[i - 1]) + 1)
    return bins


def band_energies(fft_mag, band_bins):
    power = np.square(fft_mag)
    bands = np.zeros(band_bins.size - 1, dtype=float)
    last = power.size - 1
    for i in range(bands.size):
        start = min(int(band_bins[i]), last)
        end = min(int(band_bins[i + 1]), power.size)
        if end <= start:
            end = start + 1
        chunk = power[start:end]
        bands[i] = float(np.mean(chunk)) if chunk.size else float(power[start])
    return np.log1p(bands)


def attack_release(previous, target, attack, release):
    delta = target - previous
    coeff = np.where(delta >= 0.0, attack, release)
    return previous + delta * coeff


def hsv_to_rgb_u8(h, s, v):
    h = np.mod(np.asarray(h, dtype=float), 1.0)
    s = np.clip(np.asarray(s, dtype=float), 0.0, 1.0)
    v = np.clip(np.asarray(v, dtype=float), 0.0, 1.0)
    sector = np.floor(h * 6.0).astype(np.int32) % 6
    frac = h * 6.0 - np.floor(h * 6.0)
    p = v * (1.0 - s)
    q = v * (1.0 - frac * s)
    t = v * (1.0 - (1.0 - frac) * s)
    r = np.choose(sector, [v, q, p, p, t, v])
    g = np.choose(sector, [t, v, v, q, p, p])
    b = np.choose(sector, [p, p, t, v, v, q])
    rgb = np.stack((r, g, b), axis=1)
    return np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8)


def spread_bands(bands, pixel_count):
    if pixel_count <= 1:
        return np.full(pixel_count, float(bands[len(bands) // 2]))
    x_bands = np.linspace(0.0, 1.0, bands.size)
    x_px = np.linspace(0.0, 1.0, pixel_count)
    return np.interp(x_px, x_bands, bands)


def heat_to_rgb(heat):
    h = np.clip(heat, 0.0, 1.0)
    r = np.clip(h * 3.0, 0.0, 1.0)
    g = np.clip(h * 3.0 - 1.0, 0.0, 1.0)
    b = np.clip(h * 3.0 - 2.0, 0.0, 1.0)
    rgb = np.stack((r, g, b), axis=1)
    return np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8)


class ShowState:
    def __init__(self):
        self.bands = np.zeros(N_BANDS)
        self.peaks = np.zeros(N_BANDS)
        self.agc = 0.2
        self.bass = 0.0
        self.mid = 0.0
        self.treble = 0.0
        self.rms = 0.0
        self.hue = 0.0
        self.phase = 0.0
        self.vu = 0.0
        self.vu_peak = 0.0
        self.fire = np.zeros(0)
        self.sparks = np.zeros(0)
        self.pixel_count = 0

    def resize(self, pixel_count):
        pixel_count = max(1, int(pixel_count))
        if pixel_count == self.pixel_count:
            return
        self.pixel_count = pixel_count
        self.fire = np.zeros(pixel_count)
        self.sparks = np.zeros(pixel_count)


def analyze_frame(fft_mag, audio, band_bins, gain, smoothing, threshold, state):
    """Turn one FFT into smoothed bass, mid, treble, and 32 display bands."""
    raw = band_energies(fft_mag, band_bins)
    peak = float(np.max(raw)) if raw.size else 0.0
    state.agc = max(peak, state.agc * 0.995)
    if state.agc < 1e-4:
        state.agc = 1e-4

    # Gain 5 matches the control-page default, so that position is nominal.
    norm = np.clip(raw / state.agc * (gain / 5.0), 0.0, 1.0)
    gate = float(np.clip(threshold * 40.0, 0.0, 0.6))
    norm = np.where(norm < gate, 0.0, norm)

    attack = 0.72
    release = max(0.05, (1.0 - float(smoothing)) * 0.5)
    state.bands = attack_release(state.bands, norm, attack, release)
    state.peaks = np.maximum(state.peaks - 0.012, state.bands)

    n = state.bands.size
    state.bass = float(np.mean(state.bands[:max(1, n // 8)]))
    mid = state.bands[n // 8:n // 2]
    treble = state.bands[(3 * n) // 4:]
    state.mid = float(np.mean(mid)) if mid.size else 0.0
    state.treble = float(np.mean(treble)) if treble.size else 0.0

    rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
    rms_n = float(np.clip(rms * gain * 6.0, 0.0, 1.0))
    if rms_n < gate:
        rms_n = 0.0
    state.rms = float(attack_release(np.array([state.rms]), np.array([rms_n]), attack, release)[0])


def effect_spectrum(state):
    n = state.pixel_count
    level = spread_bands(state.bands, n)
    peak = spread_bands(state.peaks, n)
    hue = np.linspace(0.0, 0.72, n)
    near_peak = (peak - level) < (1.5 / max(n, 1) + 0.02)
    value = np.where(near_peak, np.maximum(level, peak), level)
    sat = np.where(near_peak, 0.35, 1.0)
    return hsv_to_rgb_u8(hue, sat, value)


def effect_bass(state):
    n = state.pixel_count
    state.hue = (state.hue + 0.0015 + state.bass * 0.012) % 1.0
    x = np.linspace(-1.0, 1.0, n)
    bloom = np.exp(-3.0 * x * x)
    value = np.clip(0.04 + state.bass * bloom * 1.35, 0.0, 1.0)
    return hsv_to_rgb_u8(np.full(n, state.hue), np.full(n, 1.0), value)


def effect_vu(state):
    n = state.pixel_count
    state.vu = float(attack_release(np.array([state.vu]), np.array([state.rms]), 0.75, 0.14)[0])
    state.vu_peak = max(state.vu, state.vu_peak - 0.01)
    dist = np.abs(np.linspace(0.0, 1.0, n) - 0.5) * 2.0
    edge = 2.0 / n
    value = np.clip((state.vu - dist) / edge, 0.0, 1.0)
    hue = 0.33 * (1.0 - dist)
    is_peak = np.abs(dist - state.vu_peak) < (1.5 / n)
    value = np.where(is_peak, 1.0, value)
    sat = np.where(is_peak, 0.15, np.full(n, 1.0))
    return hsv_to_rgb_u8(hue, sat, value)


def effect_wave(state):
    n = state.pixel_count
    state.phase += 0.35 + state.rms * 1.6
    x = np.arange(n, dtype=float)
    dist = np.abs(x - (n - 1) / 2.0)
    wave = 0.5 + 0.5 * np.sin((dist - state.phase) * 0.35)
    hue = np.mod(0.55 + state.mid * 0.35 + dist / n * 0.2, 1.0)
    value = np.clip((0.1 + state.rms) * (0.3 + 0.7 * wave), 0.0, 1.0)
    return hsv_to_rgb_u8(hue, np.full(n, 0.9), value)


def effect_rainbow(state):
    n = state.pixel_count
    state.phase += 0.2 + state.bass * 2.2
    x = np.arange(n, dtype=float)
    hue = np.mod(x / n + state.phase / 48.0, 1.0)
    shimmer = 0.72 + 0.28 * np.sin(x * 0.17 + state.phase * 0.15)
    value = np.clip((0.2 + 0.8 * state.rms) * shimmer, 0.0, 1.0)
    return hsv_to_rgb_u8(hue, np.full(n, 1.0), value)


def effect_fire(state):
    heat = state.fire
    n = heat.size
    heat *= 0.97
    heat -= np.random.uniform(0.0, 0.02 + (1.0 - state.bass) * 0.02, size=n)
    np.clip(heat, 0.0, None, out=heat)
    if n > 2:
        diffused = heat.copy()
        diffused[1:-1] = (heat[:-2] + heat[1:-1] * 2.0 + heat[2:]) / 4.2
        diffused[-1] = (heat[-2] + heat[-1]) * 0.45
        heat[:] = np.clip(diffused, 0.0, 1.0)
    sparks = min(n, 1 + int(state.bass * 12))
    heat[:sparks] = np.maximum(
        heat[:sparks],
        np.random.uniform(0.45, 1.0, size=sparks) * (0.4 + 0.6 * state.bass)
    )
    return heat_to_rgb(heat)


def effect_sparkle(state):
    n = state.pixel_count
    state.sparks *= 0.86
    state.hue = (state.hue + 0.002) % 1.0
    if state.treble > 0.12:
        count = int(np.clip(state.treble * 16.0, 1, 20))
        idx = np.random.randint(0, n, size=count)
        state.sparks[idx] = 1.0
    bg_v = np.full(n, 0.06 + 0.08 * state.mid)
    bg = hsv_to_rgb_u8(np.full(n, state.hue), np.full(n, 0.8), bg_v).astype(float)
    spark = np.clip(state.sparks, 0.0, 1.0).reshape(n, 1)
    mixed = bg * (1.0 - spark) + 255.0 * spark
    return np.clip(np.rint(mixed), 0, 255).astype(np.uint8)


EFFECTS = {
    "spectrum": effect_spectrum,
    "bass": effect_bass,
    "vu": effect_vu,
    "wave": effect_wave,
    "rainbow": effect_rainbow,
    "fire": effect_fire,
    "sparkle": effect_sparkle,
}


def send_frame(rgb, artnet_clients):
    """Repeat one light's pixels across every pair of Art-Net universes."""
    n = int(rgb.shape[0])
    universes_per_light = max(1, int(np.ceil(n / float(PIXELS_PER_UNIVERSE))))
    flat = np.ascontiguousarray(rgb).reshape(-1)
    for univ in range(TOTAL_UNIVERSES_TO_SEND):
        u_offset = univ % universes_per_light
        pix_start = u_offset * PIXELS_PER_UNIVERSE
        pix_end = min(pix_start + PIXELS_PER_UNIVERSE, n)
        buf = bytearray(CHANNELS_PER_UNIVERSE)
        if pix_end > pix_start:
            chunk = flat[pix_start * 3:pix_end * 3]
            buf[:chunk.size] = chunk.tobytes()
        artnet_clients[univ].set(buf)
        artnet_clients[univ].show()


def is_admin():
    if sys.platform != 'win32' or ctypes is None:
        return False
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False

def relaunch_as_admin():
    if sys.platform == 'win32' and ctypes is not None:
        print("[*] Requesting Administrator privileges to configure network adapter...")
        try:
            ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
        except Exception as e:
            print(f"[!] Failed to request elevated admin privileges: {e}")
        sys.exit()

def ensure_node_dependencies():
    if not shutil.which("node"):
        print("[!] Node.js is NOT installed or NOT found in system PATH.")
        print("[!] The Web Control Panel requires Node.js to be installed (https://nodejs.org/).")
        return False
        
    if not os.path.exists("node_modules"):
        print("[*] Node modules directory not found. Running 'npm install'...")
        try:
            subprocess.run("npm install", shell=True, check=True)
            print("[+] Node.js dependencies installed successfully.")
        except Exception as e:
            print(f"[!] Warning: Failed to run 'npm install': {e}")
            return False
    return True

def get_ethernet_interface():
    """Auto-detect the first active physical Ethernet adapter name."""
    try:
        cmd = ["powershell", "-Command",
               "Get-NetAdapter -Physical | Where-Object { $_.Name -like '*Ethernet*' } | Select-Object -ExpandProperty Name"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        names = [line.strip() for line in res.stdout.split('\n') if line.strip()]
        if names:
            return names[0]
        cmd = ["powershell", "-Command",
               "Get-NetAdapter -Physical | Where-Object { $_.Name -notlike '*Wi-Fi*' } | Select-Object -ExpandProperty Name"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        names = [line.strip() for line in res.stdout.split('\n') if line.strip()]
        if names:
            return names[0]
    except Exception as e:
        print(f"[!] Error detecting network adapter: {e}")
    return None

def configure_network_ip(interface_name, static_ip="192.168.0.101", subnet_mask="255.255.255.0"):
    print(f"[*] Configuring '{interface_name}' to static IP {static_ip}...")
    try:
        cmd = f'netsh interface ipv4 set address name="{interface_name}" static {static_ip} {subnet_mask}'
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if res.returncode == 0:
            print("[+] Ethernet interface configured successfully!")
            return True
        else:
            print(f"[!] Failed to configure Ethernet: {res.stderr.strip()}")
    except Exception as e:
        print(f"[!] Error running netsh: {e}")
    return False

# Global audio buffer
audio_buffer = np.zeros(FFT_WINDOW_SIZE)

def audio_callback(indata, frames, time_info, status):
    global audio_buffer
    if status:
        print(status, file=sys.stderr)
    audio_buffer = np.roll(audio_buffer, -frames)
    audio_buffer[-frames:] = indata[:, 0]


def udp_listener_thread():
    """UDP listener to receive settings updates from Node.js Express server."""
    global visualizer_settings, running
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(('127.0.0.1', 9999))
    sock.settimeout(0.5)
    
    print("[+] UDP Control socket listening on 127.0.0.1:9999")
    
    while running:
        try:
            data, addr = sock.recvfrom(2048)
            msg = json.loads(data.decode('utf-8'))
            
            if msg.get('command') == 'shutdown':
                print("[*] Shutdown signal received from Web UI.")
                running = False
                break
                
            # Update settings safely using a Lock
            with settings_lock:
                for key in visualizer_settings:
                    if key in msg:
                        visualizer_settings[key] = msg[key]
                    
        except socket.timeout:
            continue
        except Exception as e:
            print(f"[!] Error in UDP listener: {e}")
            
    sock.close()


def main():
    global running, node_process
    
    if not is_admin():
        relaunch_as_admin()

    print("====================================================")
    print("      Art-Net Web-Controlled Audio Visualizer Engine")
    print("====================================================")
    
    # 1. Automate Ethernet Configuration
    adapter = get_ethernet_interface()
    if adapter:
        print(f"[+] Found adapter: {adapter}")
        configure_network_ip(adapter, "192.168.0.101", "255.255.255.0")
    else:
        print("[!] Warning: No physical Ethernet adapter detected. Skipping network config.")

    # 2. Start UDP listener in background
    listener_thread = threading.Thread(target=udp_listener_thread)
    listener_thread.daemon = True
    listener_thread.start()

    # 3. Start Express.js server
    node_available = ensure_node_dependencies()
    if node_available:
        print("[*] Launching Express.js control panel backend...")
        try:
            node_process = subprocess.Popen(["node", "server.js"])
            time.sleep(1.5) # Wait for server to boot up
            print("[*] Opening Control Center UI in browser...")
            webbrowser.open("http://localhost:3000")
        except Exception as e:
            print(f"[!] Failed to start Node.js server. Error: {e}")
    else:
        print("[!] Web UI backend skipped because Node.js is missing. Install Node.js from https://nodejs.org/")

    # 5. Initialize Art-Net clients
    print(f"[*] Initializing {TOTAL_UNIVERSES_TO_SEND} Art-Net clients...")
    artnet_clients = {}
    for univ in range(TOTAL_UNIVERSES_TO_SEND):
        client = StupidArtnet(TARGET_IP, univ, CHANNELS_PER_UNIVERSE, FPS, True, True)
        client.start()
        artnet_clients[univ] = client

    # 6. Setup Audio Capture
    try:
        stream = sd.InputStream(
            channels=1,
            samplerate=AUDIO_SAMPLE_RATE,
            blocksize=512,
            callback=audio_callback
        )
        stream.start()
        print("[+] Audio input stream started successfully!")
    except Exception as e:
        print(f"[!] Failed to start audio input: {e}")
        running = False

    show = ShowState()
    show.resize(visualizer_settings["pixels"])
    band_bins = build_band_bins(AUDIO_SAMPLE_RATE, FFT_WINDOW_SIZE)
    window = np.hanning(FFT_WINDOW_SIZE)

    print("\n[+] System running. Go to http://localhost:3000 to manage animations.")
    print("Press Ctrl+C to close.")

    try:
        frame_time = 1.0 / FPS
        while running:
            t_start = time.time()

            with settings_lock:
                anim = visualizer_settings["animation"]
                gain = visualizer_settings["gain"]
                smoothing = visualizer_settings["smoothing"]
                threshold = visualizer_settings["threshold"]
                target_pixels = int(visualizer_settings["pixels"])

            if target_pixels != show.pixel_count:
                print(f"[*] Dynamically resizing pixels to: {target_pixels}")
                show.resize(target_pixels)

            fft_mag = np.abs(np.fft.rfft(audio_buffer * window))
            analyze_frame(fft_mag, audio_buffer, band_bins, gain, smoothing, threshold, show)
            rgb = EFFECTS.get(anim, effect_spectrum)(show)
            send_frame(rgb, artnet_clients)

            t_elapsed = time.time() - t_start
            time.sleep(max(0.001, frame_time - t_elapsed))

    except KeyboardInterrupt:
        print("\n[*] Exiting visualizer...")
    finally:
        # Shutdown stream
        if 'stream' in locals():
            stream.stop()
            stream.close()
            
        # Stop Art-Net
        for client in artnet_clients.values():
            client.blackout()
            client.stop()
            
        # Kill server process
        if node_process:
            print("[*] Stopping Web Control Panel backend...")
            node_process.terminate()
            node_process.kill()
            
        print("[+] System closed cleanly.")

if __name__ == "__main__":
    main()
