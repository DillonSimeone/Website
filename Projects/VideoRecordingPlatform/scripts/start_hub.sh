#!/usr/bin/env bash
# MYT Multi-Device Video Capture Hub - macOS & Linux Starter

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "========================================================"
echo "  MYT Multi-Device Video Capture Hub - Unix Starter     "
echo "========================================================"

echo "Purging any previous processes holding port 3457..."
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:3457 | xargs kill -9 2>/dev/null || true
elif command -v fuser >/dev/null 2>&1; then
  fuser -k 3457/tcp 2>/dev/null || true
fi

echo "Checking environment and prerequisites..."
node check_environment.js

echo ""
echo "Starting MYT Hub Gateway Server..."
node server.js
