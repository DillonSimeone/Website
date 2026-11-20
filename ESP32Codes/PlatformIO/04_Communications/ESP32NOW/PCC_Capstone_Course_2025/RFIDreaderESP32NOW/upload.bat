@echo off
setlocal
echo Starting ESP32-C3 Auto-Upload (RFIDreaderESP32NOW)...

call pio run --target upload
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
echo SUCCESS!
echo ------------------------------------------
echo.
timeout /t 2
call pio device monitor
pause
