@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Building DeafDoorbell Follower Firmware Binary
echo ============================================================
echo.

call pio run -e esp32c3
if %ERRORLEVEL% neq 0 (
    echo.
    echo ============================================================
    echo   BUILD FAILED! Please check compilation errors above.
    echo ============================================================
    pause
    exit /b %ERRORLEVEL%
)

if not exist ".pio\build\esp32c3\firmware.bin" (
    echo.
    echo Error: firmware.bin was not found in .pio\build\esp32c3\
    pause
    exit /b 1
)

copy /y ".pio\build\esp32c3\firmware.bin" "firmware.bin" >nul
if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo   BUILD SUCCESSFUL!
    echo   Output saved to: %~dp0firmware.bin
    echo ============================================================
) else (
    echo Error copying firmware.bin to project root.
)

echo.
if "%~1"=="--no-pause" goto :eof
pause
:eof
