@echo off
setlocal
echo ========================================================
echo HAXEL — Flashing ESP32-C6 (Set Mesh Role = Master in UI)
echo ========================================================
echo Environment: c6WIFI
echo.
cd /d "%~dp0firmware"
call pio run -e c6WIFI -t upload
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Firmware upload failed!
    pause
    exit /b %ERRORLEVEL%
)
call pio run -e c6WIFI -t uploadfs
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] LittleFS portal upload failed!
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ========================================================
echo [SUCCESS] ESP32-C6 Mesh Master successfully flashed!
echo Starting Serial Monitor (Ctrl+C to exit)...
echo ========================================================
timeout /t 2 /nobreak >nul
call pio device monitor
pause
