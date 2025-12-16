import machine
import time
import socket
import select
from scd41 import SCD4X

# Setup Hardware
led = machine.Pin(8, machine.Pin.OUT) # Onboard LED
# Using GPIO 3 (SDA) and 4 (SCL) for direct connection to physical pins A3/A4
i2c = machine.I2C(0, scl=machine.Pin(4), sda=machine.Pin(3), freq=100000)

# Initialize Sensor
sensor_ready = False
try:
    scd4x = SCD4X(i2c)
    scd4x.start_periodic_measurement()
    print("SCD41 Initialized")
    sensor_ready = True
except Exception as e:
    print(f"SCD41 Init Error: {e}")

# Global variables for data
co2 = 0
temp = 0.0
hum = 0.0

def read_sensor():
    global co2, temp, hum
    if not sensor_ready: return
    
    if scd4x.get_data_ready_status():
        try:
            c, t, h = scd4x.read_measurement()
            co2 = c
            temp = t
            hum = h
            # print(f"CO2: {co2} ppm, Temp: {temp:.1f} C, Hum: {hum:.1f} %")
        except Exception as e:
            print(f"Read Error: {e}")

# HTML Template
def get_html(co2, temp, hum):
    color = "#4CAF50" # Green
    if co2 > 1000: color = "#FF9800" # Orange
    if co2 > 1500: color = "#F44336" # Red
    
    return f"""HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n
<!DOCTYPE html>
<html>
<head>
  <title>Air Quality (SCD41)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <style>
    body {{ background-color: #121212; color: #ffffff; font-family: sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; height: 100vh; margin: 0; }}
    .card {{ background: #1e1e1e; padding: 2rem; border-radius: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); max-width: 400px; margin: auto; }}
    h1 {{ margin: 0 0 1rem 0; font-size: 1.5rem; color: #aaa; }}
    .value {{ font-size: 4rem; font-weight: bold; color: {color}; margin: 0; }}
    .unit {{ font-size: 1.5rem; color: #888; }}
    .stats {{ display: flex; justify-content: space-around; margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem; }}
    .stat-item {{ font-size: 1.2rem; }}
    .stat-label {{ display: block; font-size: 0.8rem; color: #666; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>CO2 Level</h1>
    <p class="value">{co2}</p>
    <p class="unit">ppm</p>
    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">Temperature</span>
        {temp:.1f} &deg;C
      </div>
      <div class="stat-item">
        <span class="stat-label">Humidity</span>
        {hum:.1f} %
      </div>
    </div>
  </div>
</body>
</html>
"""

# Web Server Setup
addr = socket.getaddrinfo('0.0.0.0', 80)[0][-1]
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(addr)
s.listen(5)
s.setblocking(False)

print('Web server listening on port 80')

# Main Loop
last_read = time.time()
while True:
    # 1. Read Sensor every 5 seconds
    if time.time() - last_read > 5:
        read_sensor()
        last_read = time.time()
        
        # Blink LED briefly
        led.value(not led.value())
        time.sleep(0.1)
        led.value(not led.value())

    # 2. Handle Web Requests (Non-blocking)
    try:
        res = select.select([s], [], [], 0.1)
        if res[0]:
            cl, addr = s.accept()
            request = cl.recv(1024)
            # print('Request from:', addr)
            
            # Simple response
            response = get_html(co2, temp, hum)
            cl.send(response)
            cl.close()
    except Exception as e:
        print(f"Server Error: {e}")
        pass
