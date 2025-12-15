import os
import uuid
import json
import requests
import webview
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()
API_KEY = os.getenv("GOVEE_API_KEY")
BASE_URL = "https://openapi.api.govee.com"

class GoveeApp:
    def __init__(self):
        self.devices_cache = []
        self._window = None

    def set_window(self, window):
        self._window = window

    def log_to_ui(self, message):
        """Send a message to the JS console."""
        print(message) # Keep stdout for debugging
        if self._window:
            # Escape quotes to prevent JS errors
            safe_msg = message.replace("'", "\'" ).replace('"', '\"')
            self._window.evaluate_js(f"addToConsole('{safe_msg}')")

    def get_headers(self):
        return {
            "Content-Type": "application/json",
            "Govee-API-Key": API_KEY
        }

    def get_devices(self):
        """Called from JS to fetch devices."""
        if not API_KEY:
            self.log_to_ui("Error: API Key not found.")
            return []
            
        url = f"{BASE_URL}/router/api/v1/user/devices"
        try:
            self.log_to_ui("Fetching devices from Govee API...")
            response = requests.get(url, headers=self.get_headers())
            response.raise_for_status()
            data = response.json()
            if data.get("code") == 200:
                self.devices_cache = data.get("data", [])
                self.log_to_ui(f"API Success: Found {len(self.devices_cache)} devices.")
                return self.devices_cache
            else:
                self.log_to_ui(f"API Error: {data}")
                return []
        except Exception as e:
            self.log_to_ui(f"Exception fetching devices: {e}")
            return []

    def bulk_control(self, macs, action, value=None):
        """
        macs: list of mac addresses
        action: 'on', 'off', 'color'
        value: int (for color)
        """
        self.log_to_ui(f"Starting bulk control: {action} on {len(macs)} devices.")
        results = []
        for mac in macs:
            # Find SKU
            device = next((d for d in self.devices_cache if d["device"] == mac), None)
            if not device:
                self.log_to_ui(f"Skipping {mac}: Not found in cache.")
                continue
            
            sku = device.get("sku")
            res = self._send_command(sku, mac, action, value)
            results.append(res)
        
        self.log_to_ui("Bulk control completed.")
        return results

    def _send_command(self, sku, mac, action, value):
        url = f"{BASE_URL}/router/api/v1/device/control"
        
        payload_data = {}
        
        if action == 'on':
            payload_data = {
                "sku": sku,
                "device": mac,
                "capability": {
                    "type": "devices.capabilities.on_off",
                    "instance": "powerSwitch",
                    "value": 1
                }
            }
        elif action == 'off':
            payload_data = {
                "sku": sku,
                "device": mac,
                "capability": {
                    "type": "devices.capabilities.on_off",
                    "instance": "powerSwitch",
                    "value": 0
                }
            }
        elif action == 'color':
            payload_data = {
                "sku": sku,
                "device": mac,
                "capability": {
                    "type": "devices.capabilities.color_setting",
                    "instance": "colorRgb",
                    "value": value
                }
            }

        final_payload = {
            "requestId": str(uuid.uuid4()),
            "payload": payload_data
        }

        try:
            self.log_to_ui(f"Sending {action} to {mac}...")
            response = requests.post(url, headers=self.get_headers(), json=final_payload)
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") == 200 and "success" in str(data).lower():
                self.log_to_ui(f" -> Success: {mac}")
            else:
                self.log_to_ui(f" -> Failed: {mac} | {data}")
                
            return data
        except Exception as e:
            self.log_to_ui(f" -> Error controlling {mac}: {e}")
            return {"error": str(e)}

if __name__ == '__main__':
    api = GoveeApp()
    
    # Create window
    entry_point = os.path.join(os.getcwd(), 'web', 'index.html')
    
    window = webview.create_window(
        'Govee Control Station', 
        url=entry_point,
        js_api=api,
        width=1000, 
        height=750,
        resizable=True,
        background_color='#1a1a2e'
    )
    
    api.set_window(window)
    # Force QT because pythonnet (needed for WinForms) is not available on Python 3.14
    webview.start(debug=True, gui='qt')