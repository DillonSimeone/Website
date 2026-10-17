import os
import sys
import json
import time
import socket
import select
import struct
import threading
import concurrent.futures
from typing import Dict, List, Optional, Callable
import requests

try:
    import websocket
except ImportError:
    websocket = None

DISCOVERY_URLS = [
    "http://discover.electromage.com/discover",
    "https://discover.electromage.com/discover"
]

class PixelblazeDevice:
    def __init__(self, ip: str, name: str = "Pixelblaze", device_id: str = ""):
        self.ip = ip
        self.name = name
        self.device_id = device_id
        self.is_online = True
        self.is_on = True
        self.brightness = 100  # 0-100%
        self.saved_brightness = 100
        self.active_pattern_id = ""
        self.active_pattern_name = ""
        self.patterns: Dict[str, str] = {}  # id -> name
        self.last_seen = time.time()


class PixelblazeWsClient:
    """Persistent, robust WebSocket connection manager for Pixelblaze (port 81)."""
    def __init__(self, ip: str):
        self.ip = ip
        self._ws = None
        self._lock = threading.Lock()

    def _open(self):
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
            self._ws = None

        if not websocket:
            return

        self._ws = websocket.create_connection(
            f"ws://{self.ip}:81",
            sockopt=((socket.SOL_SOCKET, socket.SO_REUSEADDR, 1), (socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)),
            timeout=2.5
        )

    def _drain(self):
        if not self._ws:
            return
        while True:
            r, _, _ = select.select([self._ws.sock], [], [], 0)
            if not r:
                break
            self._ws.recv()

    def send_cmd(self, cmd_dict: dict, wait_response: bool = False) -> bool:
        if not websocket:
            return False

        with self._lock:
            for attempt in range(2):
                try:
                    if not self._ws or not getattr(self._ws, "connected", False):
                        self._open()

                    self._drain()
                    payload = json.dumps(cmd_dict, separators=(",", ":")).encode("utf-8")
                    self._ws.send(payload)

                    if wait_response:
                        self._ws.settimeout(1.0)
                        try:
                            self._ws.recv()
                        except Exception:
                            pass
                    return True
                except Exception as e:
                    print(f"[Pixelblaze WS] {self.ip} attempt {attempt+1} error: {e}")
                    if self._ws:
                        try:
                            self._ws.close()
                        except Exception:
                            pass
                    self._ws = None
                    time.sleep(0.15)

            # Auto-recovery if ESP32 socket is exhausted: reboot network stack via HTTP
            try:
                print(f"[Pixelblaze WS] Auto-recovering {self.ip} via HTTP /reboot...")
                requests.post(f"http://{self.ip}/reboot", timeout=1.5)
            except Exception:
                pass
            return False

    def close(self):
        with self._lock:
            if self._ws:
                try:
                    self._ws.close()
                except Exception:
                    pass
                self._ws = None


class PixelblazeManager:
    def __init__(self, on_devices_changed: Optional[Callable[[], None]] = None):
        self.devices: Dict[str, PixelblazeDevice] = {}  # ip -> device
        self.on_devices_changed = on_devices_changed
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._listener_thread = None
        self._cloud_thread = None

        self._clients: Dict[str, PixelblazeWsClient] = {}
        self._client_lock = threading.Lock()

        # Load cached IPs and patterns
        self.cache_file = os.path.join(
            os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(__file__),
            "pixelblaze_cache.json"
        )
        self._load_cache()

    def _get_client(self, ip: str) -> PixelblazeWsClient:
        with self._client_lock:
            if ip not in self._clients:
                self._clients[ip] = PixelblazeWsClient(ip)
            return self._clients[ip]

    def _load_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    for ip, info in cached.items():
                        dev = PixelblazeDevice(
                            ip=ip, 
                            name=info.get("name", "Pixelblaze"),
                            device_id=info.get("id", "")
                        )
                        patterns = info.get("patterns")
                        if patterns and isinstance(patterns, dict):
                            dev.patterns = dict(patterns)
                        self.devices[ip] = dev
            except Exception as e:
                print(f"[Pixelblaze Cache Load Error] {e}")

    def _save_cache(self):
        try:
            cached = {}
            with self._lock:
                for ip, dev in self.devices.items():
                    cached[ip] = {
                        "name": dev.name, 
                        "id": dev.device_id,
                        "patterns": dev.patterns
                    }
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(cached, f, indent=2)
        except Exception as e:
            print(f"[Pixelblaze Cache Save Error] {e}")

    def start_discovery(self):
        """Starts multi-mode discovery: Cloud Service, Subnet Scan, and UDP Listener."""
        self._stop_event.clear()

        # 1. Start Cloud Discovery and periodic check
        if not self._cloud_thread or not self._cloud_thread.is_alive():
            self._cloud_thread = threading.Thread(target=self._discovery_loop, daemon=True)
            self._cloud_thread.start()

        # 2. Start UDP Beacon listener (port 1889)
        if not self._listener_thread or not self._listener_thread.is_alive():
            self._listener_thread = threading.Thread(target=self._listen_beacons, daemon=True)
            self._listener_thread.start()

        # 3. Query all cached devices immediately
        threading.Thread(target=self.refresh_all_devices, daemon=True).start()

    def stop_discovery(self):
        self._stop_event.set()

    def close(self):
        self.stop_discovery()
        with self._client_lock:
            for c in self._clients.values():
                c.close()
            self._clients.clear()

    def _discovery_loop(self):
        """Periodically queries official Pixelblaze Discovery Service and sweeps subnet."""
        self.discover_cloud()
        if not self.devices:
            self.discover_subnet()

        while not self._stop_event.is_set():
            for _ in range(30):
                if self._stop_event.is_set():
                    return
                time.sleep(1)
            self.discover_cloud()

    def discover_cloud(self) -> bool:
        """
        Queries official ElectroMage Pixelblaze Discovery Service (discover.electromage.com/discover).
        The cloud broker matches public IP and returns local private IPs of all registered controllers.
        """
        for url in DISCOVERY_URLS:
            try:
                r = requests.get(url, timeout=4)
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, list):
                        new_found = False
                        for item in data:
                            local_ip = item.get("localIp")
                            if local_ip:
                                name = item.get("name") or "Pixelblaze"
                                dev_id = item.get("id") or ""
                                with self._lock:
                                    if local_ip not in self.devices:
                                        self.devices[local_ip] = PixelblazeDevice(
                                            ip=local_ip,
                                            name=name,
                                            device_id=dev_id
                                        )
                                        new_found = True
                                dev = self.devices[local_ip]
                                threading.Thread(target=self.refresh_device, args=(dev,), daemon=True).start()
                        if new_found:
                            self._save_cache()
                        return True
            except Exception:
                pass
        return False

    def discover_subnet(self):
        """Fast concurrent sweep of local subnet(s) checking for Pixelblaze /config.json."""
        subnets_to_check = set()
        
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            prefix = ".".join(local_ip.split(".")[:3]) + "."
            subnets_to_check.add(prefix)
        except Exception:
            pass

        subnets_to_check.add("192.168.1.")
        subnets_to_check.add("192.168.0.")

        def check_host(ip):
            try:
                r = requests.get(f"http://{ip}/config.json", timeout=0.8)
                if r.status_code == 200:
                    cfg = r.json()
                    if "name" in cfg or "pixelCount" in cfg or "lastProgramPath" in cfg:
                        name = cfg.get("name") or f"Pixelblaze ({ip})"
                        return ip, name
            except Exception:
                pass
            return None

        for prefix in subnets_to_check:
            if self._stop_event.is_set():
                break
            with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
                futures = [executor.submit(check_host, f"{prefix}{i}") for i in range(1, 255)]
                for future in concurrent.futures.as_completed(futures):
                    res = future.result()
                    if res:
                        ip, name = res
                        with self._lock:
                            if ip not in self.devices:
                                self.devices[ip] = PixelblazeDevice(ip=ip, name=name)
                                self._save_cache()
                        dev = self.devices[ip]
                        threading.Thread(target=self.refresh_device, args=(dev,), daemon=True).start()

    def _listen_beacons(self):
        """Listens on UDP port 1889 for legacy beacon packets."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.bind(("", 1889))
            s.settimeout(2.0)
        except Exception:
            return

        while not self._stop_event.is_set():
            try:
                data, addr = s.recvfrom(2048)
                ip = addr[0]
                dev_name = "Pixelblaze"
                dev_id = ""
                if len(data) >= 12 and data[:4] == b"BLZN":
                    try:
                        name_str = data[12:].decode("utf-8", errors="ignore").split("\x00")[0]
                        if name_str.strip():
                            dev_name = name_str.strip()
                    except Exception:
                        pass
                
                with self._lock:
                    if ip not in self.devices:
                        dev = PixelblazeDevice(ip=ip, name=dev_name, device_id=dev_id)
                        self.devices[ip] = dev
                        self._save_cache()
                        threading.Thread(target=self.refresh_device, args=(dev,), daemon=True).start()
                    else:
                        self.devices[ip].last_seen = time.time()
                        self.devices[ip].is_online = True
            except socket.timeout:
                continue
            except Exception:
                time.sleep(1)
        s.close()

    def add_manual_ip(self, ip: str) -> bool:
        """Manually add a Pixelblaze IP and fetch its config."""
        ip = ip.strip()
        if not ip:
            return False
        with self._lock:
            if ip not in self.devices:
                self.devices[ip] = PixelblazeDevice(ip=ip, name=f"Pixelblaze ({ip})")
        dev = self.devices[ip]
        success = self.refresh_device(dev)
        if success:
            self._save_cache()
            if self.on_devices_changed:
                self.on_devices_changed()
        return success

    def refresh_device(self, dev: PixelblazeDevice) -> bool:
        """Fetch config, current pattern, and pattern list from Pixelblaze."""
        try:
            # 1. Query /config.json (HTTP)
            r = requests.get(f"http://{dev.ip}/config.json", timeout=3)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                try:
                    cfg = r.json()
                    dev.name = cfg.get("name") or dev.name
                    bri_val = cfg.get("brightness", 1.0)
                    dev.brightness = max(0, min(100, int(float(bri_val) * 100)))
                    dev.is_on = (dev.brightness > 0)
                    if dev.is_on:
                        dev.saved_brightness = dev.brightness
                    last_prog = cfg.get("lastProgramPath", "").replace("/p/", "").strip()
                    if last_prog:
                        dev.active_pattern_id = last_prog
                except Exception:
                    pass

            # 2. Query Pattern List if not yet populated
            if not dev.patterns or len(dev.patterns) < 5:
                loaded_ws = False
                if websocket:
                    loaded_ws = self._fetch_patterns_ws(dev)
                if not loaded_ws:
                    self._fetch_patterns_http(dev)

            if dev.active_pattern_id and dev.active_pattern_id in dev.patterns:
                dev.active_pattern_name = dev.patterns[dev.active_pattern_id]
            elif not dev.active_pattern_name and dev.patterns:
                dev.active_pattern_name = list(dev.patterns.values())[0]

            dev.is_online = True
            self._save_cache()
        except Exception as e:
            print(f"[Pixelblaze Refresh Error] {dev.ip}: {e}")
            return False

        if self.on_devices_changed:
            try:
                self.on_devices_changed()
            except Exception:
                pass
        return True

    def _fetch_patterns_ws(self, dev: PixelblazeDevice) -> bool:
        """Query pattern list using Pixelblaze WebSocket API (port 81)."""
        if not websocket:
            return False
        ws = None
        try:
            ws = websocket.create_connection(
                f"ws://{dev.ip}:81",
                sockopt=((socket.SOL_SOCKET, socket.SO_REUSEADDR, 1), (socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)),
                timeout=2.5
            )
            ws.send(json.dumps({"listPrograms": True}, separators=(",", ":")).encode("utf-8"))
            frame = ws.recv()
            ws.close()

            text = frame.decode("utf-8", errors="ignore") if isinstance(frame, bytes) else str(frame)
            new_patterns = {}
            for line in text.split("\n"):
                line = line.strip("\r\n\x00\x05\x07 ")
                if "\t" in line:
                    parts = line.split("\t", 1)
                    pid = parts[0].strip()
                    pname = parts[1].strip()
                    if pid and pname:
                        new_patterns[pid] = pname

            if new_patterns:
                dev.patterns.update(new_patterns)
                return True
        except Exception as e:
            print(f"[Pixelblaze Pattern Fetch Error] {dev.ip}: {e}")
            if ws:
                try: ws.close()
                except Exception: pass
        return False

    def _fetch_patterns_http(self, dev: PixelblazeDevice) -> bool:
        """Fallback pattern list parser reading HTTP /list and pattern headers."""
        try:
            r = requests.get(f"http://{dev.ip}/list", timeout=3)
            if r.status_code != 200:
                return False
            
            pids = []
            for line in r.text.split("\n"):
                line = line.strip()
                if not line.startswith("/p/"):
                    continue
                path = line.split()[0]
                if path.endswith(".c") or path.endswith(".dat"):
                    continue
                pids.append(path.replace("/p/", ""))

            session = requests.Session()
            for pid in pids:
                if pid in dev.patterns and dev.patterns[pid] != pid:
                    continue
                try:
                    r_file = session.get(f"http://{dev.ip}/p/{pid}", timeout=2)
                    data = r_file.content
                    if len(data) >= 36:
                        v, off, name_len = struct.unpack("<3I", data[:12])
                        if off == 36 and name_len > 0 and 36 + name_len <= len(data):
                            name = data[36:36 + name_len].decode("utf-8", errors="ignore").strip()
                            if name:
                                dev.patterns[pid] = name
                                continue
                except Exception:
                    pass
                if pid not in dev.patterns:
                    dev.patterns[pid] = pid
            return bool(dev.patterns)
        except Exception:
            return False

    def set_power(self, ip: str, on: bool):
        dev = self.devices.get(ip)
        if not dev:
            return
        dev.is_on = on
        if on:
            target_bri = dev.saved_brightness if dev.saved_brightness > 0 else 100
            self.set_brightness(ip, target_bri)
        else:
            dev.saved_brightness = dev.brightness
            self.set_brightness(ip, 0)

    def set_brightness(self, ip: str, pct: int):
        dev = self.devices.get(ip)
        if not dev:
            return
        pct = max(0, min(100, int(pct)))
        dev.brightness = pct
        if pct > 0:
            dev.is_on = True
            dev.saved_brightness = pct
        else:
            dev.is_on = False

        float_val = round(pct / 100.0, 3)
        client = self._get_client(ip)

        def _send():
            ok = client.send_cmd({"brightness": float_val, "save": True})
            if not ok:
                try:
                    requests.post(f"http://{ip}/config.json", json={"brightness": float_val}, timeout=2)
                except Exception as e:
                    print(f"[Pixelblaze Brightness Error] {ip}: {e}")

        threading.Thread(target=_send, daemon=True).start()

    def set_pattern(self, ip: str, pattern_id: str):
        dev = self.devices.get(ip)
        if not dev:
            return
        dev.active_pattern_id = pattern_id
        dev.active_pattern_name = dev.patterns.get(pattern_id, pattern_id)
        if not dev.is_on:
            dev.is_on = True
            dev.brightness = dev.saved_brightness or 100

        self._save_cache()
        client = self._get_client(ip)

        def _send():
            ok = client.send_cmd({"activeProgramId": pattern_id, "save": True}, wait_response=True)
            if not ok:
                try:
                    requests.post(f"http://{ip}/config.json", json={"lastProgramPath": f"/p/{pattern_id}"}, timeout=2)
                except Exception as e:
                    print(f"[Pixelblaze Pattern Error] {ip}: {e}")

        threading.Thread(target=_send, daemon=True).start()

    def refresh_all_devices(self):
        self.discover_cloud()
        for dev in list(self.devices.values()):
            self.refresh_device(dev)
