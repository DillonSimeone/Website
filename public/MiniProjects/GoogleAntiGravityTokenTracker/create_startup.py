import os
import sys
from pathlib import Path

def create_startup_shortcut():
    startup_dir = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    shortcut_path = startup_dir / "LLMTokenTracker.lnk"
    
    script_path = Path(__file__).parent / "main.py"
    working_dir = Path(__file__).parent
    
    # We can use Windows Script Host via python's win32com if available, 
    # or fallback to generating a temporary powershell script.
    try:
        import win32com.client
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortcut(str(shortcut_path))
        shortcut.TargetPath = "pythonw.exe"
        shortcut.Arguments = f'"{script_path}"'
        shortcut.WorkingDirectory = str(working_dir)
        shortcut.IconLocation = "pythonw.exe,0"
        shortcut.Save()
        print(f"Startup shortcut created successfully using win32com: {shortcut_path}")
    except ImportError:
        # Fallback: Create using PowerShell
        import subprocess
        ps_command = (
            f'$WshShell = New-Object -ComObject WScript.Shell; '
            f'$Shortcut = $WshShell.CreateShortcut("{shortcut_path}"); '
            f'$Shortcut.TargetPath = "pythonw.exe"; '
            f'$Shortcut.Arguments = \'"{script_path}"\'; '
            f'$Shortcut.WorkingDirectory = "{working_dir}"; '
            f'$Shortcut.Save()'
        )
        subprocess.run(["powershell", "-Command", ps_command], check=True)
        print(f"Startup shortcut created successfully using PowerShell: {shortcut_path}")

if __name__ == "__main__":
    create_startup_shortcut()
