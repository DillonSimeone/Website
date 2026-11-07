@echo off
title Grass Study Lab Server
cd /d "%~dp0"
echo ============================================================
echo   🌿 Grass Study Lab Server
echo   Live-syncs to three.js/configure/grass.json
echo ============================================================
echo Opening browser to http://localhost:8099 ...
start "" "http://localhost:8099"
node server.mjs
pause
