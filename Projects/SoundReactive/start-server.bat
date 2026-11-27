@echo off
title Sound-Reactive Arts Local Server
cd /d "%~dp0"

echo =============================================================
echo   SOUND-REACTIVE ARTS // LAUNCHING LOCAL SERVER
echo =============================================================

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Detected Node.js runtime. Starting server.js...
    node server.js
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Node.js not found. Starting Python HTTP server on port 8080...
    start "" http://localhost:8080/index.html
    python -m http.server 8080
    goto end
)

echo ERROR: Neither Node.js nor Python was found on this system PATH.
echo Please install Node.js (https://nodejs.org) or Python to run locally.
pause

:end
