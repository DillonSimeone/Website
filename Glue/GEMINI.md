# Glue Daemons & Windows Environment Guidelines

These rules apply whenever inspecting, running, modifying, or creating utilities inside the `public/Glue` directory.

## 1. Process Lifecycle & Detached Spawning
- **Never rely on subshell child processes for persistent daemons:** Processes launched via `Start-Process` or direct terminal calls within agent environments are bound to the caller's Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) and will be automatically terminated when the tool step concludes.
- **Detached Launch Standard:** Always spawn background daemons intended to outlive the tool runner using WMI:
  ```powershell
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
      CommandLine = '"C:\Users\DoctorNightmares\AppData\Local\Programs\Python\Python310\pythonw.exe" "F:\Github\Website\public\Glue\DaemonCommandCenter\command_center.py"'
      CurrentDirectory = "F:\Github\Website\public\Glue\DaemonCommandCenter"
  }
  ```
- **Check Single-Instance Mutexes:** Before launching `command_center.py` or any daemon with a named Win32 mutex (e.g. `Global\DaemonCommandCenter_Mutex`), verify no lingering zombie processes are holding the handle.

## 2. Windows Script Host (.vbs) Invariants
- **NEVER use `WScript.Echo` in `.vbs` files intended for `wscript.exe`:**
  - `wscript.exe` renders `WScript.Echo` as a graphical, modal message box (`MsgBox`). In background tasks or Windows Startup, this completely freezes script execution waiting for user interaction.
  - If console output is required for debugging, run explicitly with `cscript.exe //NoLogo` or redirect logs to dedicated text files (`boot.log`, `stderr.log`).

## 3. ADB & USB Tethering Safety Invariants
- **Do NOT reset the USB gadget stack:** Never execute `adb usb`, `adb kill-server`, or adb commands that toggle USB hardware while USB tethering is actively serving as the host PC's primary network connection.
- **Inspect tether status safely:** Query tether state via `adb shell dumpsys tethering` or `adb shell ip -br link` (looking for `ncm0` / `rndis0` state `UP`).
- **Always use `pythonw.exe` for GUI and Tray Daemons:** Prevent terminal flash windows on Windows 11.

## 4. System Tray (Pystray) & Window Invariants
- Pystray on Windows requires the setup callback idiom:
  ```python
  def _on_tray_setup(self, icon):
      icon.visible = True
      self._update_tray()
  ```
- Launch tray message pumps on dedicated daemon threads so Tkinter `root.mainloop()` retains the primary UI thread.
- For borderless HUDs, preserve `overrideredirect(True)` and drag bindings (`<ButtonPress-1>`, `<B1-Motion>`).
