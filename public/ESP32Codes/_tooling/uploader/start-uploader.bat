@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ==================================================
echo         PlatformIO Web Uploader Startup
echo ==================================================
echo.

:: Prepend common paths for node
set "PATH=%USERPROFILE%\.platformio\penv\Scripts;%LOCALAPPDATA%\Programs\Python\Python314\Scripts;%LOCALAPPDATA%\Programs\Python\Python310\Scripts;%PATH%"

:: Check if node_modules is installed
if not exist "node_modules" (
    echo [i] Installing node dependencies express and ws...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to run npm install. Make sure Node.js is installed.
        pause
        exit /b 1
    )
)

echo [i] Starting server...
node start-wrapper.js
pause
