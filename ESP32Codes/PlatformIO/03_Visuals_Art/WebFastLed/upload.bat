@echo off
pio run --target upload
if %ERRORLEVEL% EQU 0 (
    echo Upload successful!
    timeout /t 2 /nobreak >nul
    pio device monitor
) else (
    echo Upload failed!
)
pause
