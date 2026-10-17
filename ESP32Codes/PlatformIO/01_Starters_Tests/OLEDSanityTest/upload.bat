@echo off
echo ========================================================
echo   RP2040 OLED Sanity Test - Build & Flash
echo ========================================================
echo.

call pio run
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed!
    pause
    exit /b %ERRORLEVEL%
)

powershell -Command "$drive = Get-Volume | Where-Object { $_.FileSystemLabel -eq 'RPI-RP2' -or (Test-Path ($_.DriveLetter + ':\INFO_UF2.TXT')) }; if ($drive) { $target = $drive.DriveLetter + ':\'; echo \"Found RP2040 bootloader at $target\"; Copy-Item '.pio\build\pico\firmware.uf2' -Destination $target; echo '[SUCCESS] firmware.uf2 copied!'; exit 0 } else { exit 1 }"

if %ERRORLEVEL% EQU 0 (
    timeout /t 3 /nobreak >nul
    pio device monitor
) else (
    pio run --target upload
    if %ERRORLEVEL% EQU 0 (
        timeout /t 2 /nobreak >nul
        pio device monitor
    )
)

pause
