import base64
import os
import urllib.request
import re

DIR = os.path.dirname(os.path.abspath(__file__))

# 1. Download non-module Three.js and OrbitControls
print("Downloading global non-module Three.js and OrbitControls...")
three_js_url = "https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.js"
orbit_controls_url = "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"

three_js_code = urllib.request.urlopen(three_js_url).read().decode('utf-8')
orbit_controls_code = urllib.request.urlopen(orbit_controls_url).read().decode('utf-8')

# 2. Read local manifold wrapper and WASM
print("Reading Manifold library and converting WASM to Base64...")
manifold_js_path = os.path.join(DIR, "lib", "manifold.js")
manifold_wasm_path = os.path.join(DIR, "lib", "manifold.wasm")

with open(manifold_js_path, "r", encoding="utf-8") as f:
    manifold_js_code = f.read()

# Remove import.meta.url to prevent SyntaxError in non-module scripts
manifold_js_code = manifold_js_code.replace("import.meta.url", "'http://localhost/'")
# Remove export default Module to prevent SyntaxError in non-module scripts
manifold_js_code = manifold_js_code.replace("export default Module;", "window.Module = Module;")

with open(manifold_wasm_path, "rb") as f:
    wasm_base64 = base64.b64encode(f.read()).decode('utf-8')

# 3. Read fonts and convert to Base64 data URLs
print("Embedding fonts as Base64 data URLs...")
font_files = {
    "sharetechmono-normal-400.ttf": "Share Tech Mono",
    "spacemono-italic-400.ttf": "Space Mono Italic 400",
    "spacemono-italic-700.ttf": "Space Mono Italic 700",
    "spacemono-normal-400.ttf": "Space Mono Normal 400",
    "spacemono-normal-700.ttf": "Space Mono Normal 700"
}

fonts_css = ""
# Generate custom font CSS using data URLs
for filename, desc in font_files.items():
    font_path = os.path.join(DIR, "lib", "fonts", filename)
    if os.path.exists(font_path):
        with open(font_path, "rb") as f:
            b64_font = base64.b64encode(f.read()).decode('utf-8')
        
        family = "Share Tech Mono" if "sharetech" in filename else "Space Mono"
        style = "italic" if "italic" in filename else "normal"
        weight = "700" if "700" in filename else "400"
        
        fonts_css += f"""
@font-face {{
  font-family: '{family}';
  font-style: {style};
  font-weight: {weight};
  font-display: swap;
  src: url('data:font/truetype;base64,{b64_font}') format('truetype');
}}
"""

# 4. Read main stylesheets
print("Reading CSS files...")
style_css_path = os.path.join(DIR, "style.css")
with open(style_css_path, "r", encoding="utf-8") as f:
    style_css = f.read()

# Combine all CSS
combined_css = fonts_css + "\n" + style_css

# 5. Read app.js and strip imports (since we use global variables)
print("Processing app.js...")
app_js_path = os.path.join(DIR, "app.js")
with open(app_js_path, "r", encoding="utf-8") as f:
    app_js = f.read()

# Remove ES imports at the top
app_js = re.sub(r"import\s+.*?\s+from\s+['\"].*?['\"];?", "", app_js)

# We also need to map "OrbitControls" to "THREE.OrbitControls" if needed, 
# but Three's global OrbitControls attaches directly to THREE.OrbitControls!
# Let's check how app.js uses OrbitControls:
# Line 135: `controls = new OrbitControls(camera, renderer.domElement);`
# If we define `const OrbitControls = THREE.OrbitControls;` at the top of app.js, it will work perfectly!
app_js = "const OrbitControls = THREE.OrbitControls;\n" + app_js

# Override initManifold in app.js to use the embedded Base64 WASM
wasm_init_override = f"""
// Helper to decode Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {{
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {{
        bytes[i] = binary_string.charCodeAt(i);
    }}
    return bytes.buffer;
}}

const embeddedWasmBinary = base64ToArrayBuffer("{wasm_base64}");

async function initManifold() {{
    try {{
        // Initialize manifold with the pre-loaded WASM binary
        wasm = await Module({{ wasmBinary: embeddedWasmBinary }});
        wasm.setup();
        Manifold = wasm.Manifold;
        console.log("Manifold geometry kernel successfully initialized from embedded WASM");
        rebuild();
    }} catch(e) {{
        console.error("Failed to load Manifold WASM.", e);
        const footerStatus = document.querySelector('footer div.status-left span:last-child');
        if (footerStatus) footerStatus.textContent = "MANIFOLD LOAD FAILED (PLACEHOLDERS ACTIVE)";
    }}
}}
"""

# Replace the original async function initManifold() { ... } with our override
app_js = re.sub(r"async function initManifold\(\).*?\}\n\n// --- Core Geometric Modeling Logic ---", 
                wasm_init_override + "\n\n// --- Core Geometric Modeling Logic ---", 
                app_js, flags=re.DOTALL)

# 6. Read HTML template and inject everything
print("Building single standalone HTML file...")
html_path = os.path.join(DIR, "index.html")
with open(html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

# Strip script type="importmap" and stylesheets
html_content = re.sub(r"<script type=\"importmap\">.*?</script>", "", html_content, flags=re.DOTALL)
html_content = re.sub(r"<link rel=\"stylesheet\" href=\"lib/fonts.css\">", "", html_content)
html_content = re.sub(r"<link rel=\"stylesheet\" href=\"style.css\">", "", html_content)
html_content = re.sub(r"<script type=\"module\" src=\"app.js\"></script>", "", html_content)

# Inject combined CSS into <head>
css_tag = f"<style>\n{combined_css}\n</style>"
html_content = html_content.replace("</head>", f"{css_tag}\n</head>")

# Inject all JavaScript before </body>
scripts_block = f"""
<script>
{three_js_code}
</script>
<script>
{orbit_controls_code}
</script>
<script>
{manifold_js_code}
</script>
<script>
{app_js}
</script>
"""
html_content = html_content.replace("</body>", f"{scripts_block}\n</body>")

# Save the final standalone file
output_path = os.path.join(DIR, "stm32case_standalone.html")
with open(output_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Success! Standalone single-file HTML generated at: {output_path}")
