import os
import json
import threading
import socket
import webview
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import ThreadingOSCUDPServer
from pythonosc.udp_client import SimpleUDPClient

class OSCApp:
    def __init__(self):
        self._window = None
        self.server = None
        self.server_thread = None
        self.is_running = False
        self.known_clients = {} # "ip:port" -> {ip, port, enabled, client_obj}

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

    def toggle_client(self, ip, port, enabled):
        """Called from JS to toggle forwarding for a specific client."""
        key = f"{ip}:{port}"
        if key in self.known_clients:
            self.known_clients[key]['enabled'] = enabled
            print(f"Client {key} forwarding set to {enabled}")
            
            # Initialize UDP client if needed
            if enabled and self.known_clients[key]['client_obj'] is None:
                try:
                    self.known_clients[key]['client_obj'] = SimpleUDPClient(ip, int(port))
                except Exception as e:
                    print(f"Error creating OSC client for {key}: {e}")
        else:
            print(f"Warning: Toggled unknown client {key}")

    def handle_osc_message(self, client_address, address, *args):
        """Callback for captured OSC messages."""
        sender_ip = client_address[0]
        sender_port = client_address[1]
        sender_key = f"{sender_ip}:{sender_port}"

        # 1. Register new client
        if sender_key not in self.known_clients:
            self.known_clients[sender_key] = {
                "ip": sender_ip,
                "port": sender_port,
                "enabled": False, # Default disabled to prevent spam/loops initially
                "client_obj": None
            }
            if self._window:
                # Notify JS to add to list
                self._window.evaluate_js(f"addClient('{sender_ip}', {sender_port})")

        # 2. Forwarding Logic
        # Forward to ALL enabled clients EXCEPT the sender
        for key, client_data in self.known_clients.items():
            if client_data['enabled'] and key != sender_key:
                client = client_data['client_obj']
                if client:
                    try:
                        client.send_message(address, args)
                    except Exception as e:
                        print(f"Failed to forward to {key}: {e}")

        # 3. Update UI Log
        if self._window:
            payload = {
                "address": address,
                "args": args,
                "ip": sender_ip,
                "port": sender_port
            }
            # Serialize to JSON and escape for JS string safety
            json_str = json.dumps(payload)
            safe_str = json_str.replace("'", "\'" ).replace('"', '\"')
            
            # Send to JS
            try:
                self._window.evaluate_js(f"addToConsole('{safe_str}')")
            except Exception as e:
                print(f"Error updating UI: {e}")

    def start_server(self, port):
        if self.is_running:
            return {"success": False, "error": "Server already running"}

        try:
            dispatcher = Dispatcher()
            dispatcher.map("*", self.handle_osc_message, needs_reply_address=True) # Wildcard to catch everything

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
    webview.start(debug=False, gui='qt')
