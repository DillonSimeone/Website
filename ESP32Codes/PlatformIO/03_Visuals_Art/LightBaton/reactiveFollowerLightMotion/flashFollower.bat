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

call "%PIO%" run --target upload
if !ERRORLEVEL! equ 0 (
    timeout /t 2 /nobreak >nul
    call "%PIO%" device monitor
)
pause
