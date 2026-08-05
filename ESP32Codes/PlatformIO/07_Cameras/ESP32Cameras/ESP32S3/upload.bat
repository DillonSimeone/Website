@echo off
echo Building and Uploading ESP32 Camera project...
pio run --target upload
if %ERRORLEVEL% EQU 0 (
    echo Upload Successful!
    echo Connection: http://3DprinterCam.local
    pio device monitor
) else (
    echo Upload Failed.
    pause
)
