import os
import time
import uuid
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
API_KEY = os.getenv("GOVEE_API_KEY")

BASE_URL = "https://openapi.api.govee.com"

def get_headers():
    return {
        "Content-Type": "application/json",
        "Govee-API-Key": API_KEY
    }

def get_devices():
    """Fetch all devices associated with the account."""
    url = f"{BASE_URL}/router/api/v1/user/devices"
    try:
        response = requests.get(url, headers=get_headers())
        response.raise_for_status()
        data = response.json()
        if data.get("code") == 200:
            return data.get("data", [])
        else:
            print(f"Error getting devices: {data}")
            return []
    except Exception as e:
        print(f"Exception fetching devices: {e}")
        return []

def control_device(sku, device_mac, turn_on=True):
    """Turn a device on or off."""
    url = f"{BASE_URL}/router/api/v1/device/control"
    
    # Construct payload for On/Off
    # Capability: type="devices.capabilities.on_off", instance="powerSwitch", value=1 (on) or 0 (off)
    payload = {
        "requestId": str(uuid.uuid4()),
        "payload": {
            "sku": sku,
            "device": device_mac,
            "capability": {
                "type": "devices.capabilities.on_off",
                "instance": "powerSwitch",
                "value": 1 if turn_on else 0
            }
        }
    }

    try:
        response = requests.post(url, headers=get_headers(), json=payload)
        response.raise_for_status()
        res_data = response.json()
        status = "ON" if turn_on else "OFF"
        if res_data.get("code") == 200 and "success" in res_data.get("msg", "").lower():
             print(f"Success: Turned {status} device {device_mac} (SKU: {sku})")
        else:
             print(f"Failed to turn {status} device {device_mac}: {res_data}")
    except Exception as e:
        print(f"Exception controlling device {device_mac}: {e}")

def main():
    if not API_KEY:
        print("Error: GOVEE_API_KEY not found in .env file.")
        return

    print("Fetching devices...")
    devices = get_devices()
    
    if not devices:
        print("No devices found or error occurred.")
        return

    print(f"Found {len(devices)} devices.")

    for dev in devices:
        sku = dev.get("sku")
        device_mac = dev.get("device")
        name = dev.get("deviceName", "Unknown Device")
        
        print(f"\nProcessing: {name} (SKU: {sku}, MAC: {device_mac})")
        
        # Turn ON
        print("  -> Turning ON...")
        control_device(sku, device_mac, turn_on=True)
        
        time.sleep(2) # Wait a bit
        
        # Turn OFF
        print("  -> Turning OFF...")
        control_device(sku, device_mac, turn_on=False)

if __name__ == "__main__":
    main()
