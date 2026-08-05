@echo off
setlocal
echo Starting CH32V003Haptics upload (WCH-LinkE)...
echo.

call pio run --target upload
if %ERRORLEVEL% neq 0 (
    echo.
    echo ------------------------------------------
    echo UPLOAD FAILED!
    echo.
    echo Checklist:
    echo   1. WCH-LinkE drivers installed
    echo   2. LinkE in RISC-V mode (VID:PID 1A86:8010)
    echo   3. Wired: LinkE 3V3/GND/SWIO -^> Board 3V3/GND/PD1
    echo   4. See README.md for recovery steps
    echo ------------------------------------------
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ------------------------------------------
echo SUCCESS! Firmware flashed.
echo ------------------------------------------
pause
