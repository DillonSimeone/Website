@echo off
title Batch Build All ESP32 / PlatformIO Firmwares
cd /d "%~dp0"

echo ========================================================
echo   Compiling All PlatformIO Firmware Projects Locally
echo ========================================================
echo.

node tools\batch-compile-all.js

echo.
echo ========================================================
echo   Updating Static Firmware Manifest and Uploader Sync
echo ========================================================
echo.

node public\ESP32Codes\_tooling\update-static-uploader.js

echo.
echo [DONE] Batch compilation and manifest update complete!
pause
