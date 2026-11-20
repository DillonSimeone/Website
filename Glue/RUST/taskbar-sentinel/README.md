# Taskbar Sentinel 🛡️⚡

A high-performance, native Windows 11 taskbar telemetry and energy monitoring widget engineered in **Rust**. It docks in the bottom-left corner of the primary display—overlaying the default Windows weather area to block unwanted MSN flyouts while rendering real-time system metrics, live hardware wattage, and estimated electricity costs.

---

## Features

* **🛡️ Weather Shield**: Pinned directly over the bottom-left taskbar region (`X=4, Y=1036, W=340, H=40` on 1080p). Completely intercepts mouse clicks, preventing the Windows MSN news/weather flyout and taskbar context menus from interfering.
* **⚡ 5-in-1 Real-Time Telemetry**:
  * **🔲 CPU %**: Processor utilization with a cyan accent micro-bar (`#4fc3f7`).
  * **🧠 RAM %**: Physical memory load with a neon green micro-bar (`#69f0ae`).
  * **💾 DSK**: Real-time physical disk bandwidth (MB/s) via Windows PDH with an amber micro-bar (`#ffd740`).
  * **⚡ PWR (Watts)**: Live total wall draw modeled from hardware sensors with a flame orange micro-bar (`#ff9100`).
    * **Direct GPU Hardware Shunt**: Queries NVIDIA RTX 5060 Ti milliwatts via **NVML** (`nvml.dll`).
    * **AMD Ryzen 5 3600XT Dynamic Package Model**: Calculates CPU load wattage ($16\text{W} \rightarrow 95\text{W}$).
    * **Base System & 80+ Gold PSU Efficiency**: Accounts for motherboard, RAM, fans, and 90% power supply conversion.
  * **💵 EST (Monthly Cost)**: Projected monthly electricity running cost (e.g. `$11.2/m`) with an emerald green micro-bar (`#00e676`).
* **🖱️ Native Mouse Controls & Settings**:
  * **Left-Click**: Instantly launches **Windows Task Manager** (`taskmgr.exe`).
  * **Right-Click**: Opens a native Rust popup menu (completely replacing default Windows taskbar popups):
    * `Open Task Manager`
    * `⚡ Electricity Rate ($/kWh)` Submenu:
      * Quick presets: `$0.12`, `$0.16`, `$0.20`, `$0.28`, `$0.36 / kWh`
      * `Custom Rate (Input Box)...`: Opens an input prompt to enter your exact local electric utility rate.
    * `Run on Startup` *(checked if registered in `HKCU\...\Run`)*
    * `Exit Sentinel`
* **🪶 Ultra-Lightweight Footprint**:
  * **Single Standalone Binary**: `taskbar-sentinel.exe` is only **~364 KB**!
  * **Zero CPU Overhead**: Refreshes on a clean 1,000 ms timer with double-buffered GDI rendering for 100% flicker-free draws.

---

## Project Structure

```text
F:\Github\Website\public\Glue\RustStudy\taskbar-sentinel\
├── Cargo.toml               # Release profile optimizations (LTO, opt-level=z, strip=true)
├── taskbar-sentinel.exe     # Standalone release executable (~364 KB)
├── README.md                # Documentation
└── src/
    ├── main.rs              # Windows subsystem entry point (zero console flicker)
    ├── menu.rs              # Native Win32 context menu, rate settings, & registry manager
    ├── power.rs             # NVIDIA NVML live board power sampler & Ryzen dynamic model
    ├── telemetry.rs         # Win32 GetSystemTimes, GlobalMemoryStatusEx, PDH, and cost engine
    └── window.rs            # Topmost rounded pill window & double-buffered GDI renderer
```

---

## Quick Usage

* **To Run Manually:** Double-click `taskbar-sentinel.exe`.
* **To Change Electricity Rate:** Right-click the widget $\rightarrow$ `⚡ Electricity Rate` $\rightarrow$ pick a preset or click `Custom Rate`.
* **To Enable Startup on Boot:** Right-click the widget $\rightarrow$ click `Run on Startup`.
* **To Exit:** Right-click the widget $\rightarrow$ click `Exit Sentinel`.

---

## Building from Source

```powershell
# Navigate to the project directory
cd F:\Github\Website\public\Glue\RustStudy\taskbar-sentinel

# Build optimized release binary
cargo build --release
```
