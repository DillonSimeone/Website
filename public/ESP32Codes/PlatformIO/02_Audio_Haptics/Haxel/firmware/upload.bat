@echo off
pio run -e esp32-c3 --target upload
if %ERRORLEVEL% EQU 0 (
    pio run -e esp32-c3 --target uploadfs
    if %ERRORLEVEL% EQU 0 (
        timeout /t 2 /nobreak >nul
        pio device monitor -e esp32-c3
    )
)
pause
