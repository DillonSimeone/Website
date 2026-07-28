#!/bin/bash
# SignalForwarder.command — Double-click this file on macOS to launch Signal Forwarder.
# It will automatically set up a Python virtual environment and install dependencies on first run.

cd "$(dirname "$0")"

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "=============================================="
    echo " ERROR: Python 3 is not installed."
    echo " Install it via Homebrew:  brew install python"
    echo " Or download from: https://www.python.org"
    echo "=============================================="
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "First-time setup: Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install --upgrade pip
    pip install -r requirements.txt
    echo ""
    echo "Setup complete!"
    echo ""
else
    source venv/bin/activate
fi

echo "Starting Signal Forwarder..."
python3 app.py
