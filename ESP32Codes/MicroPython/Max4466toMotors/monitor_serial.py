import serial
import time

port = 'COM5'
baud = 115200
duration = 30 # Monitor for 30 seconds

print(f"Attempting to open {port}...")

ser = None
# Retry connecting for 5 seconds
for i in range(5):
    try:
        ser = serial.Serial(port, baud, timeout=1)
        break
    except Exception as e:
        print(f"Waiting for port... ({e})")
        time.sleep(1)

if not ser:
    print("Failed to open port. Is the device plugged in?")
    exit(1)

print("Port opened! PLEASE PRESS THE RESET BUTTON ON THE ESP32 NOW!")

try:
    start_time = time.time()
    while (time.time() - start_time) < duration:
        if ser.in_waiting > 0:
            try:
                line = ser.readline().decode('utf-8', errors='replace').strip()
                if line:
                    print(f"[ESP32]: {line}")
            except Exception as e:
                print(f"Read error: {e}")
        time.sleep(0.01)
except KeyboardInterrupt:
    print("Stopped.")
finally:
    ser.close()
    print("Port closed.")