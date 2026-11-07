@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0UpdateFileList.ps1"
if errorlevel 1 (
    echo.
    echo File list was not updated.
    pause
    exit /b 1
)
echo.
pause
