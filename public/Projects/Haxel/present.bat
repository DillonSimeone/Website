@echo off
REM Haxel Workshop Presentation Launcher
REM 1. Starts local static server with fleet API proxy
REM 2. Opens presentation in Chrome
REM Before show: join laptop WiFi to leader Haxel SoftAP (192.168.4.1)

set PORT=8765
set HAXEL_HUB=192.168.4.1
cd /d "%~dp0"

echo.
echo  Haxel Teardown Workshop Presentation
echo  =====================================
echo  1. Join WiFi to leader Haxel SoftAP
echo  2. Server: http://localhost:%PORT%/presentation.html
echo  3. Fleet proxy -^> http://%HAXEL_HUB%/json/fleet
echo.

start "" "http://localhost:%PORT%/presentation.html?slide=1"

set HAXEL_HUB=%HAXEL_HUB%
set PORT=%PORT%
node presentation-server.js
