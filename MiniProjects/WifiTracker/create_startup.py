"""
Helper script to create a Windows Startup shortcut for WifiTracker.
"""

import os
import sys
import subprocess
from pathlib import Path


def create_startup_shortcut():
    startup_dir = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    shortcut_path = startup_dir / "WifiTracker.lnk"

    python_dir = Path(sys.executable).parent
    pythonw_exe = python_dir / "pythonw.exe"
    if not pythonw_exe.exists():
        pythonw_exe = Path(sys.executable)

    main_script = Path(__file__).parent / "main.py"
    working_dir = Path(__file__).parent

    ps_shortcut = str(shortcut_path).replace("\\", "\\\\")
    ps_target = str(pythonw_exe).replace("\\", "\\\\")
    ps_args = f'"{str(main_script)}"'
    ps_dir = str(working_dir).replace("\\", "\\\\")

    ps_command = (
        f'$WshShell = New-Object -ComObject WScript.Shell; '
        f'$Shortcut = $WshShell.CreateShortcut("{ps_shortcut}"); '
        f'$Shortcut.TargetPath = "{ps_target}"; '
        f'$Shortcut.Arguments = "{ps_args}"; '
        f'$Shortcut.WorkingDirectory = "{ps_dir}"; '
        f'$Shortcut.Save()'
    )

    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_command], check=True)
        print(f"? Startup shortcut created successfully: {shortcut_path}")
    except Exception as e:
        print(f"? Failed to create shortcut: {e}")


if __name__ == "__main__":
    create_startup_shortcut()
