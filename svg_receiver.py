import http.server
import socketserver
import urllib.parse
import os
import sys

# Simple server to receive SVG data via POST and save it to a file.
# This keeps the multi-megabyte SVG strings out of the AI context.

class SVGHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        # Get filename from query param ?name=desktop
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        name = params.get('name', ['background'])[0]
        filename = f"{name}.svg"
        
        filepath = os.path.join(os.getcwd(), filename)
        with open(filepath, 'wb') as f:
            f.write(post_data)
            
        print(f"Captured and saved: {filename} ({len(post_data)} bytes)")
        
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b"Saved success")

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

PORT = 8081
# Using allow_reuse_address to avoid "Address already in use" errors on restarts
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), SVGHandler) as httpd:
    print(f"SVG Receiver listening on port {PORT}...")
    # Handle exactly two requests (Desktop and Mobile) then exit
    httpd.handle_request()
    httpd.handle_request()
    print("Received both files. Server shutting down.")
