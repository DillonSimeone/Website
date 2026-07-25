@echo off
REM Haxel Workshop Presentation Launcher
REM 1. Starts local static server
REM 2. Opens presentation in Chrome

set PORT=8765
cd /d "%~dp0"

echo.
echo  Haxel Teardown Workshop Presentation
echo  =====================================
echo  Server: http://localhost:%PORT%/presentation.html
echo.

start "" "http://localhost:%PORT%/presentation.html?slide=1"

set PORT=%PORT%
node presentation-server.js
