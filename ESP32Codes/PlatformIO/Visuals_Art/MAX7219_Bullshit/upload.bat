@echo off
pio run --target upload
if %ERRORLEVEL% EQU 0 (
    timeout /t 2 /nobreak >nul
    pio device monitor
)
pause
