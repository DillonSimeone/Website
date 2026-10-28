@echo off
title Update ESP32 Web Uploader Firmware Manifest
cd /d "%~dp0"

echo ========================================================
echo   Updating ESP32 Static Web Uploader Firmware Manifest  
echo ========================================================
echo.

node public\ESP32Codes\_tooling\update-static-uploader.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to catalog firmwares!
    pause
    exit /b %ERRORLEVEL%
)

echo [SUCCESS] Firmware manifest updated for browser-direct Web Serial flashing!
echo.
pause
