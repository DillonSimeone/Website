import machine
import time
import socket
import json
import neopixel
import os
import struct
import ntptime
import math
import gc
from scd41 import SCD4X

# --- Configuration ---
LED_PIN = 5
SETTINGS_FILE = "settings.json"
LOG_FILE = "data.csv"
BACKUP_FILE = "data.bak"
MAX_LOG_SIZE = 50 * 1024 # 50KB limit before rotation

# --- Hardware Init ---
i2c = machine.SoftI2C(sda=machine.Pin(3), scl=machine.Pin(4), freq=100000)
scd4x = SCD4X(i2c)
scd4x.start_periodic_measurement()

np = None 
settings = {}
current_data = {"co2": 0, "temp": 0.0, "hum": 0.0, "dew_point": 0.0}

# --- Time Sync ---
def sync_time():
    try:
        ntptime.settime()
        print("Time synced via NTP")
    except:
        print("NTP sync failed (no internet?)")

# --- Helpers ---
def calculate_dew_point(T, RH):
    try:
        # Magnus formula
        b = 17.62
        c = 243.12
        gamma = math.log(RH / 100.0) + (b * T) / (c + T)
        dew_point = (c * gamma) / (b - gamma)
        return dew_point
    except:
        return 0.0

def init_neopixel(count):
    global np
    if np is None or len(np) != count:
        np = neopixel.NeoPixel(machine.Pin(LED_PIN), count)

def load_settings():
    global settings
    try:
        with open(SETTINGS_FILE, "r") as f:
            settings = json.load(f)
    except:
        settings = {
            "num_pixels": 1, 
            "flash_rate_hz": 1.0,
            "log_interval_sec": 60,
            "thresholds": [{"ppm": 0, "color1": "#00FF00", "brightness": 0.1, "flashing": False}]
        }
    init_neopixel(settings.get("num_pixels", 1))

def save_settings():
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f)
        init_neopixel(settings.get("num_pixels", 1))
    except Exception as e:
        print("Save error:", e)

def hex_to_rgb(hex_str):
    if not hex_str: return (0,0,0)
    if hex_str.startswith("#"): hex_str = hex_str[1:]
    try:
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    except: return (0,0,0)

def update_led():
    if not np: return
    
    co2 = current_data["co2"]
    flash_rate = settings.get("flash_rate_hz", 1.0)
    thresholds = sorted(settings.get("thresholds", []), key=lambda x: x["ppm"])
    
    active_rule = None
    for t in thresholds:
        if co2 >= t["ppm"]:
            active_rule = t
            
    if not active_rule:
        color = (0,0,0)
    else:
        brightness = active_rule.get("brightness", 0.3)
        c1 = hex_to_rgb(active_rule.get("color1", "#000000"))
        
        if active_rule.get("flashing", False):
            c2 = hex_to_rgb(active_rule.get("color2", "#000000"))
            period_ms = 1000.0 / max(0.1, flash_rate)
            phase = (time.ticks_ms() % int(period_ms)) / period_ms
            target_rgb = c1 if phase < 0.5 else c2
        else:
            target_rgb = c1
            
        color = (
            int(target_rgb[0] * brightness),
            int(target_rgb[1] * brightness),
            int(target_rgb[2] * brightness)
        )
    
    for i in range(len(np)):
        np[i] = color
    np.write()

# --- Logger ---
def log_data(co2, temp, hum):
    try:
        size = os.stat(LOG_FILE)[6]
        if size > MAX_LOG_SIZE:
            try: os.remove(BACKUP_FILE)
            except: pass
            os.rename(LOG_FILE, BACKUP_FILE)
    except OSError: pass

    try:
        t = time.time()
        line = f"{t},{co2},{temp:.1f},{hum:.1f}\n"
        with open(LOG_FILE, "a") as f:
            f.write(line)
    except: pass

def get_recent_history():
    # Only keep last 500 items to avoid OOM
    buffer = []
    max_len = 500
    
    def process_file(fname):
        try:
            with open(fname, "r") as f:
                for line in f:
                    parts = line.strip().split(',')
                    if len(parts) >= 4:
                        try:
                            item = {"ts": int(parts[0]), "co2": int(parts[1])}
                            buffer.append(item)
                            if len(buffer) > max_len:
                                buffer.pop(0)
                        except: pass
        except: pass

    process_file(BACKUP_FILE)
    process_file(LOG_FILE)
    return buffer

# --- Web Server Helpers ---
def send_response(conn, payload, content_type="application/json", status=200):
    try:
        conn.send(f'HTTP/1.1 {status} OK\r\n'.encode())
        conn.send(f'Content-Type: {content_type}\r\n'.encode())
        conn.send('Connection: close\r\n\r\n'.encode())
        conn.send(payload)
    except: pass
    finally: conn.close()

def stream_json_array(conn, data_list):
    try:
        conn.send('HTTP/1.1 200 OK\r\n'.encode())
        conn.send('Content-Type: application/json\r\n'.encode())
        conn.send('Connection: close\r\n\r\n'.encode())
        conn.send(b'[')
        
        first = True
        for item in data_list:
            if not first:
                conn.send(b',')
            conn.send(json.dumps(item).encode())
            first = False
            
        conn.send(b']')
    except: pass
    finally: conn.close()

def send_file_download(conn):
    try:
        conn.send('HTTP/1.1 200 OK\r\n'.encode())
        conn.send('Content-Type: text/csv\r\n'.encode())
        conn.send('Content-Disposition: attachment; filename="co2_log.csv"\r\n'.encode())
        conn.send('Connection: close\r\n\r\n'.encode())
        # Stream files
        try:
            with open(BACKUP_FILE, "r") as f:
                while True:
                    chunk = f.read(1024)
                    if not chunk: break
                    conn.send(chunk)
        except: pass
        try:
            with open(LOG_FILE, "r") as f:
                while True:
                    chunk = f.read(1024)
                    if not chunk: break
                    conn.send(chunk)
        except: pass
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

# --- Init ---
load_settings()
sync_time()

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('', 80))
s.listen(5)
s.setblocking(False)

print("System Ready.")

# --- Main Loop ---
last_read_time = 0
last_led_time = 0
last_log_time = time.time()

while True:
    now = time.ticks_ms()
    
    # 1. Read Sensor (every 2s)
    if time.ticks_diff(now, last_read_time) > 2000:
        if scd4x.get_data_ready_status():
            try:
                c, t, h = scd4x.read_measurement()
                dp = calculate_dew_point(t, h)
                current_data["co2"] = c
                current_data["temp"] = t
                current_data["hum"] = h
                current_data["dew_point"] = dp
            except: pass
            last_read_time = now

    # 2. Log Data
    interval = settings.get("log_interval_sec", 60)
    if time.time() - last_log_time > interval:
        if current_data["co2"] > 0:
            log_data(current_data["co2"], current_data["temp"], current_data["hum"])
            last_log_time = time.time()
            gc.collect() # Clean up after file ops

    # 3. Update LED
    if time.ticks_diff(now, last_led_time) > 50:
        try: update_led()
        except: pass
        last_led_time = now
        
    # 4. Web Server
    try:
        conn, addr = s.accept()
        conn.settimeout(2.0)
        request = conn.recv(1024).decode()
        
        lines = request.split('\r\n')
        if len(lines) > 0:
            parts = lines[0].split(' ')
            if len(parts) >= 2:
                method, path = parts[0], parts[1]
                
                if path == '/':
                    serve_file_chunked(conn, 'index.html')
                elif path == '/api/data':
                    send_response(conn, json.dumps(current_data).encode())
                elif path == '/api/ppm':
                    # Simplified endpoint for venting system
                    send_response(conn, json.dumps({"ppm": current_data["co2"]}).encode())
                elif path == '/api/history':
                    history = get_recent_history()
                    stream_json_array(conn, history)
                    del history # Free memory immediately
                    gc.collect()
                elif path == '/api/download':
                    send_file_download(conn)
                elif path == '/api/settings':
                    if method == 'GET':
                        send_response(conn, json.dumps(settings).encode())
                    elif method == 'POST':
                        body = request.split('\r\n\r\n')[-1]
                        try:
                            new_settings = json.loads(body)
                            settings.update(new_settings)
                            save_settings()
                            send_response(conn, b'{"status": "ok"}')
                        except:
                            send_response(conn, b'{"error": "bad json"}', status=400)
                else:
                    send_response(conn, b'Not Found', status=404)
            else:
                conn.close()
        else:
            conn.close()
    except OSError: pass
    except Exception as e: print("Server Error:", e)
