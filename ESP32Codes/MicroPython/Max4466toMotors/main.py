import machine
import time
import socket
import json
import gc
import network
import uselect
import struct

# --- Configuration ---
MIC_PIN = 3  # ADC (GPIO 3)
GND_PIN = 4  # Virtual Ground (GPIO 4)
SETTINGS_FILE = "settings.json"
WIFI_CONFIG_FILE = "wifi_config.json"
DNS_PORT = 53
HTTP_PORT = 80

# --- Hardware Init ---
# Virtual Ground for MAX4466
try:
    gnd = machine.Pin(GND_PIN, machine.Pin.OUT)
    gnd.value(0)
except Exception as e:
    print("GND Pin Init Error:", e)

# Mic ADC
adc = machine.ADC(machine.Pin(MIC_PIN))
adc.atten(machine.ADC.ATTN_11DB) # Range 0-3.3V roughly
adc.width(machine.ADC.WIDTH_12BIT)

# Motors
# Dictionary mapping pin_number -> PWM object
pwm_motors = {}

settings = {
    "motors": [],  # List of {id: int, pin: int, min_v: int, max_v: int, min_d: int, max_d: int, name: str}
    "smoothing": 0.2
}

current_vol = 0
smoothed_vol = 0

def load_settings():
    global settings
    try:
        with open(SETTINGS_FILE, "r") as f:
            stored = json.load(f)
            # Simple merge to ensure keys exist
            for k, v in stored.items():
                settings[k] = v
    except:
        print("No settings file, using defaults.")
    reinit_motors()

def save_settings():
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f)
    except Exception as e:
        print("Save error:", e)
    reinit_motors()

def reinit_motors():
    global pwm_motors
    # Clean up old PWMs
    for p in pwm_motors.values():
        try: p.deinit() 
        except: pass
    pwm_motors = {}
    
    for m in settings.get("motors", []):
        try:
            pin_num = int(m.get("pin"))
            # Don't init if pin is invalid or conflicts with mic/gnd (though user should know better)
            if pin_num not in [MIC_PIN, GND_PIN]:
                pin = machine.Pin(pin_num, machine.Pin.OUT)
                pwm = machine.PWM(pin, freq=1000)
                pwm.duty(0)
                pwm_motors[pin_num] = pwm
        except Exception as e:
            print(f"Error init motor pin {m.get('pin')}: {e}")

def get_volume(duration_ms=20):
    # Sample peak-to-peak
    min_val = 65535
    max_val = 0
    start = time.ticks_ms()
    
    # Sample window
    while time.ticks_diff(time.ticks_ms(), start) < duration_ms:
        val = adc.read()
        if val < min_val: min_val = val
        if val > max_val: max_val = val
        
    return max_val - min_val

def map_range(x, in_min, in_max, out_min, out_max):
    # Linear mapping
    if in_max == in_min: return out_min
    val = (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min
    return val

def update_motors(vol):
    for m in settings.get("motors", []):
        try:
            pin_num = int(m.get("pin"))
            pwm = pwm_motors.get(pin_num)
            if pwm:
                min_v = int(m.get("min_v", 0))
                max_v = int(m.get("max_v", 4095))
                min_d = int(m.get("min_d", 0))
                max_d = int(m.get("max_d", 100))
                
                # Constrain input volume
                v = max(min_v, min(vol, max_v))
                
                # Calculate duty (0-1023)
                # min_d/max_d are in percent (0-100)
                out_min = int(min_d * 10.23)
                out_max = int(max_d * 10.23)
                
                duty = int(map_range(v, min_v, max_v, out_min, out_max))
                # Constrain output duty
                duty = max(0, min(duty, 1023))
                
                pwm.duty(duty)
        except: pass

# --- Web Server Helpers ---
def send_response(conn, payload, content_type="application/json", status=200):
    try:
        conn.send(f'HTTP/1.1 {status} OK\r\n'.encode())
        conn.send(f'Content-Type: {content_type}\r\n'.encode())
        conn.send('Connection: close\r\n\r\n'.encode())
        conn.send(payload)
    except: pass
    finally: conn.close()

def send_redirect(conn, location):
    try:
        conn.send('HTTP/1.1 302 Found\r\n'.encode())
        conn.send(f'Location: {location}\r\n'.encode())
        conn.send('Connection: close\r\n\r\n'.encode())
    except: pass
    finally: conn.close()

def serve_file_chunked(conn, filename, content_type="text/html"):
    try:
        conn.send('HTTP/1.1 200 OK\r\n'.encode())
        conn.send(f'Content-Type: {content_type}\r\n'.encode())
        conn.send('Connection: close\r\n\r\n'.encode())
        with open(filename, 'rb') as f:
            while True:
                chunk = f.read(1024)
                if not chunk: break
                conn.send(chunk)
    except: pass
    finally: conn.close()

# --- DNS Server (Captive Portal) ---
def handle_dns(sock, ap_ip):
    try:
        data, addr = sock.recvfrom(1024)
        # Parse DNS Header (Transaction ID, Flags, Questions, Answers...)
        # Minimal response: Redirect EVERYTHING to our IP
        
        # Extract Transaction ID (bytes 0-1)
        tid = data[:2]
        
        # Flags: Standard Query Response (0x8180)
        # 1... .... .... .... = Response
        # .000 0... .... .... = Opcode Standard Query
        # .... .0.. .... .... = Authoritative Answer
        # .... ..0. .... .... = Truncated
        # .... ...1 .... .... = Recursion Desired
        # .... .... 1... .... = Recursion Available
        # .... .... .000 .... = Reserved
        # .... .... .... 0000 = No Error
        flags = b'\x81\x80'
        
        # Questions count (bytes 4-5) - usually 1
        qdcount = data[4:6]
        # Answer count (1)
        ancount = b'\x00\x01'
        # Auth/Add count (0)
        nscount = b'\x00\x00'
        arcount = b'\x00\x00'
        
        # Parse Query Section to copy it back
        # QNAME ends with 0x00
        i = 12
        while data[i] != 0:
            i += 1
        qname_end = i + 1
        # QTYPE (2 bytes) + QCLASS (2 bytes)
        query_section = data[12:qname_end+4]
        
        # Build Answer
        # Name ptr (0xC00C pointing to the QNAME at offset 12)
        ans_name = b'\xc0\x0c'
        # Type A (1)
        ans_type = b'\x00\x01'
        # Class IN (1)
        ans_class = b'\x00\x01'
        # TTL (60s)
        ans_ttl = b'\x00\x00\x00\x3c'
        # Data Length (4 bytes for IPv4)
        ans_len = b'\x00\x04'
        # IP Address
        ip_parts = [int(x) for x in ap_ip.split('.')]
        ans_ip = struct.pack('BBBB', *ip_parts)
        
        response = tid + flags + qdcount + ancount + nscount + arcount + query_section + ans_name + ans_type + ans_class + ans_ttl + ans_len + ans_ip
        
        sock.sendto(response, addr)
    except Exception as e:
        print("DNS Err:", e)

# --- Init ---
load_settings()

# Determine Mode (AP or STA)
wlan_ap = network.WLAN(network.AP_IF)
wlan_sta = network.WLAN(network.STA_IF)

# If AP is active, we need DNS for Captive Portal
dns_sock = None
if wlan_ap.active():
    my_ip = wlan_ap.ifconfig()[0]
    print(f"AP Mode Active. IP: {my_ip}")
    try:
        dns_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        dns_sock.setblocking(False)
        dns_sock.bind(('', DNS_PORT))
        print("DNS Server Started (Captive Portal)")
    except Exception as e:
        print("DNS Start Failed:", e)
else:
    my_ip = wlan_sta.ifconfig()[0]
    print(f"STA Mode Active. IP: {my_ip}")

# HTTP Server
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('', HTTP_PORT))
s.listen(5)
s.setblocking(False)

print("Audio Motor Controller Ready.")

# --- Main Loop ---
while True:
    # 1. Read Audio (Blocking for ~20ms)
    raw_vol = get_volume(20)
    
    # 2. Smoothing
    alpha = settings.get("smoothing", 0.2)
    smoothed_vol = (alpha * raw_vol) + ((1 - alpha) * smoothed_vol)
    
    # 3. Update Motors
    update_motors(smoothed_vol)
    
    # 4. Handle DNS (Captive Portal)
    if dns_sock:
        try:
            # Poll specifically for DNS (non-blocking)
            r, _, _ = uselect.select([dns_sock], [], [], 0)
            if r:
                handle_dns(dns_sock, my_ip)
        except: pass

    # 5. Handle HTTP
    try:
        conn, addr = s.accept()
        conn.settimeout(0.5) 
        try:
            request = conn.recv(1024).decode()
            lines = request.split('\r\n')
            if len(lines) > 0:
                parts = lines[0].split(' ')
                if len(parts) >= 2:
                    method, path = parts[0], parts[1]
                    
                    # API Endpoints
                    if path == '/api/status':
                        data = {"volume": int(smoothed_vol), "raw": raw_vol}
                        send_response(conn, json.dumps(data).encode())
                    elif path == '/api/settings':
                        if method == 'GET':
                            send_response(conn, json.dumps(settings).encode())
                        elif method == 'POST':
                            body = request.split('\r\n\r\n')[-1]
                            try:
                                new_settings = json.loads(body)
                                settings = new_settings
                                save_settings()
                                send_response(conn, b'{"status": "ok"}')
                            except: send_response(conn, b'{"error": "bad json"}', status=400)
                    elif path == '/api/wifi/scan':
                        wlan = network.WLAN(network.STA_IF)
                        wlan.active(True)
                        try:
                            scan_res = wlan.scan()
                            nets = [{"ssid": s[0].decode(), "rssi": s[3], "auth": s[4]} for s in scan_res if s[0]]
                            send_response(conn, json.dumps(nets).encode())
                        except: send_response(conn, b'[]')
                    elif path == '/api/wifi/save':
                        if method == 'POST':
                            body = request.split('\r\n\r\n')[-1]
                            try:
                                creds = json.loads(body)
                                with open(WIFI_CONFIG_FILE, "w") as f: json.dump(creds, f)
                                send_response(conn, b'{"status": "ok"}')
                            except: send_response(conn, b'{"error": "bad json"}', status=400)
                    
                    # Captive Portal Check
                    # If path is '/' or '/index.html', serve the page.
                    # If it's anything else (like /generate_204, /hotspot-detect.html), redirect to /
                    elif path == '/' or path == '/index.html':
                        serve_file_chunked(conn, 'index.html')
                    else:
                        # Catch-all Redirect for Captive Portal
                        send_redirect(conn, f"http://{my_ip}/")
                else: conn.close()
            else: conn.close()
        except Exception as e:
            conn.close()
    except OSError: 
        pass
    except Exception as e: 
        print("Server Error:", e)
