@echo off
setlocal
cd /d "%~dp0"
echo Starting ESP32-C3 Auto-Upload (DeafDoorbell Leader - LEGACY ENV)...

call pio run -e leader-legacy --target upload
if %ERRORLEVEL% neq 0 (
    echo.
    echo ------------------------------------------
    echo UPLOAD FAILED!
    echo ------------------------------------------
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ------------------------------------------
echo SUCCESS! (leader-legacy flashed)
echo ------------------------------------------
echo.
timeout /t 2
call pio device monitor
pause
