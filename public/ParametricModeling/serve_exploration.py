import http.server
import socketserver
import webbrowser
import os

PORT = 8080
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

print(f"Starting server at http://localhost:{PORT}")
print("Serving Parametric Modeling Explorations...")

# Start the server and open the browser
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    webbrowser.open(f"http://localhost:{PORT}/01-ForgeCAD/")
    webbrowser.open(f"http://localhost:{PORT}/02-OpenJSCAD/")
    webbrowser.open(f"http://localhost:{PORT}/03-Manifold/")
    httpd.serve_forever()
