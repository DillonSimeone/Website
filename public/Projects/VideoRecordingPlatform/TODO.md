# MYT Multi-Device Video Capture Hub - TODO & Testing Roadmap

## Current Status
- [x] **Enforce Dual HTTP / HTTPS Serving**: Normal HTTP on port 3456 (zero warnings, loads normally) + HTTPS on port 3457 (for strict mobile camera APIs).
- [x] **Dedicated QR Code Tab**: Visible to both users and admins with real-time SVG generation, direct IP links, and HTTP/HTTPS protocol mode toggle.
- [x] **Multicast DNS Responder**: Native Node UDP responder broadcasting `myt.local` on `224.0.0.251:5353`.
- [x] **Screen Wake Lock API**: Live viewfinder badge (`☀️ Screen Awake`) and visibility-change auto-reacquisition.
- [x] **Graceful Audio Fallback**: Camera requests video+audio first, immediately falling back to video-only if microphone is denied or unavailable.
- [x] **Outdoor Ergonomics**: 78px circular thumb shutter button with high-contrast glowing border, pulse animation, and haptic vibration (`navigator.vibrate([60])`).
- [x] **Fairway Offline Buffering**: IndexedDB slice queue with warning badge (`⚠️ OFFLINE: X Slices Buffered`) and automatic flushing upon Wi-Fi reconnection.
- [x] **Session & Roster Persistence**: Auto-discovery of existing disk folders (`storage/recordings/`) and saved state in `storage/sessions.json` and `storage/roster.json`.
- [x] **Automated Take Stitcher**: FFmpeg slice concatenator that merges discrete slices into a complete video file (`takes/take_H1_OS_Browser.webm`) when recording stops.
- [x] **Smart Sync Studio Multi-Angle Mixer**: Supports arbitrary $N$ cameras with dynamic multi-grid, picture-in-picture, auto-director cuts, and ghost overlays.
- [x] **Windows Firewall Script**: Added `scripts/setup_firewall.bat` to configure ports 3456, 3457, and 5353.

---

## 1. Tomorrow's Laptop Testing Plan (Priority #1)

### Environment Setup:
- [ ] **Transfer / Pull to Laptop**: Run `scripts/start_hub.bat` on the laptop.
- [ ] **Wi-Fi Network**: Connect both the laptop and phone to the same Wi-Fi network (either a home/field Wi-Fi router or laptop's built-in Windows Mobile Hotspot).
  - *Note: Avoid testing through a phone's USB tethered personal hotspot, as smartphone kernels enforce AP client isolation between USB and Wi-Fi.*
- [ ] **Run Firewall Script Once**: Execute `scripts/setup_firewall.bat` as Administrator on the laptop to open ports 3456, 3457, and 5353.

### Verification Checklist:
- [ ] **Step 1: Normal HTTP Load (Desktop)**
  - Open `http://localhost:3456` in Firefox / Chrome.
  - Confirm page loads instantly with **no security warnings** or certificate alerts.
- [ ] **Step 2: Phone Scan & Connect**
  - Open the **📱 QR Code** tab on the laptop.
  - Scan the QR code with phone camera (defaults to `http://<laptop-ip>:3456`).
  - Confirm phone browser opens the hub immediately without hanging.
- [ ] **Step 3: Camera & Viewfinder Check**
  - In phone browser, check if camera streams video.
  - If mobile browser requires secure origin for camera, toggle the QR tab to **🔒 Secure HTTPS Mode** (`https://<laptop-ip>:3457`), scan, accept the certificate once via *"Advanced -> Proceed"*, and verify camera feed.
- [ ] **Step 4: Screen Wake Lock**
  - Leave phone on the viewfinder for 3 minutes without touching the screen.
  - Confirm screen stays awake and does not auto-lock.
- [ ] **Step 5: Multi-Device Recording Test**
  - Connect Phone A and Phone B to the same session and player.
  - Record a 15-second throw using the thumb shutter button on both phones.
  - Stop recording and verify discrete slices and merged takes appear in `storage/recordings/`.
- [ ] **Step 6: Smart Sync Studio Multi-Angle Replay**
  - Switch to Admin Mode $\rightarrow$ **🎛️ Smart Sync Studio**.
  - Scan overlaps and verify both camera angles play back synchronized in Multi-Grid and PiP modes.

---

## 2. Offline & Trip Architecture (Zero-Internet Operations)

### Answering: "Would this work without internet on trips?"
* **Yes!** The entire MYT Hub stack runs 100% locally on the host laptop. It does not require any external internet connection, cloud server, or external DNS when operating on the course.
* **Network Hardware Recommendation**:
  - A small pocket travel router (e.g. GL.iNet GL-MT300N or TP-Link travel router, ~$30) plugged into the cart/laptop USB for power.
  - The router creates a fast private 5GHz Wi-Fi bubble with zero AP isolation and zero internet required.
  - Phones connect to the router Wi-Fi and access the hub directly via local IP (e.g., `http://192.168.8.1:3456`).
* **Service Worker Caching**:
  - Verify `sw.js` caches `index.html`, `app.js`, and `style.css` so phones can open the PWA even if momentarily disconnected.

---

## 3. Future Roadmap & Native App Packaging

- [ ] **Capacitor Mobile App Wrapper**:
  - Evaluate bundling the client front-end into an installable Android APK via Capacitor.
  - Benefits: Native OS camera permissions, zero browser URL bar, zero certificate prompts, runs offline natively on dedicated crew phones.
- [ ] **Electron Desktop Launcher**:
  - Wrap `server.js` and the admin dashboard in Electron for a 1-click Windows/Mac desktop application.
- [ ] **Automatic LAN Discovery**:
  - Implement UDP broadcast beacon so mobile devices automatically find the laptop's IP address without typing it.
