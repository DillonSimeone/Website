import os
import sys
from pathlib import Path

def create_startup_shortcut():
    startup_dir = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    shortcut_path = startup_dir / "LLMTokenTracker.lnk"
    
    exe_path = Path(__file__).parent / "dist" / "LLMTokenTracker" / "LLMTokenTracker.exe"
    working_dir = exe_path.parent
    
    try:
        import win32com.client
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortcut(str(shortcut_path))
        shortcut.TargetPath = str(exe_path)
        shortcut.Arguments = ""
        shortcut.WorkingDirectory = str(working_dir)
        shortcut.IconLocation = f"{exe_path},0"
        shortcut.Save()
        print(f"Startup shortcut created successfully using win32com: {shortcut_path}")
    except ImportError:
        import subprocess
        # Convert path delimiters for powershell strings
        ps_exe = str(exe_path).replace("\\", "\\\\")
        ps_dir = str(working_dir).replace("\\", "\\\\")
        ps_command = (
            f'$WshShell = New-Object -ComObject WScript.Shell; '
            f'$Shortcut = $WshShell.CreateShortcut("{shortcut_path}"); '
            f'$Shortcut.TargetPath = "{ps_exe}"; '
            f'$Shortcut.Arguments = ""; '
            f'$Shortcut.WorkingDirectory = "{ps_dir}"; '
            f'$Shortcut.Save()'
        )
        subprocess.run(["powershell", "-Command", ps_command], check=True)
        print(f"Startup shortcut created successfully using PowerShell: {shortcut_path}")

if __name__ == "__main__":
    create_startup_shortcut()
