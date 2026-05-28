@echo off
setlocal enabledelayedexpansion
echo ==================================================
echo         ESP32-C3 AUTO-DETECTION UPLOADER
echo ==================================================

:: Find all COM ports matching USB VID 303A (Espressif)
set "PORTS="
for /f "tokens=*" %%p in ('powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like '*VID_303A*' -and $_.Name -like '*(COM*' } | ForEach-Object { if ($_.Name -match '\((COM\d+)\)') { $Matches[1] } }"') do (
    set "PORTS=!PORTS! %%p"
)

:: Trim leading space
if defined PORTS (
    set "PORTS=!PORTS:~1!"
)

if not defined PORTS (
    echo [!] No ESP32-C3 [VID:303A] detected via USB.
    echo [i] Attempting default auto-upload of firmware and filesystem...
    call pio run --target upload
    if !ERRORLEVEL! equ 0 (
        call pio run --target uploadfs
        timeout /t 2 /nobreak >nul
        call pio device monitor
    )
    goto end
)

echo [+] Found ESP32-C3 ports: !PORTS!

:: Upload to all detected ports
set "SUCCESS_PORTS="
set "FAILED_PORTS="
set "LAST_PORT="

for %%p in (!PORTS!) do (
    echo.
    echo --------------------------------------------------
    echo Uploading firmware and filesystem to %%p...
    echo --------------------------------------------------
    call pio run --target upload --upload-port %%p
    if !ERRORLEVEL! equ 0 (
        call pio run --target uploadfs --upload-port %%p
        if !ERRORLEVEL! equ 0 (
            set "SUCCESS_PORTS=!SUCCESS_PORTS! %%p"
            set "LAST_PORT=%%p"
        ) else (
            echo [!] Filesystem upload failed for %%p.
            set "FAILED_PORTS=!FAILED_PORTS! %%p"
        )
    ) else (
        echo [!] Firmware upload failed for %%p.
        set "FAILED_PORTS=!FAILED_PORTS! %%p"
    )
)

echo.
echo ==================================================
echo                  SUMMARY
echo ==================================================
if defined SUCCESS_PORTS (
    echo [+] Successfully uploaded to:!SUCCESS_PORTS!
)
if defined FAILED_PORTS (
    echo [!] Failed to upload to:!FAILED_PORTS!
)

:: If a single port succeeded, start monitoring
if defined LAST_PORT (
    :: Count the number of successful ports
    set /a count=0
    for %%p in (!SUCCESS_PORTS!) do set /a count+=1
    
    if !count! equ 1 (
        echo.
        echo Starting device monitor on !LAST_PORT! in 2 seconds...
        timeout /t 2 /nobreak >nul
        call pio device monitor --port !LAST_PORT!
    ) else (
        echo.
        echo Multiple boards uploaded successfully. Monitor not started.
    )
)

:end
pause
