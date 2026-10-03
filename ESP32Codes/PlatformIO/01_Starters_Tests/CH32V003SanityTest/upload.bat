@echo off
setlocal
echo Building and flashing CH32V003 sanity test...
echo LinkE wiring: SWDIO to SWD, 3V3 to V, GND to G
echo.

call pio run --target upload
if %ERRORLEVEL% neq 0 (
    echo.
    echo UPLOAD FAILED
    echo Check that the WCH-LinkE is connected and in RISC-V mode.
    echo Expected USB VID:PID: 1A86:8010
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo SUCCESS - look for three quick LED flashes, then a pause.
pause
