import os
import json
import threading
import socket
import asyncio
import time
import platform
import datetime
import logging
import webview
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

# Configure logging to console and to file 'signal_forwarder.log'
log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'signal_forwarder.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(log_file, mode='w', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('SignalForwarder')

logger.info("=" * 60)
logger.info(f"SignalForwarder Started")
logger.info(f"Operating System: {platform.system()} {platform.release()} ({platform.version()})")
logger.info(f"Python Version: {platform.python_version()}")
logger.info(f"Machine: {platform.machine()}")
logger.info(f"Processor: {platform.processor()}")
logger.info(f"Log File Location: {log_file}")
logger.info("=" * 60)

# Import dependencies with grace fallback
try:
    import mido
    logger.info("mido library successfully loaded.")
except ImportError:
    mido = None
    logger.warning("mido library not found. MIDI support disabled.")

try:
    from bleak import BleakScanner, BleakClient
    from bleak.exc import BleakError
    logger.info("bleak library successfully loaded.")
except ImportError:
    BleakScanner, BleakClient, BleakError = None, None, None
    logger.warning("bleak library not found. BLE support disabled.")

try:
    import sounddevice as sd
    import numpy as np
    logger.info("sounddevice and numpy libraries successfully loaded.")
except ImportError:
    sd, np = None, None
    logger.warning("sounddevice and/or numpy libraries not found. Audio capture disabled.")

try:
    import serial.tools.list_ports
    logger.info("pyserial library successfully loaded.")
except ImportError:
    serial = None
    logger.warning("pyserial library not found. Serial COM port discovery disabled.")


class BLEManager:
    def __init__(self, loop, on_status_change, on_config_receive):
        self.loop = loop
        self.on_status_change = on_status_change
        self.on_config_receive = on_config_receive
        self.client = None
        self.connected = False
        self.address = None
        self.device_name = "SignalForwarderESP32"
        self.service_uuid = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
        self.char_uuid_cfg = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
        self.char_uuid_ctrl = "d6a4c282-36c1-468a-b851-9e7f61c3127a"
        self.auto_connect = False
        self.scanning = False

    async def check_bluetooth(self):
        if BleakScanner is None:
            return False, "bleak library not installed"
        try:
            await BleakScanner.discover(timeout=0.5)
            return True, "Bluetooth is ready"
        except Exception as e:
            logger.error(f"Bluetooth availability check failed: {e}")
            return False, f"Bluetooth not available: {str(e)}"

    async def scan_devices(self):
        if BleakScanner is None or self.scanning:
            return []
        self.scanning = True
        logger.info("Starting BLE Scan...")
        try:
            # 1. Try with return_adv=True (modern bleak) to get advertisement details safely
            devices = await BleakScanner.discover(timeout=4.0, return_adv=True)
            results = []
            logger.info(f"BLE Scan found {len(devices)} devices:")
            for address, (d, adv) in devices.items():
                name = adv.local_name or d.name or "Unknown"
                uuids = adv.service_uuids or []
                
                is_esp_match = False
                for u in uuids:
                    if self.service_uuid.lower() in u.lower():
                        is_esp_match = True
                        break
                
                if is_esp_match and (not name or name == "Unknown"):
                    name = "SignalForwarderESP32"
                
                rssi = adv.rssi
                rssi_str = f"{rssi} dBm" if rssi is not None else "N/A"
                
                logger.info(f"  - Device: Name='{name}', Addr='{d.address}', RSSI={rssi_str}, Advertised Services={uuids}")
                
                results.append({
                    "name": name, 
                    "address": d.address, 
                    "rssi": rssi_str,
                    "is_match": is_esp_match or (d.name == self.device_name)
                })
            return results
        except TypeError:
            # 2. Fallback for older Bleak versions where return_adv=True is not supported
            logger.warning("Bleak discover return_adv not supported, falling back to older scanner signature.")
            try:
                devices = await BleakScanner.discover(timeout=4.0)
                results = []
                logger.info(f"Fallback BLE Scan found {len(devices)} devices:")
                for d in devices:
                    name = d.name or "Unknown"
                    is_esp_match = (d.name == self.device_name)
                    
                    # Safe metadata retrieval
                    metadata = getattr(d, 'metadata', None)
                    uuids = []
                    rssi = None
                    if metadata and isinstance(metadata, dict):
                        uuids = metadata.get('uuids', [])
                        rssi = metadata.get('rssi')
                    
                    for u in uuids:
                        if self.service_uuid.lower() in u.lower():
                            is_esp_match = True
                            break
                    
                    if is_esp_match and (not name or name == "Unknown"):
                        name = "SignalForwarderESP32"
                    
                    rssi_str = f"{rssi} dBm" if rssi is not None else "N/A"
                    logger.info(f"  - Device (Fallback): Name='{name}', Addr='{d.address}', RSSI={rssi_str}, Advertised Services={uuids}")
                    
                    results.append({
                        "name": name,
                        "address": d.address,
                        "rssi": rssi_str,
                        "is_match": is_esp_match
                    })
                return results
            except Exception as e:
                logger.error(f"Fallback BLE Scan exception: {e}")
                return []
        except Exception as e:
            logger.error(f"BLE Scan exception: {e}")
            return []
        finally:
            self.scanning = False

    async def connect(self, address):
        if BleakClient is None or self.connected:
            return False
        
        logger.info(f"Attempting connection to BLE address {address}...")
        self.address = address
        self.client = BleakClient(address, disconnected_callback=self._on_disconnect)
        try:
            await self.client.connect()
            self.connected = True
            logger.info(f"Successfully connected to BLE Device: {address}")
            
            # Print discovered services of the connected device to aid troubleshooting
            services = self.client.services
            logger.info(f"Connected Device Services List:")
            for s in services:
                logger.info(f"  - Service: {s.uuid}")
                for char in s.characteristics:
                    logger.info(f"    * Characteristic: {char.uuid} (Properties: {char.properties})")

            self.on_status_change("CONNECTED", address)
            
            # Read Config from ESP32
            await self.read_config()
            return True
        except Exception as e:
            logger.error(f"BLE Connection failed to {address}: {e}")
            self.connected = False
            self.client = None
            self.on_status_change("DISCONNECTED", None)
            return False

    def _on_disconnect(self, client):
        logger.info(f"BLE Disconnected callback triggered for {self.address}")
        self.connected = False
        self.client = None
        self.on_status_change("DISCONNECTED", None)

    async def disconnect(self):
        if self.client and self.connected:
            logger.info(f"Disconnecting BLE client from {self.address}...")
            try:
                await self.client.disconnect()
            except Exception as e:
                logger.error(f"Error during BLE disconnect: {e}")
        self.connected = False
        self.client = None
        self.on_status_change("DISCONNECTED", None)

    async def read_config(self):
        if not self.connected or not self.client:
            logger.warning("Attempted to read config when BLE is not connected.")
            return
        try:
            logger.info(f"Reading ESP32 configuration from Characteristic {self.char_uuid_cfg}...")
            val = await self.client.read_gatt_char(self.char_uuid_cfg)
            config_str = val.decode('utf-8', errors='ignore')
            logger.info(f"Read config from ESP32: {config_str}")
            self.on_config_receive(config_str)
        except Exception as e:
            logger.error(f"Failed to read ESP32 config: {e}")

    async def write_config(self, config_str):
        if not self.connected or not self.client:
            logger.warning("Attempted to write config when BLE is not connected.")
            return False
        try:
            logger.info(f"Writing new config JSON to ESP32: {config_str}")
            data = config_str.encode('utf-8')
            await self.client.write_gatt_char(self.char_uuid_cfg, data, response=True)
            logger.info("Successfully wrote config to ESP32.")
            return True
        except Exception as e:
            logger.error(f"Failed to write ESP32 config: {e}")
            return False

    async def write_control(self, payload):
        if not self.connected or not self.client:
            return
        try:
            logger.debug(f"Sending BLE Control packet: {list(payload)}")
            await self.client.write_gatt_char(self.char_uuid_ctrl, payload, response=False)
        except Exception as e:
            logger.error(f"Failed to send control payload: {e}")


class ArtNetListener:
    def __init__(self, callback, port=6454):
        self.callback = callback
        self.port = port
        self.sock = None
        self.active = False
        self.thread = None

    def start(self):
        if self.active:
            return
        self.active = True
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def stop(self):
        self.active = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass

    def run(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.sock.bind(("0.0.0.0", self.port))
            logger.info(f"Art-Net Listener bound to port {self.port}")
            while self.active:
                data, addr = self.sock.recvfrom(1024)
                if len(data) >= 18 and data[0:8] == b"Art-Net\x00":
                    opcode = (data[9] << 8) | data[8]
                    if opcode == 0x5000: # ArtDmx Packet
                        sequence = data[12]
                        physical = data[13]
                        subuni = data[14]
                        net = data[15]
                        length = (data[16] << 8) | data[17]
                        dmx_data = data[18:18+length]
                        self.callback(addr[0], dmx_data)
        except Exception as e:
            if self.active:
                logger.error(f"Art-Net Listener socket exception: {e}")


class SignalForwarderApp:
    def __init__(self):
        self._window = None
        self.is_running = False
        
        # OSC Server configuration
        self.osc_server = None
        self.osc_thread = None
        self.osc_port = 3330
        
        # Art-Net (DMX) Listener configuration
        self.artnet_listener = None
        self.artnet_port = 6454
        
        # MIDI parameters
        self.midi_inputs = {} 
        self.active_midi_ports = set()
        
        # Audio parameters
        self.audio_stream = None
        self.audio_active = False
        self.audio_device_idx = -1
        
        # BLE async engine thread
        self.ble_loop = None
        self.ble_thread = None
        self.ble_manager = None
        self._start_ble_thread()

        # Simulator
        self.test_ping_active = False
        self.test_ping_thread = None

        # Routing engine parameters
        self.discovered_sources = {}
        self.discovered_dests = {}
        self.routes = [] 
        self.custom_osc_dests = {} 
        self.udp_clients = {} 
        self.route_counter = 0

        # Load saved configurations
        self.load_persistent_routes()

    def set_window(self, window):
        self._window = window

    def _start_ble_thread(self):
        self.ble_loop = asyncio.new_event_loop()
        self.ble_manager = BLEManager(
            self.ble_loop, 
            self._on_ble_status_change, 
            self._on_ble_config_receive
        )
        self.ble_thread = threading.Thread(target=self._run_ble_loop, args=(self.ble_loop,), daemon=True)
        self.ble_thread.start()

    def _run_ble_loop(self, loop):
        asyncio.set_event_loop(loop)
        loop.run_forever()

    def _on_ble_status_change(self, status, address):
        if self._window:
            self._window.evaluate_js(f"updateBleStatus('{status}', '{address or ''}')")
        self._sync_routing_ui()

    def _on_ble_config_receive(self, config_str):
        if self._window:
            safe_cfg = config_str.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
            self._window.evaluate_js(f"loadEsp32Config('{safe_cfg}')")

    def get_ip_address(self):
        """Returns the local IP address."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    # --- Routing Persistence Layer ---
    def save_persistent_routes(self):
        cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'routes_config.json')
        try:
            data = {
                "routes": self.routes,
                "custom_osc_dests": self.custom_osc_dests
            }
            with open(cfg_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4)
            logger.info(f"Saved persistent routing config to {cfg_file}")
        except Exception as e:
            logger.error(f"Failed to save persistent routing: {e}")

    def load_persistent_routes(self):
        cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'routes_config.json')
        if not os.path.exists(cfg_file):
            return
        try:
            with open(cfg_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.routes = data.get("routes", [])
            self.custom_osc_dests = data.get("custom_osc_dests", {})
            for k, v in self.custom_osc_dests.items():
                self.discovered_dests[k] = v
                
            for r in self.routes:
                try:
                    rid = int(r["id"].split("_")[1])
                    if rid > self.route_counter:
                        self.route_counter = rid
                except Exception:
                    pass
            logger.info(f"Loaded {len(self.routes)} persistent routes from {cfg_file}")
        except Exception as e:
            logger.error(f"Failed to load persistent routing: {e}")

    # --- PyWebView API Routing Interfaces ---
    def add_route(self, source, dest):
        self.route_counter += 1
        route_id = f"route_{self.route_counter}"
        self.routes.append({
            "id": route_id,
            "source": source,
            "dest": dest,
            "enabled": True
        })
        logger.info(f"Added mapping route: {source} -> {dest}")
        self.save_persistent_routes()
        self._sync_routing_ui()
        return True

    def delete_route(self, route_id):
        self.routes = [r for r in self.routes if r["id"] != route_id]
        logger.info(f"Deleted mapping route ID: {route_id}")
        self.save_persistent_routes()
        self._sync_routing_ui()
        return True

    def toggle_route(self, route_id, enabled):
        for r in self.routes:
            if r["id"] == route_id:
                r["enabled"] = bool(enabled)
                logger.info(f"Toggled route {route_id} status: {enabled}")
                break
        self.save_persistent_routes()
        self._sync_routing_ui()
        return True

    def add_custom_osc_destination(self, ip, port):
        key = f"osc_client:{ip}:{port}"
        label = f"OSC Endpoint ({ip}:{port})"
        self.custom_osc_dests[key] = label
        logger.info(f"Registered custom OSC target destination: {key}")
        self.save_persistent_routes()
        self._sync_routing_ui()
        return True

    def get_routing_data(self):
        # 1. Sources: simulated, audio, wildcards, and discovered ports
        srcs = [
            {"id": "test_mode", "name": "Simulated Signal / Simulator"},
            {"id": "audio_level", "name": "Local Audio Captured"},
            {"id": "all_midi", "name": "All MIDI Inputs (Wildcard)"},
            {"id": "all_osc", "name": "All OSC Senders (Wildcard)"},
            {"id": "all_dmx", "name": "All DMX Senders (Wildcard)"}
        ]
        for k, v in self.discovered_sources.items():
            if k not in ["test_mode", "audio_level", "all_midi", "all_osc", "all_dmx"]:
                srcs.append({"id": k, "name": v})
                
        # 2. Destinations: Connected BLE ESP32, custom and discovered targets
        dests = []
        if self.ble_manager and self.ble_manager.connected:
            dests.append({"id": "esp32", "name": "ESP32 C3 BLE Client (Supermini)"})
            
        for k, v in self.custom_osc_dests.items():
            dests.append({"id": k, "name": v})
            
        for k, v in self.discovered_dests.items():
            if k != "esp32" and k not in self.custom_osc_dests:
                dests.append({"id": k, "name": v})
                
        return {
            "sources": srcs,
            "destinations": dests,
            "routes": self.routes
        }

    def _sync_routing_ui(self):
        if self._window:
            data_json = json.dumps(self.get_routing_data())
            safe_str = data_json.replace("\\", "\\\\").replace("'", "\\'")
            self._window.evaluate_js(f"renderSignalRouter('{safe_str}')")

    def _register_discovered_source(self, key, label):
        if key not in self.discovered_sources:
            self.discovered_sources[key] = label
            logger.info(f"Source Signal Discovered: id='{key}', label='{label}'")
            self._sync_routing_ui()

    def _register_discovered_dest(self, key, label):
        if key not in self.discovered_dests:
            self.discovered_dests[key] = label
            logger.info(f"Output Target Discovered: id='{key}', label='{label}'")
            self._sync_routing_ui()

    # --- Router transmission logic with Wildcard support ---
    def _route_pwm_signal(self, source_key, pin, pwm_val):
        for route in self.routes:
            if route["enabled"]:
                is_match = False
                if route["source"] == source_key:
                    is_match = True
                elif route["source"] == "all_osc" and source_key.startswith("osc:"):
                    is_match = True
                elif route["source"] == "all_dmx" and source_key.startswith("dmx:"):
                    is_match = True
                elif route["source"] == "test_mode" and source_key == "test_mode":
                    is_match = True
                elif route["source"] == "audio_level" and source_key == "audio_level":
                    is_match = True
                    
                if is_match:
                    dest = route["dest"]
                    # Target: ESP32 BLE
                    if dest == "esp32":
                        if self.ble_manager and self.ble_manager.connected:
                            pkt = bytes([0x01, pin, pwm_val])
                            asyncio.run_coroutine_threadsafe(self.ble_manager.write_control(pkt), self.ble_loop)
                    # Target: Network OSC Client
                    elif dest.startswith("osc_client:"):
                        parts = dest.split(":")
                        ip = parts[1]
                        port = int(parts[2])
                        self._send_network_osc(ip, port, f"/led/{pin}", pwm_val)

    def _route_midi_signal(self, source_key, note, velocity, duration):
        for route in self.routes:
            if route["enabled"]:
                is_match = False
                if route["source"] == source_key:
                    is_match = True
                elif route["source"] == "all_midi" and source_key.startswith("midi:"):
                    is_match = True
                elif route["source"] == "test_mode" and source_key == "test_mode":
                    is_match = True
                    
                if is_match:
                    dest = route["dest"]
                    # Target: ESP32 BLE
                    if dest == "esp32":
                        if self.ble_manager and self.ble_manager.connected:
                            target_pin = 1 
                            cmd_type = 0x02
                            dur_high = (duration >> 8) & 0xFF
                            dur_low = duration & 0xFF
                            pkt = bytes([cmd_type, target_pin, note, velocity, dur_high, dur_low])
                            asyncio.run_coroutine_threadsafe(self.ble_manager.write_control(pkt), self.ble_loop)
                    # Target: Network OSC Client
                    elif dest.startswith("osc_client:"):
                        parts = dest.split(":")
                        ip = parts[1]
                        port = int(parts[2])
                        self._send_network_osc(ip, port, "/midi/note", [note, velocity, duration])

    def _send_network_osc(self, ip, port, path, args):
        key = f"{ip}:{port}"
        if key not in self.udp_clients:
            try:
                self.udp_clients[key] = SimpleUDPClient(ip, port)
            except Exception as e:
                logger.error(f"Error creating network OSC client for {key}: {e}")
                return
        try:
            logger.debug(f"Routing network OSC to {key} -> {path} {args}")
            self.udp_clients[key].send_message(path, args)
        except Exception as e:
            logger.error(f"Failed sending network OSC to {key}: {e}")

    # --- PyWebView BLE API Interfaces ---
    def check_system_bluetooth(self):
        """Check if bluetooth hardware / stack exists on this PC."""
        if not self.ble_manager:
            return {"available": False, "error": "BLE Manager not initialized"}
        fut = asyncio.run_coroutine_threadsafe(self.ble_manager.check_bluetooth(), self.ble_loop)
        try:
            available, msg = fut.result(timeout=2.0)
            return {"available": available, "message": msg}
        except Exception as e:
            logger.error(f"BLE Availability checks error: {e}")
            return {"available": False, "error": str(e)}

    def scan_bluetooth_devices(self):
        """Scan for BLE devices."""
        if not self.ble_manager:
            return []
        fut = asyncio.run_coroutine_threadsafe(self.ble_manager.scan_devices(), self.ble_loop)
        try:
            return fut.result(timeout=6.0)
        except Exception as e:
            logger.error(f"BLE scanning failed: {e}")
            return []

    def connect_ble_device(self, address):
        """Connect to selected BLE device."""
        if not self.ble_manager:
            return False
        fut = asyncio.run_coroutine_threadsafe(self.ble_manager.connect(address), self.ble_loop)
        try:
            return fut.result(timeout=10.0)
        except Exception as e:
            logger.error(f"BLE connection timed out or failed: {e}")
            return False

    def disconnect_ble_device(self):
        """Disconnect BLE connection."""
        if not self.ble_manager:
            return False
        fut = asyncio.run_coroutine_threadsafe(self.ble_manager.disconnect(), self.ble_loop)
        try:
            fut.result(timeout=5.0)
            return True
        except Exception as e:
            logger.error(f"BLE disconnect failed: {e}")
            return False

    def get_esp32_config_from_device(self):
        """Reads config JSON from ESP32."""
        if not self.ble_manager or not self.ble_manager.connected:
            return {"success": False, "error": "Not connected"}
        fut = asyncio.run_coroutine_threadsafe(self.ble_manager.read_config(), self.ble_loop)
        try:
            fut.result(timeout=5.0)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def send_esp32_config_to_device(self, config_str):
        """Writes config JSON back to ESP32."""
        if not self.ble_manager or not self.ble_manager.connected:
            return {"success": False, "error": "Not connected"}
        fut = asyncio.run_coroutine_threadsafe(self.ble_manager.write_config(config_str), self.ble_loop)
        try:
            res = fut.result(timeout=5.0)
            return {"success": res}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_auto_connect(self, enabled):
        if self.ble_manager:
            self.ble_manager.auto_connect = bool(enabled)
            logger.info(f"BLE Auto-connect set to: {enabled}")
            return True
        return False

    # --- Signal Simulator Test Mode API (Completely routed through matrix) ---
    def send_simulated_signal(self, signal_type, params_json):
        try:
            params = json.loads(params_json)
            logger.info(f"Simulating signal: Type={signal_type}, Params={params}")
            
            if signal_type == "pwm":
                pin = int(params.get("pin", 1))
                val = int(params.get("val", 125))
                # Send strictly via routing matrix (No direct BLE bypass)
                self._route_pwm_signal("test_mode", pin, val)
                
            elif signal_type == "midi":
                note = int(params.get("note", 60))
                vel = int(params.get("vel", 50))
                dur = int(params.get("dur", 500))
                
                payload = {
                    "type": "MIDI",
                    "source": "Simulated MIDI",
                    "desc": f"Note On: note={note}, velocity={vel}, duration={dur}ms"
                }
                self._send_to_ui_log(payload)
                self._route_midi_signal("test_mode", note, vel, dur)
                
            elif signal_type == "osc":
                path = params.get("path", "/led/1")
                val = float(params.get("val", 125.0))
                self.handle_osc_message(("127.0.0.1", 9999), path, val)
                
            elif signal_type == "dmx":
                chan = int(params.get("chan", 1))
                val = int(params.get("val", 125))
                dmx_data = [0] * max(512, chan)
                dmx_data[chan-1] = val
                self.handle_artnet_message("127.0.0.1", dmx_data)
                
            return True
        except Exception as e:
            logger.error(f"Failed to send simulated signal: {e}")
            return False

    def toggle_test_ping(self, enabled, signal_type, params_json):
        logger.info(f"Toggle Auto-Ping set to: {enabled} (Type={signal_type})")
        
        if enabled:
            if self.test_ping_active:
                return True
            self.test_ping_active = True
            
            def ping_worker():
                logger.info("Simulator Auto-Ping thread started.")
                while self.test_ping_active:
                    self.send_simulated_signal(signal_type, params_json)
                    time.sleep(1.0)
                logger.info("Simulator Auto-Ping thread stopped.")

            self.test_ping_thread = threading.Thread(target=ping_worker, daemon=True)
            self.test_ping_thread.start()
            return True
        else:
            self.test_ping_active = False
            self.test_ping_thread = None
            return True

    def get_system_sources(self):
        """Finds and lists MIDI ports, Audio devices, Network IPs, Serial ports."""
        sources = {
            "midi_inputs": [],
            "audio_inputs": [],
            "serial_ports": [],
            "local_ip": self.get_ip_address()
        }

        # 1. MIDI Inputs
        if mido:
            try:
                sources["midi_inputs"] = mido.get_input_names()
                for port in sources["midi_inputs"]:
                    key = f"midi:{port}"
                    self._register_discovered_source(key, f"MIDI: {port}")
            except Exception as e:
                logger.error(f"Error querying MIDI inputs: {e}")

        # 2. Audio Input Devices
        if sd:
            try:
                devices = sd.query_devices()
                for i, d in enumerate(devices):
                    if d['max_input_channels'] > 0:
                        sources["audio_inputs"].append({
                            "index": i,
                            "name": d['name'],
                            "sr": d['default_samplerate']
                        })
            except Exception as e:
                logger.error(f"Error querying Audio inputs: {e}")

        # 3. Serial Ports
        if serial:
            try:
                ports = serial.tools.list_ports.comports()
                logger.info("Serial COM Ports Found:")
                for p in ports:
                    logger.info(f"  - Port: {p.device}, Desc: '{p.description}', HWID: '{p.hwid}'")
                    sources["serial_ports"].append({
                        "port": p.device,
                        "desc": p.description,
                        "hwid": p.hwid
                    })
            except Exception as e:
                logger.error(f"Error querying Serial COM ports: {e}")

        logger.info(f"System query findings: LocalIP={sources['local_ip']}, MIDI={sources['midi_inputs']}, AudioCount={len(sources['audio_inputs'])}, COMCount={len(sources['serial_ports'])}")
        return sources

    def toggle_midi_port(self, port_name, enabled):
        if not mido:
            return False
            
        if enabled:
            if port_name in self.active_midi_ports:
                return True
            try:
                def midi_listener():
                    try:
                        with mido.open_input(port_name) as port:
                            self.midi_inputs[port_name] = port
                            self.active_midi_ports.add(port_name)
                            logger.info(f"Successfully connected and listening to MIDI port: {port_name}")
                            
                            self._register_discovered_source(f"midi:{port_name}", f"MIDI: {port_name}")
                            
                            for msg in port:
                                if port_name not in self.active_midi_ports:
                                    break
                                self._handle_midi_message(port_name, msg)
                    except Exception as err:
                        logger.error(f"MIDI reader exception in port {port_name}: {err}")
                        self.active_midi_ports.discard(port_name)
                        
                t = threading.Thread(target=midi_listener, daemon=True)
                t.start()
                return True
            except Exception as e:
                logger.error(f"Failed to bind MIDI input listener for {port_name}: {e}")
                return False
        else:
            self.active_midi_ports.discard(port_name)
            port = self.midi_inputs.pop(port_name, None)
            if port:
                try:
                    port.close()
                except Exception:
                    pass
            logger.info(f"Stopped monitoring MIDI port: {port_name}")
            return True

    def _handle_midi_message(self, port_name, msg):
        payload = {
            "type": "MIDI",
            "source": port_name,
            "desc": str(msg)
        }
        self._send_to_ui_log(payload)

        source_key = f"midi:{port_name}"
        duration = 0
        if msg.type == 'note_on':
            self._route_midi_signal(source_key, msg.note, msg.velocity, duration)
        elif msg.type == 'note_off':
            self._route_midi_signal(source_key, msg.note, 0, duration)

    def set_audio_device(self, idx):
        if not sd or not np:
            return False
            
        self.audio_active = False
        if self.audio_stream:
            try:
                self.audio_stream.stop()
                self.audio_stream.close()
            except Exception:
                pass
            self.audio_stream = None
            
        if idx < 0:
            self.audio_device_idx = -1
            logger.info("Audio stream deactivated.")
            return True
            
        try:
            self.audio_device_idx = idx
            self.audio_active = True
            
            def audio_callback(indata, frames, time, status):
                if not self.audio_active:
                    return
                rms = float(np.sqrt(np.mean(indata**2)))
                pwm_val = int(min(max(rms * 800.0, 0.0), 255.0))
                
                if self._window:
                    self._window.evaluate_js(f"updateAudioLevel({rms}, {pwm_val})")
                    
                if pwm_val > 5:
                    self._route_pwm_signal("audio_level", 1, pwm_val)

            self.audio_stream = sd.InputStream(
                device=idx,
                channels=1,
                callback=audio_callback,
                blocksize=512
            )
            self.audio_stream.start()
            logger.info(f"Audio stream activated on device index {idx}")
            return True
        except Exception as e:
            logger.error(f"Failed to open audio input stream: {e}")
            self.audio_active = False
            self.audio_stream = None
            return False

    def handle_osc_message(self, client_address, address, *args):
        sender_ip = client_address[0]
        sender_port = client_address[1]

        src_key = f"osc:{sender_ip}"
        dest_key = f"osc_client:{sender_ip}:3330"
        
        self._register_discovered_source(src_key, f"OSC Snd ({sender_ip})")
        self._register_discovered_dest(dest_key, f"OSC Target ({sender_ip}:3330)")

        arg_str = ", ".join(map(str, args))
        payload = {
            "type": "OSC",
            "source": f"{sender_ip}:{sender_port}",
            "desc": f"{address} [{arg_str}]"
        }
        self._send_to_ui_log(payload)

        pwm_val = 0
        if args and isinstance(args[0], (int, float)):
            val = args[0]
            if isinstance(val, float) and val <= 1.0:
                pwm_val = int(val * 255)
            else:
                pwm_val = int(min(max(val, 0), 255))
        else:
            pwm_val = 125
            
        pin = 1
        parts = address.strip('/').split('/')
        if len(parts) >= 2 and parts[0] == 'led':
            try:
                pin = int(parts[1])
            except ValueError:
                pass
        
        self._route_pwm_signal(src_key, pin, pwm_val)

    def handle_artnet_message(self, ip, dmx_data):
        if not dmx_data:
            return
            
        src_key = f"dmx:{ip}"
        self._register_discovered_source(src_key, f"DMX Snd ({ip})")

        payload = {
            "type": "DMX",
            "source": ip,
            "desc": f"Universe 0 DMX. Ch 1: {dmx_data[0]}"
        }
        self._send_to_ui_log(payload)

        val = dmx_data[0]
        self._route_pwm_signal(src_key, 1, val)

    def _send_to_ui_log(self, payload):
        if self._window:
            try:
                json_str = json.dumps(payload)
                safe_str = json_str.replace("'", "\'" ).replace('"', '\"')
                self._window.evaluate_js(f"addToConsole('{safe_str}')")
            except Exception as e:
                logger.error(f"Error logging to UI: {e}")

    def start_servers(self, osc_port, artnet_port):
        if self.is_running:
            return {"success": False, "error": "Servers already running"}

        try:
            self.osc_port = osc_port
            dispatcher = Dispatcher()
            dispatcher.map("*", self.handle_osc_message, needs_reply_address=True)
            self.osc_server = ThreadingOSCUDPServer(("0.0.0.0", osc_port), dispatcher)
            
            self.osc_thread = threading.Thread(target=self.osc_server.serve_forever, daemon=True)
            self.osc_thread.start()
            
            self.artnet_port = artnet_port
            self.artnet_listener = ArtNetListener(self.handle_artnet_message, artnet_port)
            self.artnet_listener.start()
            
            self.is_running = True
            logger.info(f"UDP Servers initiated successfully: OSC={osc_port}, Art-Net={artnet_port}")
            self._sync_routing_ui()
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to bind UDP servers: {e}")
            self.stop_servers()
            return {"success": False, "error": str(e)}

    def stop_servers(self):
        success = False
        if self.osc_server:
            logger.info("Deactivating OSC Server...")
            self.osc_server.shutdown()
            self.osc_server.server_close()
            self.osc_server = None
            success = True
            
        if self.artnet_listener:
            logger.info("Deactivating Art-Net Listener...")
            self.artnet_listener.stop()
            self.artnet_listener = None
            success = True
            
        self.is_running = False
        return {"success": success}

    def on_closing(self):
        logger.info("Application closing. Halting all background threads and streams...")
        self.stop_servers()
        self.test_ping_active = False
        if self.audio_stream:
            self.audio_stream.stop()
            self.audio_stream.close()
        for port in self.midi_inputs.values():
            try:
                port.close()
            except Exception:
                pass
        if self.ble_loop:
            self.ble_loop.stop()
        logger.info("Halting sequence complete. Good bye.")


if __name__ == '__main__':
    api = SignalForwarderApp()
    
    entry_point = os.path.join(os.getcwd(), 'web', 'index.html')
    
    window = webview.create_window(
        'SignalForwarder Monitor', 
        url=entry_point,
        js_api=api,
        width=1366, 
        height=768,
        resizable=True,
        background_color='#0c0c0e'
    )
    
    api.set_window(window)
    window.events.closed += api.on_closing
    
    webview.start(debug=False, gui='qt')