import os
import json
import threading
import socket
import webview
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer

class OSCApp:
    def __init__(self):
        self._window = None
        self.server = None
        self.server_thread = None
        self.is_running = False

    def set_window(self, window):
        self._window = window

    def get_ip_address(self):
        """Returns the local IP address."""
        try:
            # Connect to a public DNS server to determine the most appropriate local IP
            # No data is actually sent.
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def on_closing(self):
        self.stop_server()

    def handle_osc_message(self, address, *args):
        """Callback for captured OSC messages."""
        if self._window:
            payload = {
                "address": address,
                "args": args
            }
            # Serialize to JSON and escape for JS string safety
            json_str = json.dumps(payload)
            safe_str = json_str.replace("'", "\'" ).replace('"', '\"')
            
            # Send to JS
            # Note: evaluate_js from a thread other than the UI thread works in pywebview
            try:
                self._window.evaluate_js(f"addToConsole('{safe_str}')")
            except Exception as e:
                print(f"Error updating UI: {e}")

    def start_server(self, port):
        if self.is_running:
            return {"success": False, "error": "Server already running"}

        try:
            dispatcher = Dispatcher()
            dispatcher.map("*", self.handle_osc_message) # Wildcard to catch everything

            # 0.0.0.0 listens on all interfaces
            self.server = ThreadingOSCUDPServer(("0.0.0.0", port), dispatcher)
            
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()
            
            self.is_running = True
            print(f"OSC Server started on port {port}")
            return {"success": True}
        except Exception as e:
            print(f"Failed to start server: {e}")
            return {"success": False, "error": str(e)}

    def stop_server(self):
        if self.server and self.is_running:
            print("Stopping OSC Server...")
            self.server.shutdown()
            self.server.server_close()
            self.is_running = False
            self.server = None
            return {"success": True}
        return {"success": False, "error": "Server not running"}

if __name__ == '__main__':
    api = OSCApp()
    
    entry_point = os.path.join(os.getcwd(), 'web', 'index.html')
    
    window = webview.create_window(
        'OSC WebApp Monitor', 
        url=entry_point,
        js_api=api,
        width=800, 
        height=600,
        resizable=True,
        background_color='#1a1a2e'
    )
    
    api.set_window(window)
    window.events.closed += api.on_closing
    
    # gui='qt' forces the Qt backend (PyQt6/PySide6)
    webview.start(debug=True, gui='qt')
