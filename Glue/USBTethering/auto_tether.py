#!/usr/bin/env python3
"""
Auto USB Tethering Daemon for Google Pixel 6a (and other Android devices).

Runs continuously in the background on Windows:
1. Ensures ADB is available (auto-downloads Google platform-tools if missing).
2. Monitors for phone connection via ADB with zero idle CPU overhead.
3. Automatically triggers USB tethering via multi-tier activation:
   - Gadget function switch (NCM/RNDIS)
   - Settings UI automation (uiautomator switch detection & toggle)
   - Connectivity service command
4. Seamlessly detects disconnect and waits for next plug-in event.
"""

import os
import sys
import time
import shutil
import urllib.request
import zipfile
import subprocess
import re
import xml.etree.ElementTree as ET
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "tethering.log")
PLATFORM_TOOLS_DIR = os.path.join(SCRIPT_DIR, "platform-tools")
PLATFORM_TOOLS_URL = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"


def log(message: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {message}"
    print(formatted, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass


def get_adb_path() -> str:
    """Finds adb executable or downloads platform-tools from Google if missing."""
    # 1. Check system PATH
    system_adb = shutil.which("adb")
    if system_adb:
        return system_adb

    # 2. Check local platform-tools directory
    local_adb = os.path.join(PLATFORM_TOOLS_DIR, "adb.exe")
    if os.path.exists(local_adb):
        return local_adb

    # 3. Check common Android SDK directories
    user_profile = os.environ.get("USERPROFILE", "")
    candidate_paths = [
        os.path.join(user_profile, "AppData", "Local", "Android", "Sdk", "platform-tools", "adb.exe"),
        r"C:\platform-tools\adb.exe",
    ]
    for candidate in candidate_paths:
        if os.path.exists(candidate):
            return candidate

    # 4. Bootstrap ADB from official Google repository
    log("ADB not detected. Downloading Google Android SDK Platform-Tools...")
    zip_dest = os.path.join(SCRIPT_DIR, "platform-tools.zip")
    try:
        urllib.request.urlretrieve(PLATFORM_TOOLS_URL, zip_dest)
        log("Extracting platform-tools...")
        with zipfile.ZipFile(zip_dest, "r") as zip_ref:
            zip_ref.extractall(SCRIPT_DIR)
        if os.path.exists(zip_dest):
            os.remove(zip_dest)
        if os.path.exists(local_adb):
            log(f"ADB successfully installed to: {local_adb}")
            return local_adb
    except Exception as e:
        log(f"Failed to auto-download platform-tools: {e}")

    raise RuntimeError("ADB could not be located or downloaded.")


def run_adb(adb_cmd: list, timeout: int = 20) -> tuple[int, str]:
    """Runs an ADB command and returns (returncode, stdout + stderr)."""
    try:
        proc = subprocess.run(
            adb_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return proc.returncode, proc.stdout.strip()
    except subprocess.TimeoutExpired:
        return -1, "Command timed out"
    except Exception as exc:
        return -1, str(exc)


def is_usb_tethering_active(adb: str) -> bool:
    """Checks whether USB tethering is currently active on the device."""
    code, out = run_adb([adb, "shell", "dumpsys", "tethering"], timeout=10)
    if code != 0:
        return False

    out_lower = out.lower()
    # Check for active tethered interfaces (rndis0, ncm0, usb0) in the dumpsys output
    tethered_match = re.search(r"tethered:\s*\[([^\]]*)\]", out_lower)
    if tethered_match:
        interfaces = tethered_match.group(1)
        if any(iface in interfaces for iface in ["rndis", "ncm", "usb"]):
            return True

    # Also check if tethered interface exists in ip link
    code_ip, out_ip = run_adb([adb, "shell", "ip", "link"], timeout=6)
    if code_ip == 0:
        for line in out_ip.splitlines():
            line_l = line.lower()
            if any(k in line_l for k in ["rndis0", "ncm0", "usb0"]):
                if "state up" in line_l or "state unknown" in line_l:
                    return True

    return False


def toggle_tethering_via_gadget(adb: str) -> bool:
    """Attempts to enable USB tethering using kernel gadget functions (ncm,adb or rndis,adb)."""
    log("Attempting kernel gadget function switch (NCM/RNDIS)...")
    # Pixel 6a (Tensor G1) uses NCM on modern Android, older kernels use RNDIS
    for mode in ["ncm,adb", "rndis,adb", "ncm", "rndis"]:
        code, out = run_adb([adb, "shell", "svc", "usb", "setFunctions", mode], timeout=8)
        time.sleep(1.5)
        if is_usb_tethering_active(adb):
            log(f"USB tethering enabled via gadget mode: {mode}")
            return True

    return False


def toggle_tethering_via_ui(adb: str) -> bool:
    """Automates enabling the USB tethering toggle switch via TetherSettings UI."""
    log("Attempting TetherSettings UI automation...")
    try:
        # Wake screen and unlock if keyguard is on
        run_adb([adb, "shell", "input", "keyevent", "224"], timeout=5)  # KEYCODE_WAKEUP
        run_adb([adb, "shell", "input", "keyevent", "82"], timeout=5)   # KEYCODE_MENU / Unlock

        # Launch Hotspot & tethering settings page
        run_adb([adb, "shell", "am", "start", "-n", "com.android.settings/.TetherSettings"], timeout=8)
        time.sleep(1.2)

        # Dump UI hierarchy to find the USB tethering switch
        run_adb([adb, "shell", "uiautomator", "dump", "/data/local/tmp/uidump.xml"], timeout=10)
        code, xml_data = run_adb([adb, "shell", "cat", "/data/local/tmp/uidump.xml"], timeout=10)
        run_adb([adb, "shell", "rm", "-f", "/data/local/tmp/uidump.xml"], timeout=5)

        if code != 0 or not xml_data.startswith("<?xml") and "<hierarchy" not in xml_data:
            log("Could not dump UI hierarchy.")
            return False

        root = ET.fromstring(xml_data)
        
        # Look for USB tethering switch
        target_bounds = None
        for node in root.iter("node"):
            text = (node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")).lower()
            if "usb tethering" in text or "usb-tethering" in text:
                # Check if this node or a sibling switch is checked
                checked = node.attrib.get("checked", "false") == "true"
                if checked:
                    log("USB tethering toggle is already ON in UI.")
                    # Return to home screen
                    run_adb([adb, "shell", "input", "keyevent", "3"], timeout=5)
                    return True
                
                bounds_str = node.attrib.get("bounds", "")
                if bounds_str:
                    target_bounds = bounds_str
                break

        # If not found directly on text node, look for switch widgets near it
        if not target_bounds:
            for node in root.iter("node"):
                cls = node.attrib.get("class", "")
                if "Switch" in cls or "CompoundButton" in cls:
                    checked = node.attrib.get("checked", "false") == "true"
                    if not checked:
                        target_bounds = node.attrib.get("bounds", "")
                        break

        if target_bounds:
            # Parse bounds: [x1,y1][x2,y2]
            match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", target_bounds)
            if match:
                x1, y1, x2, y2 = map(int, match.groups())
                # Tap center or switch on the right side of the row
                tap_x = (x1 + x2) // 2
                tap_y = (y1 + y2) // 2
                log(f"Tapping USB tethering toggle switch at ({tap_x}, {tap_y})...")
                run_adb([adb, "shell", "input", "tap", str(tap_x), str(tap_y)], timeout=5)
                time.sleep(1.0)
                
                # Press HOME key to return to home screen
                run_adb([adb, "shell", "input", "keyevent", "3"], timeout=5)
                
                if is_usb_tethering_active(adb):
                    log("USB tethering enabled successfully via UI toggle.")
                    return True
    except Exception as e:
        log(f"UI automation error: {e}")

    # Ensure phone returns home
    run_adb([adb, "shell", "input", "keyevent", "3"], timeout=5)
    return False


def toggle_tethering_via_cmd(adb: str) -> bool:
    """Attempts direct connectivity/tethering service command (Android 11+)."""
    log("Attempting cmd connectivity/tethering start-tethering...")
    run_adb([adb, "shell", "cmd", "connectivity", "start-tethering", "1"], timeout=6)
    time.sleep(1.0)
    if is_usb_tethering_active(adb):
        log("USB tethering enabled via cmd connectivity.")
        return True

    run_adb([adb, "shell", "cmd", "tethering", "start-tethering", "1"], timeout=6)
    time.sleep(1.0)
    if is_usb_tethering_active(adb):
        log("USB tethering enabled via cmd tethering.")
        return True

    return False


def activate_usb_tethering(adb: str):
    """Executes the best strategy to toggle USB tethering."""
    if is_usb_tethering_active(adb):
        log("USB tethering is already active.")
        return True

    log("Activating USB tethering on connected device...")
    # Tier 1: Gadget function switch
    if toggle_tethering_via_gadget(adb):
        return True

    # Tier 2: UI automation
    if toggle_tethering_via_ui(adb):
        return True

    # Tier 3: Connectivity service command
    if toggle_tethering_via_cmd(adb):
        return True

    # Check one last time
    if is_usb_tethering_active(adb):
        log("USB tethering verified active.")
        return True

    log("Notice: USB tethering could not be toggled automatically.")
    log("Tip: On your phone, go to Developer Options -> 'Default USB configuration' -> select 'USB tethering'.")
    return False


def wait_for_disconnect(adb: str):
    """Monitors the connection and returns once the device is disconnected."""
    log("Device is connected and active. Monitoring for disconnect...")
    while True:
        time.sleep(3)
        code, out = run_adb([adb, "get-state"], timeout=5)
        if code != 0 or "device" not in out:
            log("Device disconnected.")
            break


def daemon_loop():
    """Main continuous background service loop."""
    log("=" * 60)
    log("Pixel USB Tethering Daemon starting...")
    log("=" * 60)

    try:
        adb = get_adb_path()
        log(f"Using ADB binary: {adb}")
    except Exception as err:
        log(f"Fatal error initializing ADB: {err}")
        return

    # Start adb server
    run_adb([adb, "start-server"], timeout=15)

    while True:
        try:
            log("Listening for phone connection (waiting for USB plug-in)...")
            # adb wait-for-device blocks with zero CPU overhead until a device connects
            run_adb([adb, "wait-for-device"], timeout=3600)

            # Retrieve connected device details
            _, model = run_adb([adb, "shell", "getprop", "ro.product.model"], timeout=6)
            _, device_name = run_adb([adb, "shell", "getprop", "ro.product.device"], timeout=6)
            _, serial = run_adb([adb, "get-serialno"], timeout=6)

            phone_info = f"{model} ({device_name}) [Serial: {serial}]"
            log(f"Phone detected: {phone_info}")

            # Check if device is authorized
            _, state = run_adb([adb, "get-state"], timeout=6)
            if "unauthorized" in state:
                log("Warning: Phone is unauthorized. Please unlock your phone and tap 'Allow USB Debugging'.")
                time.sleep(5)
                continue

            # Small delay to let USB subsystem stabilize
            time.sleep(2)

            # Trigger USB tethering
            activate_usb_tethering(adb)

            # Wait until phone is disconnected before looping
            wait_for_disconnect(adb)

        except KeyboardInterrupt:
            log("Daemon interrupted by user. Exiting.")
            break
        except Exception as ex:
            log(f"Unexpected error in daemon loop: {ex}")
            time.sleep(5)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test-setup":
        adb = get_adb_path()
        log(f"Test setup successful. ADB resolved at: {adb}")
        code, out = run_adb([adb, "version"])
        log(f"ADB Version:\n{out}")
        sys.exit(0)

    daemon_loop()
