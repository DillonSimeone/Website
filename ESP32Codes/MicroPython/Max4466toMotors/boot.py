import network
import time
import machine
import usocket
import struct
import json
import ubinascii

# --- Configuration ---
WIFI_CONFIG_FILE = "wifi_config.json"
HOSTNAME = "reactiveCogs"
AP_BASE_NAME = "reactiveMotor"

# --- Helpers ---
def load_wifi_config():
    try:
        with open(WIFI_CONFIG_FILE, "r") as f:
            return json.load(f)
    except:
        return None

def announce_mdns(ip, host):
    MCAST_GRP = '224.0.0.251'
    MCAST_PORT = 5353
    sock = usocket.socket(usocket.AF_INET, usocket.SOCK_DGRAM)
    sock.setsockopt(usocket.SOL_SOCKET, usocket.SO_REUSEADDR, 1)
    packet = b'\x00\x00\x84\x00\x00\x00\x00\x01\x00\x00\x00\x00'
    packet += b'\x05' + host.encode() + b'\x05local\x00'
    packet += b'\x00\x01\x00\x01\x00\x00\x00\x78'
    ip_parts = [int(x) for x in ip.split('.')]
    packet += b'\x00\x04' + struct.pack('BBBB', *ip_parts)
    try: sock.sendto(packet, (MCAST_GRP, MCAST_PORT))
    except: pass
    finally: sock.close()

def start_station_mode(ssid, password):
    print(f"Connecting to STA: {ssid}...")
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.config(dhcp_hostname=HOSTNAME)
    if not wlan.isconnected():
        wlan.connect(ssid, password)
        for _ in range(15): # Wait up to 15s
            if wlan.isconnected(): 
                break
            time.sleep(1)
    return wlan.isconnected()

def find_ap_name(wlan_sta):
    # Scan for existing reactiveMotor APs
    print("Scanning for conflicts...")
    try:
        scan_results = wlan_sta.scan() # [(ssid, bssid, channel, RSSI, authmode, hidden), ...]
        existing_suffixes = []
        for res in scan_results:
            ssid = res[0].decode('utf-8')
            if ssid.startswith(AP_BASE_NAME):
                suffix = ssid[len(AP_BASE_NAME):]
                if suffix == "":
                    existing_suffixes.append(0)
                elif suffix.isdigit():
                    existing_suffixes.append(int(suffix))
        
        if not existing_suffixes:
            return AP_BASE_NAME
        
        existing_suffixes.sort()
        # Find first gap or append
        next_id = 0
        for uid in existing_suffixes:
            if uid == next_id:
                next_id += 1
            else:
                break # Found gap
        
        return f"{AP_BASE_NAME}{next_id}" if next_id > 0 else AP_BASE_NAME
        
    except Exception as e:
        print(f"Scan failed: {e}")
        # Fallback to random ID if scan fails
        return f"{AP_BASE_NAME}_{ubinascii.hexlify(machine.unique_id())[-4:].decode()}"

def start_ap_mode():
    wlan_sta = network.WLAN(network.STA_IF)
    wlan_sta.active(True) # Need STA active to scan? Usually yes on ESP32
    
    ap_name = find_ap_name(wlan_sta)
    
    print(f"Starting AP: {ap_name}")
    wlan_ap = network.WLAN(network.AP_IF)
    wlan_ap.active(True)
    wlan_ap.config(essid=ap_name, authmode=network.AUTH_OPEN)
    
    return wlan_ap, ap_name

# --- Boot Logic ---
connected = False
wlan = network.WLAN(network.STA_IF)

# 1. Try Saved Config
config = load_wifi_config()
if config:
    connected = start_station_mode(config['ssid'], config['password'])

# 2. Try Secrets.py (Backup)
if not connected:
    try:
        import secrets
        connected = start_station_mode(secrets.SSID, secrets.PASSWORD)
    except ImportError: pass

# 3. Fallback to AP
if connected:
    ip = wlan.ifconfig()[0]
    print(f'Connected! IP: {ip}, http://{HOSTNAME}.local')
    for _ in range(3):
        announce_mdns(ip, HOSTNAME)
        time.sleep(0.1)
else:
    print("STA connection failed. Switching to AP Mode.")
    ap_if, ssid = start_ap_mode()
    print(f"AP Started. SSID: {ssid}, IP: {ap_if.ifconfig()[0]}")