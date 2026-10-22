import os
import sys
import json
import time
import socket
import threading
from typing import Dict, List, Optional, Callable
import requests

try:
    from zeroconf import Zeroconf, ServiceBrowser
except ImportError:
    Zeroconf = None
    ServiceBrowser = None

# Common popular WLED effects for quick fallback if /json/eff is unavailable
DEFAULT_WLED_EFFECTS = [
    "Solid",
    "Blink",
    "Breathe",
    "Wipe",
    "Rainbow",
    "Colorloop",
    "Fire 2012",
    "Twinkle",
    "Android",
    "Chase",
    "Scanner",
    "Lightning",
    "Juggle",
    "Palette"
]

class WLEDDevice:
    def __init__(self, ip: str, name: str = "WLED Light"):
        self.ip = ip
        self.name = name
        self.is_online = True
        self.is_on = True
        self.brightness = 100 # 0-100%
        self.active_effect_idx = 0
        self.active_effect_name = "Solid"
        self.effects: List[str] = list(DEFAULT_WLED_EFFECTS)
        self.color_rgb = (255, 255, 255)
        self.last_seen = time.time()

class WLEDManager:
    def __init__(self, on_devices_changed: Optional[Callable[[], None]] = None):
        self.devices: Dict[str, WLEDDevice] = {} # ip -> device
        self.on_devices_changed = on_devices_changed
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._zc = None
        self._browser = None
        self._udp_thread = None

        # Load cached IPs
        self.cache_file = os.path.join(
            os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(__file__),
            "wled_cache.json"
        )
        self._load_cache()

    def _load_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r") as f:
                    cached = json.load(f)
                    for ip, info in cached.items():
                        self.devices[ip] = WLEDDevice(
                            ip=ip, 
                            name=info.get("name", "WLED Light")
                        )
            except Exception as e:
                print(f"[WLED Cache Load Error] {e}")

    def _save_cache(self):
        try:
            cached = {}
            with self._lock:
                for ip, dev in self.devices.items():
                    cached[ip] = {"name": dev.name}
            with open(self.cache_file, "w") as f:
                json.dump(cached, f, indent=2)
        except Exception as e:
            print(f"[WLED Cache Save Error] {e}")

    def start_discovery(self):
        """Starts mDNS and UDP listener for WLED discovery."""
        self._stop_event.clear()

        # 1. Start mDNS Browser if zeroconf is available
        if Zeroconf and not self._zc:
            try:
                self._zc = Zeroconf()
                class WLEDListener:
                    def __init__(self, mgr):
                        self.mgr = mgr
                    def add_service(self, zc, type_, name):
                        info = zc.get_service_info(type_, name)
                        if info and info.addresses:
                            ip = socket.inet_ntoa(info.addresses[0])
                            dev_name = name.split(".")[0].replace("_", " ")
                            self.mgr._on_device_discovered(ip, dev_name)
                    def update_service(self, zc, type_, name):
                        pass
                    def remove_service(self, zc, type_, name):
                        pass

                self._browser = ServiceBrowser(self._zc, "_wled._tcp.local.", WLEDListener(self))
            except Exception as e:
                print(f"[WLED Zeroconf Error] {e}")

        # 2. Start UDP Sync Listener (port 65506)
        if not self._udp_thread or not self._udp_thread.is_alive():
            self._udp_thread = threading.Thread(target=self._listen_udp_sync, daemon=True)
            self._udp_thread.start()

        # Refresh known/cached devices
        threading.Thread(target=self.refresh_all_devices, daemon=True).start()

    def stop_discovery(self):
        self._stop_event.set()
        if self._zc:
            try:
                self._zc.close()
            except Exception:
                pass
            self._zc = None

    def _listen_udp_sync(self):
        """Listens on UDP port 65506 for WLED broadcast sync packets."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.bind(('', 65506))
            s.settimeout(2.0)
        except Exception as e:
            print(f"[WLED UDP Bind Error] {e}")
            return

        while not self._stop_event.is_set():
            try:
                data, addr = s.recvfrom(1024)
                ip = addr[0]
                self._on_device_discovered(ip, f"WLED ({ip})")
            except socket.timeout:
                continue
            except Exception:
                time.sleep(1)
        s.close()

    def _on_device_discovered(self, ip: str, name: str = "WLED"):
        with self._lock:
            if ip not in self.devices:
                dev = WLEDDevice(ip=ip, name=name)
                self.devices[ip] = dev
                self._save_cache()
                threading.Thread(target=self.refresh_device, args=(dev,), daemon=True).start()
            else:
                self.devices[ip].last_seen = time.time()
                self.devices[ip].is_online = True

    def add_manual_ip(self, ip: str) -> bool:
        ip = ip.strip()
        if not ip:
            return False
        with self._lock:
            if ip not in self.devices:
                self.devices[ip] = WLEDDevice(ip=ip, name=f"WLED ({ip})")
        dev = self.devices[ip]
        success = self.refresh_device(dev)
        if success:
            self._save_cache()
            if self.on_devices_changed:
                self.on_devices_changed()
        return success

    def refresh_device(self, dev: WLEDDevice) -> bool:
        """Fetch WLED state, name, and effects list."""
        try:
            # 1. Fetch info and state
            r = requests.get(f"http://{dev.ip}/json", timeout=3)
            if r.status_code == 200:
                data = r.json()
                info = data.get("info", {})
                state = data.get("state", {})
                dev.name = info.get("name") or dev.name
                dev.is_on = bool(state.get("on", True))
                bri_val = state.get("bri", 255)
                dev.brightness = max(0, min(100, int((bri_val / 255.0) * 100)))

                # Effects
                effects = data.get("effects")
                if effects and isinstance(effects, list):
                    dev.effects = effects

                # Active effect
                segs = state.get("seg", [])
                if segs and isinstance(segs, list) and len(segs) > 0:
                    fx_idx = segs[0].get("fx", 0)
                    dev.active_effect_idx = fx_idx
                    if fx_idx < len(dev.effects):
                        dev.active_effect_name = dev.effects[fx_idx]

                    # Color
                    col = segs[0].get("col")
                    if col and len(col) > 0 and len(col[0]) >= 3:
                        dev.color_rgb = (col[0][0], col[0][1], col[0][2])

                dev.is_online = True
                found_ok = True
            else:
                found_ok = False
        except Exception as e:
            print(f"[WLED Refresh Error] {dev.ip}: {e}")
            dev.is_online = False
            return False

        if found_ok and self.on_devices_changed:
            try:
                self.on_devices_changed()
            except Exception:
                pass
        return found_ok

    def set_power(self, ip: str, on: bool):
        dev = self.devices.get(ip)
        if not dev:
            return
        dev.is_on = on

        def _send():
            try:
                requests.post(f"http://{dev.ip}/json/state", json={"on": on}, timeout=2)
            except Exception as e:
                print(f"[WLED Power Error] {dev.ip}: {e}")

        threading.Thread(target=_send, daemon=True).start()

    def set_brightness(self, ip: str, pct: int):
        dev = self.devices.get(ip)
        if not dev:
            return
        pct = max(0, min(100, int(pct)))
        dev.brightness = pct
        bri_255 = int((pct / 100.0) * 255)
        if pct > 0:
            dev.is_on = True

        def _send():
            try:
                requests.post(
                    f"http://{dev.ip}/json/state", 
                    json={"on": dev.is_on, "bri": bri_255}, 
                    timeout=2
                )
            except Exception as e:
                print(f"[WLED Brightness Error] {dev.ip}: {e}")

        threading.Thread(target=_send, daemon=True).start()

    def set_effect(self, ip: str, effect_name: str):
        dev = self.devices.get(ip)
        if not dev:
            return
        fx_idx = 0
        if effect_name in dev.effects:
            fx_idx = dev.effects.index(effect_name)
        dev.active_effect_idx = fx_idx
        dev.active_effect_name = effect_name
        dev.is_on = True

        def _send():
            try:
                requests.post(
                    f"http://{dev.ip}/json/state", 
                    json={"on": True, "seg": [{"fx": fx_idx}]}, 
                    timeout=2
                )
            except Exception as e:
                print(f"[WLED Effect Error] {dev.ip}: {e}")

        threading.Thread(target=_send, daemon=True).start()

    def set_color(self, ip: str, r: int, g: int, b: int):
        dev = self.devices.get(ip)
        if not dev:
            return
        dev.color_rgb = (r, g, b)
        dev.is_on = True

        def _send():
            try:
                requests.post(
                    f"http://{dev.ip}/json/state", 
                    json={"on": True, "seg": [{"col": [[r, g, b]]}]}, 
                    timeout=2
                )
            except Exception as e:
                print(f"[WLED Color Error] {dev.ip}: {e}")

        threading.Thread(target=_send, daemon=True).start()

    def refresh_all_devices(self):
        for dev in list(self.devices.values()):
            self.refresh_device(dev)
