# GEMINI.md - Agent Instructions for Art-Net Silliness

Welcome! When working on this project, please consult **[`AGENTS.md`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/AGENTS.md)** for complete architectural documentation, hardware topology, Art-Net network configurations, and audio processing details.

## Quick Reference
* **Hardware Controller**: Showtec / DMT Pixelstrip Controller MKII (IP: `192.168.0.100`)
* **Fixtures**: DMT PixelStrip P25 MKII (40 RGB LEDs / 120 channels per tube)
* **Main Sound Engine**: [`artnet/audio_artnet.py`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/artnet/audio_artnet.py)
* **Web UI Server**: [`artnet/server.js`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/artnet/server.js) (Express port 3000)
* **Web UI Dashboard**: [`artnet/public/index.html`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/artnet/public/index.html)
* **Hardware Port Tester**: [`artnet/test_ports.py`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/artnet/test_ports.py)
* **Web Portfolio Simulator**: [`index.html`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/index.html) and [`scripts.js`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/scripts.js)

For full hardware diagnosis history, daisy-chaining rules, and transient audio detection specs, see **[`AGENTS.md`](file:///c:/Users/Dillo/OneDrive/Desktop/Github/Website/public/MiniProjects/artNetSilliness/AGENTS.md)**.
