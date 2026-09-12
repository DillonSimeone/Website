@echo off
:: Specifying the environment (-e) prevents unnecessary re-scanning and recompilation
pio run -e esp32-c3-devkitm-1 -t upload
if %ERRORLEVEL% EQU 0 (
    timeout /t 2 /nobreak >nul
    pio device monitor
)
pause
