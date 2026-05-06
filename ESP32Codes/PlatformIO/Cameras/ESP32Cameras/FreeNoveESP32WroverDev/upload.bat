@echo off
echo Building and Uploading ESP32 Camera project...
pio run --target upload
if %ERRORLEVEL% EQU 0 (
    echo Upload Successful!
    echo Connection: http://esp32cam.local
    pio device monitor
) else (
    echo Upload Failed.
    pause
)
