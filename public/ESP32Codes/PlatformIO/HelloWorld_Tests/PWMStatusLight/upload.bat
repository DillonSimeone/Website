@echo off
setlocal
echo Starting ESP32-C3 Auto-Upload...

:: Attempt to run PlatformIO
call pio run --target upload
if %ERRORLEVEL% neq 0 (
    echo.
    echo ------------------------------------------
    echo UPLOAD FAILED!
    echo ------------------------------------------
    echo.
    echo Troubleshooting:
    echo 1. Check if the ESP32 is connected.
    echo 2. Ensure PlatformIO is in your PATH.
    echo 3. Try Download Mode: Hold BOOT, press RESET, release BOOT.
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ------------------------------------------
echo SUCCESS!
echo ------------------------------------------
echo.
echo Starting Serial Monitor (Ctrl+C to stop)...
echo.
timeout /t 2
call pio device monitor
pause
