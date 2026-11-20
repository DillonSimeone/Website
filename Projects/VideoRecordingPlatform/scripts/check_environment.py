#!/usr/bin/env python3
"""
MYT Capture Hub: Python Environment & Prerequisite Safety Checker
Ensures Python 3, FFmpeg, and required packages are present.
Attempts automatic pip installation of missing dependencies and warns user.
"""

import sys
import os
import subprocess
import shutil
import platform

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PACKAGE_TO_MODULE = {
    "google-api-python-client": "googleapiclient",
    "google-auth-oauthlib": "google_auth_oauthlib",
    "google-auth-httplib2": "google_auth_httplib2",
}

def check_ffmpeg():
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        try:
            res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            first_line = res.stdout.splitlines()[0] if res.stdout else "FFmpeg installed"
            return True, first_line
        except Exception:
            return True, f"Found at {ffmpeg_path}"
    return False, None

def check_and_install_packages():
    missing = []
    for pkg, mod_name in PACKAGE_TO_MODULE.items():
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"\n[SAFETY WARNING] Missing Python packages: {', '.join(missing)}")
        print("Attempting automatic installation via pip...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            print("[OK] Successfully installed missing packages.")
            return True
        except Exception as e:
            print(f"[X] Automatic pip install failed: {e}")
            print(f"  Please run manually: {sys.executable} -m pip install {' '.join(missing)}")
            return False
    else:
        for pkg in PACKAGE_TO_MODULE:
            print(f"  [OK] {pkg}: Installed")
    return True

def run_diagnostics():
    print("====================================================")
    print(" MYT Hub: Python & Media Pipeline Safety Checker    ")
    print("====================================================")
    print(f"Platform       : {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"Python Runtime : {sys.version.split()[0]} ({sys.executable})")

    # FFmpeg check
    has_ffmpeg, ffmpeg_info = check_ffmpeg()
    if has_ffmpeg:
        print(f"FFmpeg         : {ffmpeg_info} (OK)")
    else:
        print("[WARNING] FFmpeg binary not found in PATH!")
        if platform.system() == "Windows":
            print("   Windows install: winget install Gyan.FFmpeg   OR   choco install ffmpeg")
        elif platform.system() == "Darwin":
            print("   macOS install: brew install ffmpeg")
        else:
            print("   Linux install: sudo apt update && sudo apt install -y ffmpeg")

    # Package check
    print("\nChecking Python Packages:")
    pkg_status = check_and_install_packages()
    print("====================================================")
    if has_ffmpeg and pkg_status:
        print("All Python & FFmpeg requirements are satisfied!")
    print("====================================================")
    return has_ffmpeg and pkg_status

if __name__ == "__main__":
    success = run_diagnostics()
    sys.exit(0 if success else 1)
