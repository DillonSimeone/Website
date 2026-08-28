#!/bin/bash
# build_mac.sh — Build SignalForwarder.app for macOS
# Run this on a Mac with Python 3.10+ installed.

cd "$(dirname "$0")"

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt
pip install pyinstaller

echo "Building macOS .app bundle..."
pyinstaller --noconsole --onefile \
    --add-data "web:web" \
    --hidden-import=webview.platforms.cocoa \
    --hidden-import=bleak \
    --hidden-import=mido \
    --hidden-import=rtmidi \
    --hidden-import=sounddevice \
    --hidden-import=numpy \
    --hidden-import=serial \
    --name "SignalForwarder" \
    app.py

echo ""
echo "========================================"
echo " Build Complete!"
echo " Your .app is in the 'dist' folder."
echo "========================================"
