import http.server
import socketserver
import os
import webbrowser
import threading
import time
from pathlib import Path

PORT = 8086
ROOT_DIR = Path(__file__).parent.parent
TARGET_OUT = ROOT_DIR / "app" / "targets" / "book_targets.mind"
IMAGES_DIR = ROOT_DIR / "trainingImages"

class CompilerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow cross-origin for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        # Serve the images from the trainingImages folder
        if self.path == "/get_image_list":
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            # Find all image files
            valid_exts = ('.webp', '.jpg', '.jpeg', '.png')
            images = [f"/trainingImages/{f}" for f in os.listdir(IMAGES_DIR) if f.lower().endswith(valid_exts)]
            
            import json
            self.wfile.write(json.dumps(images).encode())
            return
            
        # Serve files from root to allow access to trainingImages and compiler folder
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if self.path == "/log":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            print(f"[BROWSER] {post_data.decode()}")
            self.send_response(200)
            self.end_headers()
            return

        if self.path == "/save":

            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Ensure output directory exists
            TARGET_OUT.parent.mkdir(parents=True, exist_ok=True)
            
            with open(TARGET_OUT, "wb") as f:
                f.write(post_data)
            
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Saved")
            
            # Shutdown the server after successful save
            threading.Thread(target=self.stop_server).start()
            return

    def stop_server(self):
        time.sleep(1)
        print("Compilation complete. Server shutting down.")
        os._exit(0)

def run():
    # Change current directory to root to serve images and compiler easily
    os.chdir(ROOT_DIR)
    
    with socketserver.TCPServer(("", PORT), CompilerHandler) as httpd:
        print(f"Compiler server started at http://localhost:{PORT}")
        
        # Open browser to the compiler page
        url = f"http://localhost:{PORT}/compiler/index.html"
        webbrowser.open(url)
        
        # Inject the image list after a short delay to ensure page is ready
        print("Awaiting browser connection...")
        
        # Note: The browser will fetch /get_image_list automatically
        # We need to update index.html to fetch this list.
        
        httpd.serve_forever()

if __name__ == "__main__":
    run()
