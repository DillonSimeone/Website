@echo off
echo ========================================================
echo   RP2040 Ultrasonic Haptic Display - Build & Flash
echo ========================================================
echo.

:: 1. Build the firmware
echo Compiling firmware...
call pio run
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed! Check compiler output above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [SUCCESS] Firmware compiled successfully!
echo.

:: 2. Check if RP2040 UF2 Mass Storage drive is mounted
powershell -Command "$drive = Get-Volume | Where-Object { $_.FileSystemLabel -eq 'RPI-RP2' -or (Test-Path ($_.DriveLetter + ':\INFO_UF2.TXT')) }; if ($drive) { $target = $drive.DriveLetter + ':\'; echo \"Found RP2040 bootloader at $target\"; Copy-Item '.pio\build\pico\firmware.uf2' -Destination $target; echo '[SUCCESS] firmware.uf2 copied successfully! RP2040 is rebooting...'; exit 0 } else { exit 1 }"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Device flashed via UF2 drag-and-drop mode!
    timeout /t 3 /nobreak >nul
    echo Attempting to launch serial monitor...
    pio device monitor
) else (
    echo.
    echo [INFO] RP2040 UF2 drive (RPI-RP2) not found via auto-copy.
    echo Trying standard PlatformIO upload protocol...
    pio run --target upload
    if %ERRORLEVEL% EQU 0 (
        timeout /t 2 /nobreak >nul
        pio device monitor
    )
)

pause
