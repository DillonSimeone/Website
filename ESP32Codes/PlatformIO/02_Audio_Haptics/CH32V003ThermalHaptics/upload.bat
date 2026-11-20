@echo off
setlocal
echo Building and flashing CH32V003 Thermal Haptics...
echo.

call pio run --target upload
if %ERRORLEVEL% neq 0 (
    echo.
    echo UPLOAD FAILED
    echo Check WCH-LinkE RISC-V mode and SWIO/GND wiring.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo SUCCESS - firmware flashed.
pause
