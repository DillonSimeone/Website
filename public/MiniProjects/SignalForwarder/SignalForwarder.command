#!/bin/bash
# ═══════════════════════════════════════════════════
#  Signal Forwarder — macOS One-Click Launcher
#  Double-click this file to download, install, & run.
# ═══════════════════════════════════════════════════

APPNAME="SignalForwarder"
ZIP_URL="https://dillonsimeone.com/MiniProjects/SignalForwarder/dist/SignalForwarder-macOS.zip"
INSTALL_DIR="$HOME/SignalForwarder"

clear
echo "═══════════════════════════════════════════════"
echo "  Signal Forwarder — macOS Launcher"
echo "═══════════════════════════════════════════════"
echo ""

# 1. Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "  ✖  Python 3 is not installed."
    echo ""
    echo "  Install it with Homebrew:"
    echo "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo "    brew install python"
    echo ""
    echo "  Or download from: https://www.python.org/downloads/"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

PYVER=$(python3 --version 2>&1)
echo "  ✔  Found $PYVER"

# 2. Download & extract if the app folder doesn't exist yet
if [ ! -f "$INSTALL_DIR/app.py" ]; then
    echo ""
    echo "  First-time setup: Downloading Signal Forwarder..."
    echo "  Source: $ZIP_URL"
    echo ""

    mkdir -p "$INSTALL_DIR"

    # Download zip
    if command -v curl &> /dev/null; then
        curl -L -o "/tmp/$APPNAME.zip" "$ZIP_URL"
    elif command -v wget &> /dev/null; then
        wget -O "/tmp/$APPNAME.zip" "$ZIP_URL"
    else
        echo "  ✖  Neither curl nor wget found. Cannot download."
        read -p "Press Enter to close..."
        exit 1
    fi

    # Extract
    if [ -f "/tmp/$APPNAME.zip" ]; then
        echo "  Extracting to $INSTALL_DIR ..."
        unzip -o "/tmp/$APPNAME.zip" -d "$INSTALL_DIR"
        rm -f "/tmp/$APPNAME.zip"
        echo "  ✔  Download complete."
    else
        echo "  ✖  Download failed."
        read -p "Press Enter to close..."
        exit 1
    fi
else
    echo "  ✔  App folder found at $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Create venv & install dependencies if needed
if [ ! -d "venv" ]; then
    echo ""
    echo "  Setting up Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "  Installing dependencies (this may take a minute)..."
    pip install --upgrade pip > /dev/null 2>&1
    pip install -r requirements.txt
    echo "  ✔  Dependencies installed."
else
    source venv/bin/activate
fi

# 4. Launch
echo ""
echo "═══════════════════════════════════════════════"
echo "  Launching Signal Forwarder..."
echo "═══════════════════════════════════════════════"
echo ""
python3 app.py
