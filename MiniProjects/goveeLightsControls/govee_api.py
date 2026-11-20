import os
import sys
import time
import json
import uuid
import socket
import threading
from typing import Dict, List, Optional, Callable
import requests
from dotenv import load_dotenv

# Load .env from multiple candidate locations
candidate_paths = [
    os.path.join(os.getcwd(), '.env'),
]
if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(sys.executable)
    candidate_paths.insert(0, os.path.join(exe_dir, '.env'))
    candidate_paths.insert(1, os.path.join(os.path.dirname(exe_dir), '.env'))
else:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidate_paths.insert(0, os.path.join(script_dir, '.env'))

for p in candidate_paths:
    if os.path.exists(p):
        load_dotenv(p)
        break

BASE_URL = "https://openapi.api.govee.com"

class GoveeDevice:
    def __init__(self, data: dict):
        self.sku: str = data.get("sku", "")
        self.mac: str = data.get("device", "")
        self.name: str = data.get("deviceName", "Unknown Device")
        self.type: str = data.get("type", "")
        self.capabilities: list = data.get("capabilities", [])
        
        # Live state
        self.is_online: bool = True
        self.is_on: bool = False
        self.brightness: int = 100
        self.color_rgb: int = 16777215  # White
        self.color_temp_k: int = 0
        self.lan_ip: Optional[str] = None
        
        self.has_brightness = any(c.get("instance") == "brightness" for c in self.capabilities)
        self.has_color_rgb = any(c.get("instance") == "colorRgb" for c in self.capabilities)
        self.has_color_temp = any(c.get("instance") == "colorTemperatureK" for c in self.capabilities)

    def update_from_state(self, cap_list: list):
        for cap in cap_list:
            instance = cap.get("instance")
            state = cap.get("state", {})
            val = state.get("value")
            
            if instance == "online":
                self.is_online = bool(val)
            elif instance == "powerSwitch":
                self.is_on = (val == 1)
            elif instance == "brightness":
                try:
                    if val is not None and str(val).isdigit():
                        self.brightness = int(val)
                except Exception:
                    pass
            elif instance == "colorRgb":
                try:
                    if val is not None and str(val).isdigit():
                        self.color_rgb = int(val)
                except Exception:
                    pass
            elif instance == "colorTemperatureK":
                try:
                    if val is not None and str(val).isdigit():
                        self.color_temp_k = int(val)
                except Exception:
                    pass


class GoveeManager:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOVEE_API_KEY", "")
        self.devices: Dict[str, GoveeDevice] = {}
        self.lan_devices: Dict[str, str] = {} # mac -> ip
        self._lock = threading.Lock()
        self._pending_brightness_timers: Dict[str, threading.Timer] = {}
        self.on_state_updated: Optional[Callable[[], None]] = None

        self.cache_file = os.path.join(
            os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(__file__),
            "govee_lan_cache.json"
        )
        self._load_lan_cache()

    def _load_lan_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    if isinstance(cached, dict):
                        self.lan_devices.update(cached)
            except Exception as e:
                print(f"[Govee LAN Cache Load Error] {e}")

    def _save_lan_cache(self):
        try:
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.lan_devices, f, indent=2)
        except Exception as e:
            print(f"[Govee LAN Cache Save Error] {e}")

    def set_device_ip(self, mac: str, ip: Optional[str]) -> bool:
        clean_mac = mac.replace(":", "").upper()
        with self._lock:
            if not ip or not ip.strip():
                # Clear assignment
                keys_to_remove = [k for k in self.lan_devices if k.replace(":", "").upper() == clean_mac]
                for k in keys_to_remove:
                    self.lan_devices.pop(k, None)
                for dev in self.devices.values():
                    if dev.mac.replace(":", "").upper() == clean_mac:
                        dev.lan_ip = None
                self._save_lan_cache()
                return True

            clean_ip = ip.strip()
            self.lan_devices[mac] = clean_ip
            for dev in self.devices.values():
                if dev.mac.replace(":", "").upper() == clean_mac:
                    dev.lan_ip = clean_ip
        self._save_lan_cache()
        # Verify via UDP devStatus
        try:
            status_cmd = {"msg": {"cmd": "devStatus", "data": {}}}
            self._send_lan_command(clean_ip, status_cmd)
        except Exception:
            pass
        return True

    def get_headers(self):
        return {
            "Content-Type": "application/json",
            "Govee-API-Key": self.api_key
        }

    def scan_lan(self, timeout=2.0):
        """Discovers any Govee devices supporting LAN API on the local network."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            try:
                s.bind(("", 4002))
            except Exception as e:
                print(f"[Govee LAN Bind Error] {e}")
            s.settimeout(timeout)
            
            scan_msg = json.dumps({
                "msg": {
                    "cmd": "scan",
                    "data": {
                        "account_topic": "reserve"
                    }
                }
            }).encode()
            
            # Send to standard multicast address
            try:
                s.sendto(scan_msg, ("239.255.255.250", 4001))
            except Exception:
                pass

            # Send to general and directed broadcasts
            for bcast_ip in ("255.255.255.255", "192.168.1.255", "10.237.23.255"):
                try:
                    s.sendto(scan_msg, (bcast_ip, 4001))
                except Exception:
                    pass

            # Also probe any known/cached IPs directly with unicast
            for ip in set(self.lan_devices.values()):
                try:
                    s.sendto(scan_msg, (ip, 4001))
                except Exception:
                    pass

            start_time = time.time()
            while time.time() - start_time < timeout:
                try:
                    data, addr = s.recvfrom(2048)
                    res = json.loads(data.decode("utf-8", errors="ignore"))
                    msg = res.get("msg", {})
                    if msg.get("cmd") == "scan":
                        d_info = msg.get("data", {})
                        ip = d_info.get("ip") or addr[0]
                        mac = d_info.get("device")
                        if mac and ip:
                            clean_mac = ":".join(mac[i:i+2].upper() for i in range(0, len(mac.replace(":", "")), 2))
                            with self._lock:
                                self.lan_devices[clean_mac] = ip
                                for dev in self.devices.values():
                                    if dev.mac.replace(":", "").upper() == clean_mac.replace(":", "").upper():
                                        dev.lan_ip = ip
                            self._save_lan_cache()
                except socket.timeout:
                    break
                except Exception:
                    continue
            s.close()
        except Exception as e:
            print(f"[LAN Scan Error] {e}")

    def refresh_devices(self) -> List[GoveeDevice]:
        """Fetch list of devices and their current states from Govee OpenAPI."""
        if not self.api_key:
            print("[Error] No Govee API Key provided.")
            return []

        url = f"{BASE_URL}/router/api/v1/user/devices"
        try:
            res = requests.get(url, headers=self.get_headers(), timeout=10)
            res.raise_for_status()
            data = res.json()
            if data.get("code") != 200:
                print(f"[API Error] {data}")
                return []

            device_list = data.get("data", [])
            with self._lock:
                for d in device_list:
                    mac = d.get("device")
                    if mac:
                        if mac not in self.devices:
                            self.devices[mac] = GoveeDevice(d)
                        else:
                            # Update capabilities if needed
                            self.devices[mac].name = d.get("deviceName", self.devices[mac].name)
                            self.devices[mac].capabilities = d.get("capabilities", self.devices[mac].capabilities)
                
                # Link known LAN IPs
                for mac_key, ip in self.lan_devices.items():
                    norm_mac = mac_key.replace(":", "").upper()
                    for dev in self.devices.values():
                        if dev.mac.replace(":", "").upper() == norm_mac:
                            dev.lan_ip = ip

            # Fetch states for all devices in parallel
            self.refresh_all_states()
            return list(self.devices.values())
        except Exception as e:
            print(f"[Refresh Error] {e}")
            return list(self.devices.values())

    def refresh_all_states(self):
        """Fetch current state for each device."""
        threads = []
        for mac, dev in list(self.devices.items()):
            t = threading.Thread(target=self._fetch_single_state, args=(dev,), daemon=True)
            threads.append(t)
            t.start()
        for t in threads:
            t.join(timeout=3.0)
        
        if self.on_state_updated:
            self.on_state_updated()

    def _fetch_single_state(self, dev: GoveeDevice):
        url = f"{BASE_URL}/router/api/v1/device/state"
        payload = {
            "requestId": str(uuid.uuid4()),
            "payload": {
                "sku": dev.sku,
                "device": dev.mac
            }
        }
        try:
            res = requests.post(url, headers=self.get_headers(), json=payload, timeout=5)
            if res.status_code == 200:
                data = res.json()
                if data.get("code") == 200:
                    caps = data.get("payload", {}).get("capabilities", [])
                    with self._lock:
                        dev.update_from_state(caps)
        except Exception as e:
            print(f"[State Fetch Error] {dev.name}: {e}")

    def _send_lan_command(self, ip: str, cmd_dict: dict) -> bool:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(1.0)
            s.sendto(json.dumps(cmd_dict).encode(), (ip, 4003))
            s.close()
            return True
        except Exception as e:
            print(f"[LAN Send Error] {ip}: {e}")
            return False

    def _send_cloud_control(self, dev: GoveeDevice, capability: dict) -> bool:
        url = f"{BASE_URL}/router/api/v1/device/control"
        payload = {
            "requestId": str(uuid.uuid4()),
            "payload": {
                "sku": dev.sku,
                "device": dev.mac,
                "capability": capability
            }
        }
        try:
            res = requests.post(url, headers=self.get_headers(), json=payload, timeout=8)
            if res.status_code == 200:
                data = res.json()
                return data.get("code") == 200
        except Exception as e:
            print(f"[Cloud Control Error] {dev.name}: {e}")
        return False

    def set_power(self, mac: str, on: bool):
        dev = self.devices.get(mac)
        if not dev:
            return
        dev.is_on = on
        
        def _exec():
            # Try LAN first
            if dev.lan_ip:
                success = self._send_lan_command(dev.lan_ip, {
                    "msg": {"cmd": "turn", "data": {"value": 1 if on else 0}}
                })
                if success:
                    return
            # Cloud fallback
            self._send_cloud_control(dev, {
                "type": "devices.capabilities.on_off",
                "instance": "powerSwitch",
                "value": 1 if on else 0
            })
            
        threading.Thread(target=_exec, daemon=True).start()

    def set_brightness(self, mac: str, brightness: int, debounce: bool = True):
        dev = self.devices.get(mac)
        if not dev:
            return
        brightness = max(1, min(100, int(brightness)))
        dev.brightness = brightness
        # If brightness changed, assume light is turning/is on
        if not dev.is_on:
            dev.is_on = True

        def _do_send():
            if dev.lan_ip:
                success = self._send_lan_command(dev.lan_ip, {
                    "msg": {"cmd": "brightness", "data": {"value": brightness}}
                })
                if success:
                    return
            self._send_cloud_control(dev, {
                "type": "devices.capabilities.range",
                "instance": "brightness",
                "value": brightness
            })

        if debounce:
            with self._lock:
                if mac in self._pending_brightness_timers:
                    self._pending_brightness_timers[mac].cancel()
                timer = threading.Timer(0.25, _do_send)
                self._pending_brightness_timers[mac] = timer
                timer.start()
        else:
            threading.Thread(target=_do_send, daemon=True).start()

    def set_color_temp(self, mac: str, temp_k: int):
        """Sets color temperature in Kelvin (2000K to 9000K). Uses true white LEDs for max 100% brightness!"""
        dev = self.devices.get(mac)
        if not dev:
            return
        temp_k = max(2000, min(9000, int(temp_k)))
        dev.color_temp_k = temp_k
        dev.is_on = True

        def _exec():
            if dev.lan_ip:
                success = self._send_lan_command(dev.lan_ip, {
                    "msg": {
                        "cmd": "colorwc",
                        "data": {
                            "color": {"r": 0, "g": 0, "b": 0},
                            "colorTemInKelvin": temp_k
                        }
                    }
                })
                if success:
                    return
            self._send_cloud_control(dev, {
                "type": "devices.capabilities.color_setting",
                "instance": "colorTemperatureK",
                "value": temp_k
            })

        threading.Thread(target=_exec, daemon=True).start()

    def set_color_rgb(self, mac: str, r: int, g: int, b: int):
        """Sets RGB color."""
        dev = self.devices.get(mac)
        if not dev:
            return
        r = max(0, min(255, int(r)))
        g = max(0, min(255, int(g)))
        b = max(0, min(255, int(b)))
        color_int = (r << 16) | (g << 8) | b
        dev.color_rgb = color_int
        dev.color_temp_k = 0
        dev.is_on = True

        def _exec():
            if dev.lan_ip:
                success = self._send_lan_command(dev.lan_ip, {
                    "msg": {
                        "cmd": "colorwc",
                        "data": {
                            "color": {"r": r, "g": g, "b": b},
                            "colorTemInKelvin": 0
                        }
                    }
                })
                if success:
                    return
            self._send_cloud_control(dev, {
                "type": "devices.capabilities.color_setting",
                "instance": "colorRgb",
                "value": color_int
            })

        threading.Thread(target=_exec, daemon=True).start()

    def set_all_power(self, on: bool):
        for mac in self.devices:
            self.set_power(mac, on)

    def set_all_brightness(self, brightness: int):
        for mac in self.devices:
            self.set_brightness(mac, brightness, debounce=False)

    def set_all_color_temp(self, temp_k: int):
        for mac in self.devices:
            self.set_color_temp(mac, temp_k)

    def set_all_color_rgb(self, r: int, g: int, b: int):
        for mac in self.devices:
            self.set_color_rgb(mac, r, g, b)
