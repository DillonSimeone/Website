#!/usr/bin/env bash
# Haxel Workshop Presentation Launcher

cd "$(dirname "$0")"
export PORT=8765

echo ""
echo " Haxel Teardown Workshop Presentation"
echo " ====================================="
echo " Server: http://localhost:${PORT}/presentation.html"
echo ""

if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:${PORT}/presentation.html?slide=1" &
elif command -v open &>/dev/null; then
  open "http://localhost:${PORT}/presentation.html?slide=1" &
fi

node presentation-server.js
