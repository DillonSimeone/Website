@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Building DeafDoorbell Leader [leader-legacy] Firmware
echo ============================================================
echo.

call pio run -e leader-legacy
if %ERRORLEVEL% neq 0 (
    echo.
    echo ============================================================
    echo   BUILD FAILED! Please check compilation errors above.
    echo ============================================================
    pause
    exit /b %ERRORLEVEL%
)

if not exist ".pio\build\leader-legacy\firmware.bin" (
    echo.
    echo Error: firmware.bin was not found in .pio\build\leader-legacy\
    pause
    exit /b 1
)

copy /y ".pio\build\leader-legacy\firmware.bin" "firmware_legacy.bin" >nul
copy /y ".pio\build\leader-legacy\firmware.bin" "firmware.bin" >nul
if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo   BUILD SUCCESSFUL! [leader-legacy]
    echo   Output saved to:
    echo     %~dp0firmware_legacy.bin
    echo     %~dp0firmware.bin
    echo   You can upload this file via http://192.168.4.1/update
    echo ============================================================
) else (
    echo Error copying firmware.bin to project root.
)

echo.
if "%~1"=="--no-pause" goto :eof
pause
:eof
