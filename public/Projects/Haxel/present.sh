#!/usr/bin/env bash
# Haxel Workshop Presentation Launcher
# Before show: join laptop WiFi to leader Haxel SoftAP (192.168.4.1)

cd "$(dirname "$0")"
export PORT=8765
export HAXEL_HUB=192.168.4.1

echo ""
echo " Haxel Teardown Workshop Presentation"
echo " ====================================="
echo " 1. Join WiFi to leader Haxel SoftAP"
echo " 2. Server: http://localhost:${PORT}/presentation.html"
echo " 3. Fleet proxy -> http://${HAXEL_HUB}/json/fleet"
echo ""

if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:${PORT}/presentation.html?slide=1" &
elif command -v open &>/dev/null; then
  open "http://localhost:${PORT}/presentation.html?slide=1" &
fi

node presentation-server.js
