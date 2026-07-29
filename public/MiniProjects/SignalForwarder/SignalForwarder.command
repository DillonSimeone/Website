#!/bin/bash
# ═══════════════════════════════════════════════════
#  Signal Forwarder — macOS One-Click Launcher
#  Double-click this file to download, install, & run.
# ═══════════════════════════════════════════════════

APPNAME="SignalForwarder"
ZIP_URL="https://dillonsimeone.com/MiniProjects/SignalForwarder/release/SignalForwarder-macOS.zip"
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

# 2. Ensure Xcode Command Line Tools are installed
if ! xcode-select -p > /dev/null 2>&1; then
    echo ""
    echo "  Xcode Command Line Tools are required."
    echo "  Installing now (this may take a few minutes)..."
    xcode-select --install
    echo ""
    echo "  ✖  Please re-run this launcher after the installation finishes."
    read -p "Press Enter to close..."
    exit 1
fi

# 3. Download & extract if the app folder doesn't exist yet
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
        read -p "Press Enter to close..."
        exit 1
    fi

    # Verify download succeeded
    if [ $? -ne 0 ]; then
        echo "  ✖  Download failed. Check your internet connection."
        rm -f "/tmp/$APPNAME.zip"
        read -p "Press Enter to close..."
        exit 1
    fi

    # Extract
    if [ -f "/tmp/$APPNAME.zip" ]; then
        echo "  Extracting to $INSTALL_DIR ..."
        unzip -o "/tmp/$APPNAME.zip" -d "$INSTALL_DIR"
        rm -f "/tmp/$APPNAME.zip"

        # Fix nested directory: if zip contained an enclosing folder, flatten it
        if [ ! -f "$INSTALL_DIR/app.py" ]; then
            NESTED=$(find "$INSTALL_DIR" -maxdepth 2 -name "app.py" -print -quit)
            if [ -n "$NESTED" ]; then
                NESTED_DIR=$(dirname "$NESTED")
                echo "  Flattening nested directory..."
                mv "$NESTED_DIR"/* "$INSTALL_DIR/" 2>/dev/null
                mv "$NESTED_DIR"/.* "$INSTALL_DIR/" 2>/dev/null
                rmdir "$NESTED_DIR" 2>/dev/null
            fi
        fi

        if [ ! -f "$INSTALL_DIR/app.py" ]; then
            echo "  ✖  Extraction failed — app.py not found."
            read -p "Press Enter to close..."
            exit 1
        fi

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

# 4. Create venv & install dependencies if needed
if [ ! -d "venv" ]; then
    echo ""
    echo "  Setting up Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "  Installing dependencies (this may take a minute)..."
    pip install --upgrade pip > /dev/null 2>&1
    if ! pip install -r requirements.txt; then
        echo ""
        echo "  ✖  Dependency installation failed."
        echo "  Check your internet connection and try again."
        read -p "Press Enter to close..."
        exit 1
    fi
    echo "  ✔  Dependencies installed."
else
    source venv/bin/activate
fi

# 5. Launch
echo ""
echo "═══════════════════════════════════════════════"
echo "  Launching Signal Forwarder..."
echo "═══════════════════════════════════════════════"
echo ""
python3 app.py
