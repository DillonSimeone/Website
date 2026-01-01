import http.server
import socketserver
import json
import requests
import os
import sys
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("GOVEE_API_KEY")
BASE_URL = "https://openapi.api.govee.com"

PORT = 8080

class GoveeHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Govee-API-Key')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        try:
            print(f"GET Request: {self.path}")
            if self.path == '/api/devices':
                self.handle_get_devices()
            else:
                # Serve static files from 'web' directory
                if self.path == '/':
                    self.path = '/index.html'
                
                # Adjust path to look into 'web' folder
                original_path = self.path
                
                # Check if we are in a PyInstaller bundle
                if hasattr(sys, '_MEIPASS'):
                    base_path = os.path.join(sys._MEIPASS, 'web')
                else:
                    base_path = os.path.join(os.getcwd(), 'web')
                
                requested_file = os.path.join(base_path, self.path.lstrip('/'))
                
                if os.path.exists(requested_file):
                    self.send_response(200)
                    if requested_file.endswith(".html"):
                        self.send_header("Content-type", "text/html")
                    elif requested_file.endswith(".css"):
                        self.send_header("Content-type", "text/css")
                    elif requested_file.endswith(".js"):
                        self.send_header("Content-type", "application/javascript")
                    self.end_headers()
                    with open(requested_file, 'rb') as f:
                        self.wfile.write(f.read())
                else:
                    print(f"404 Not Found: {requested_file}")
                    self.send_error(404, "File not found")
        except Exception as e:
            print(f"Error in do_GET: {e}")
            import traceback
            traceback.print_exc()
            self.send_error(500, f"Internal Server Error: {e}")

    def do_POST(self):
        if self.path == '/api/control':
            self.handle_control()

    def handle_get_devices(self):
        headers = {"Govee-API-Key": API_KEY}
        try:
            r = requests.get(f"{BASE_URL}/router/api/v1/user/devices", headers=headers)
            self.send_response(r.status_code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(r.content)
        except Exception as e:
            self.send_error(500, str(e))

    def handle_control(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        headers = {
            "Govee-API-Key": API_KEY,
            "Content-Type": "application/json"
        }
        try:
            r = requests.post(f"{BASE_URL}/router/api/v1/device/control", headers=headers, data=post_data)
            self.send_response(r.status_code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(r.content)
        except Exception as e:
            self.send_error(500, str(e))

if __name__ == "__main__":
    import webbrowser
    from threading import Timer

    # Enable address reuse to prevent "Address already in use" errors on quick restarts
    socketserver.TCPServer.allow_reuse_address = True

    # Try ports starting from 8080
    while True:
        try:
            # Use ThreadingTCPServer to prevent blocking on single requests
            httpd = socketserver.ThreadingTCPServer(("", PORT), GoveeHandler)
            break
        except OSError:
            print(f"Port {PORT} is busy, trying {PORT + 1}...")
            PORT += 1

    def open_browser():
        webbrowser.open(f"http://localhost:{PORT}")

    print(f"Server starting at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    Timer(1, open_browser).start()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.shutdown()
