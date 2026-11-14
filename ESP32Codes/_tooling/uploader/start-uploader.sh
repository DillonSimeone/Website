#!/bin/bash

# Determine directory script lives in
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "        PlatformIO Web Uploader Startup"
echo "=================================================="
echo ""

# Check for node_modules
if [ ! -d "node_modules" ]; then
    echo "[i] Installing node dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to run npm install. Make sure Node.js is installed."
        exit 1
    fi
fi

echo "[i] Starting server..."
node start-wrapper.js
