@echo off
setlocal
echo ========================================================
echo HAXEL — Flashing ESP32-C6 MESH FOLLOWER
echo ========================================================
echo Environment: c6WIFILED_FOLLOWER
echo.
cd /d "%~dp0"
call pio run -e c6WIFILED_FOLLOWER -t upload
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Firmware upload failed!
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ========================================================
echo [SUCCESS] ESP32-C6 Mesh Follower successfully flashed!
echo Starting Serial Monitor (Ctrl+C to exit)...
echo ========================================================
timeout /t 2 /nobreak >nul
call pio device monitor
pause
