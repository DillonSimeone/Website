# Rust Study & Native Windows Workspace Guidelines for AI Agents ðŸ¦€ðŸ›¡EE
This document is the **single source of truth and architectural authority** for any AI agent creating, modifying, building, or debugging native Rust utilities within `F:\Github\Website\public\Glue\RUST\`.

---

## 1. Toolchain & Compilation Invariants

### Configured Environment
* **Installed Host & Default Target:** `x86_64-pc-windows-gnu` (via `rustup`).
* **Why GNU/MinGW?** The host machine uses MinGW/GNU import libraries bundled with rustup to avoid requiring a 2+ GB Visual Studio C++ Build Tools install (`link.exe` / MSVC SDK).
* **Cargo Invocation Rule:** Always ensure Cargo is discovered by extending PATH if executing from a fresh subshell:
  ```powershell
  $env:PATH += ";$env:USERPROFILE\.cargo\bin"
  cargo check
  cargo build --release
  ```

### Release Profile Standards (`Cargo.toml`)
Always configure size and performance optimization flags to keep binaries sub-500 KB:
```toml
[profile.release]
opt-level = "z"       # Optimize for binary size
lto = true            # Link-Time Optimization across crates
codegen-units = 1     # Maximize LTO optimization scope
panic = "abort"       # Strip stack unwinding tables
strip = true          # Strip all debug symbols
```

---

## 2. Windows GUI & Subsystem Rules

### Zero Console Window Flicker
* Desktop overlays, system tray utilities, and HUDs MUST declare:
  ```rust
  #![windows_subsystem = "windows"]
  ```
  at the top of `src/main.rs`. Never rely on launching console `.exe` binaries through hidden PowerShell or `.vbs` wrappers when writing Rustâ€”use the compiler subsystem directive.

### Win32 GDI & Double-Buffering Invariants
1. **Always use `BeginPaint` & `EndPaint` in `WM_PAINT`:**
   * Calling raw `GetDC(hwnd)` during `WM_PAINT` without validating the update region causes Windows to send infinite paint messages, pinning CPU at 100%.
   * Correct pattern:
     ```rust
     WM_PAINT => {
         let mut ps: PAINTSTRUCT = zeroed();
         let hdc = BeginPaint(hwnd, &mut ps);
         render_window(hwnd, hdc);
         EndPaint(hwnd, &ps);
         0
     }
     ```
2. **Double-Buffering Memory DC:**
   * Allocate memory DC (`CreateCompatibleDC`), bitmap (`CreateCompatibleBitmap`), draw to buffer, and `BitBlt` in a single pass.
   * Always select old stock objects back before calling `DeleteDC` and `DeleteObject` to prevent GDI resource leaks.
3. **Layered vs Rounded Popup Windows:**
   * Do NOT combine `WS_EX_LAYERED` with `SetWindowRgn` unless strictly necessary. On Windows 11 DWM, combining both can cause region clipping glitches.
   * For solid rounded taskbar pills, standard `WS_POPUP` with `CreateRoundRectRgn` and `SetWindowRgn(hwnd, rgn, 1)` provides 100% reliable hardware composition.

---

## 3. High-Performance Telemetry Standards

### Direct Win32 APIs Over Subprocesses
Never spawn `powershell -c Get-Counter` or `wmic` from Rust. Use direct Win32 zero-allocation calls:
* **RAM Load:** `GlobalMemoryStatusEx(&mut mem)` ($\sim 1 \mu\text{s}$, zero heap allocation).
* **CPU Load:** `GetSystemTimes(&mut idle, &mut kernel, &mut user)` calculating deltas between ticks ($\sim 0.00\%$ CPU).
* **Disk Throughput (MB/s):** Initialize Windows PDH (`PdhOpenQueryW` + `PdhAddCounterW(..., "\\PhysicalDisk(_Total)\\Disk Bytes/sec")`).
  * Sample on a 1,000 ms timer with `PdhCollectQueryData`.
  * Always close PDH queries in `Drop` (`PdhCloseQuery`).

---

## 4. Process Spawning & Job Object Isolation

* **Detached Execution (Outliving Agent Tool Steps):**
  When launching persistent daemons from agent sessions that must survive after the conversation step terminates, use WMI process creation to escape the caller's Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`):
  ```powershell
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
      CommandLine = '"F:\Github\Website\public\Glue\RUST\taskbar-sentinel\taskbar-sentinel.exe"'
      CurrentDirectory = "F:\Github\Website\public\Glue\RUST\taskbar-sentinel"
  }
  ```

---

## 5. Crate Selection Guidelines for Native Rust

| Capability | Recommended Crate | Notes |
| :--- | :--- | :--- |
| **Win32 Bindings** | `windows-sys = "0.59"` | Ultra-fast compile time, zero metadata bloat. |
| **High-Level Windows** | `windows = "0.58"` | Use only when COM objects or WinRT APIs are strictly required. |
| **System Telemetry** | Native Win32 / `sysinfo` | Use native APIs for sub-5MB RAM; `sysinfo` if cross-platform. |
| **Auto-Startup Registry** | `windows-sys` (`Win32_System_Registry`) | Standard `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. |
| **System Tray Icons** | `tray-icon` or Win32 `Shell_NotifyIconW` | Native Win32 message loop integration. |
