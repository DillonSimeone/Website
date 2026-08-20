@echo off
setlocal enabledelayedexpansion

:: Run from the firmware project directory (where platformio.ini lives)
cd /d "%~dp0"

:: Explorer double-clicks often miss Python / PlatformIO on PATH 窶・prepend common locations
set "PATH=%USERPROFILE%\.platformio\penv\Scripts;%LOCALAPPDATA%\Programs\Python\Python314\Scripts;%LOCALAPPDATA%\Programs\Python\Python310\Scripts;%LOCALAPPDATA%\Programs\Python\Python313\Scripts;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"

:: Resolve PlatformIO CLI to a full path when possible
set "PIO=pio"
where pio >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.platformio\penv\Scripts\pio.exe" (
        set "PIO=%USERPROFILE%\.platformio\penv\Scripts\pio.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python314\Scripts\pio.exe" (
        set "PIO=%LOCALAPPDATA%\Programs\Python\Python314\Scripts\pio.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\Scripts\pio.exe" (
        set "PIO=%LOCALAPPDATA%\Programs\Python\Python310\Scripts\pio.exe"
    ) else (
        echo [ERROR] PlatformIO CLI ^('pio'^) not found.
        echo         Install: pip install platformio
        echo         Or add Python Scripts to your system PATH.
        pause
        exit /b 1
    )
)

echo ==================================================
echo         ESP32-C3 AUTO-DETECTION UPLOADER
echo ==================================================
echo [i] Using: %PIO%
echo [i] Project: %CD%

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
    echo [WARN] No ESP32-C3 [VID:303A] detected via USB.
    echo [i] Attempting default auto-upload of firmware and filesystem...
    call "%PIO%" run --target upload
    if !ERRORLEVEL! equ 0 (
        call "%PIO%" run --target uploadfs
        timeout /t 2 /nobreak >nul
        call "%PIO%" device monitor
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
    call "%PIO%" run --target upload --upload-port %%p
    if !ERRORLEVEL! equ 0 (
        call "%PIO%" run --target uploadfs --upload-port %%p
        if !ERRORLEVEL! equ 0 (
            set "SUCCESS_PORTS=!SUCCESS_PORTS! %%p"
            set "LAST_PORT=%%p"
        ) else (
            echo [WARN] Filesystem upload failed for %%p.
            set "FAILED_PORTS=!FAILED_PORTS! %%p"
        )
    ) else (
        echo [WARN] Firmware upload failed for %%p.
        set "FAILED_PORTS=!FAILED_PORTS! %%p"
    )
)

echo.
echo ==================================================
echo                  SUMMARY
echo ==================================================
if defined SUCCESS_PORTS (
    echo [OK] Successfully uploaded to:!SUCCESS_PORTS!
)
if defined FAILED_PORTS (
    echo [WARN] Failed to upload to:!FAILED_PORTS!
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
        call "%PIO%" device monitor --port !LAST_PORT!
    ) else (
        echo.
        echo Multiple boards uploaded successfully. Monitor not started.
    )
)

:end
pause
