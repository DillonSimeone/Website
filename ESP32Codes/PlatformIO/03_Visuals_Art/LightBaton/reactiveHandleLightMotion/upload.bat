@echo off
setlocal enabledelayedexpansion

:: Run from this project's directory (where platformio.ini lives)
cd /d "%~dp0"

:: Explorer launches often miss Python / PlatformIO on PATH - prepend common locations
set "PATH=%USERPROFILE%\.platformio\penv\Scripts;%LOCALAPPDATA%\Programs\Python\Python314\Scripts;%LOCALAPPDATA%\Programs\Python\Python310\Scripts;%LOCALAPPDATA%\Programs\Python\Python313\Scripts;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"

:: Resolve PlatformIO CLI to a full path when possible
set "PIO=pio"
where pio >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.platformio\penv\Scripts\pio.exe" (
        set "PIO=%USERPROFILE%\.platformio\penv\Scripts\pio.exe"
    ) else (
        echo [ERROR] PlatformIO CLI ^('pio'^) not found. Install: pip install platformio
        pause
        exit /b 1
    )
)

echo [i] Using: %PIO%
echo [i] Project: %CD%

echo.
echo Which sensor?
echo   1. MPU 6050
echo   2. MPU 6500
choice /c 12 /n /m "Select [1-2]: "
if errorlevel 2 (
    set "TARGET_ENV=esp32c3_mpu6500"
) else (
    set "TARGET_ENV=esp32c3_mpu6050"
)

echo [i] Upload environment: !TARGET_ENV!
call "%PIO%" run --environment !TARGET_ENV! --target upload
if !ERRORLEVEL! equ 0 (
    timeout /t 2 /nobreak >nul
    call "%PIO%" device monitor --environment !TARGET_ENV!
)
pause
