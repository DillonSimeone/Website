#!/bin/bash
# run_gui.sh — Run SignalForwarder on macOS/Linux
# Double-click this file or run: bash run_gui.sh

cd "$(dirname "$0")"

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

echo "Starting SignalForwarder..."
python app.py
