import network
import time

wlan = network.WLAN(network.STA_IF)
wlan.active(True)

print("Scanning for networks...")
try:
    nets = wlan.scan()
    print(f"Found {len(nets)} networks:")
    for net in nets:
        # ssid, bssid, channel, RSSI, authmode, hidden
        ssid = net[0].decode('utf-8')
        rssi = net[3]
        print(f" - {ssid} (RSSI: {rssi})")
except Exception as e:
    print(f"Scan failed: {e}")

print("\nChecking connection...")
if wlan.isconnected():
    print("Connected!")
else:
    print("Not connected. Trying to connect...")
    wlan.active(False)
    time.sleep(1)
    wlan.active(True)
    time.sleep(1)
    
    try:
        import secrets
        wlan.connect(secrets.SSID, secrets.PASSWORD)
        for _ in range(15):
            status = wlan.status()
            if wlan.isconnected():
                print(f"Connected! IP: {wlan.ifconfig()[0]}")
                break
            print(f"Status: {status}...")
            time.sleep(1)
        else:
            print("Failed to connect.")
    except Exception as e:
        print(f"Connection error: {e}")