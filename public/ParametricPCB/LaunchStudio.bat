@echo off
title Parametric PCB ^& Silkscreen Studio (localhost:3457)
cd /d "%~dp0"
echo Starting Parametric PCB ^& Silkscreen Studio on http://localhost:3457 ...
start "" "http://localhost:3457/editor.html?project=03"
node shared/studio-server.mjs --port=3457
pause
