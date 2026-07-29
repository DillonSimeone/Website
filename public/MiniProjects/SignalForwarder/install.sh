#!/bin/bash
# ═══════════════════════════════════════════════════
#  Signal Forwarder — macOS Remote Installer
#  Usage:  curl -fsSL https://dillonsimeone.com/MiniProjects/SignalForwarder/install.sh | bash
# ═══════════════════════════════════════════════════

APPNAME="SignalForwarder"
ZIP_URL="https://dillonsimeone.com/MiniProjects/SignalForwarder/release/SignalForwarder-macOS.zip"
INSTALL_DIR="$HOME/SignalForwarder"

clear
echo "═══════════════════════════════════════════════"
echo "  Signal Forwarder — macOS Installer"
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
        curl -fL -o "/tmp/$APPNAME.zip" "$ZIP_URL"
    elif command -v wget &> /dev/null; then
        wget -O "/tmp/$APPNAME.zip" "$ZIP_URL"
    else
        echo "  ✖  Neither curl nor wget found. Cannot download."
        exit 1
    fi

    # Verify download succeeded
    if [ $? -ne 0 ]; then
        echo "  ✖  Download failed. Check your internet connection."
        rm -f "/tmp/$APPNAME.zip"
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

# 4. Create a double-clickable launcher for future runs
LAUNCHER="$INSTALL_DIR/SignalForwarder.command"
if [ ! -f "$LAUNCHER" ]; then
    cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python3 app.py
LAUNCHER_EOF
    chmod +x "$LAUNCHER"
    echo "  ✔  Created launcher: ~/SignalForwarder/SignalForwarder.command"
fi

# 5. Launch
echo ""
echo "═══════════════════════════════════════════════"
echo "  Launching Signal Forwarder..."
echo "═══════════════════════════════════════════════"
echo ""
python3 app.py

# 6. Post-close: show re-launch instructions
echo ""
echo "═══════════════════════════════════════════════"
echo "  Signal Forwarder closed."
echo ""
echo "  To run again, either:"
echo "    • Double-click:  ~/SignalForwarder/SignalForwarder.command"
echo "    • Terminal:       cd ~/SignalForwarder && source venv/bin/activate && python3 app.py"
echo "═══════════════════════════════════════════════"
