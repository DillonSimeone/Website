@echo off
echo ==========================================
echo      Govee Lights Control - Builder
echo ==========================================

REM Check if virtual environment is active
if defined VIRTUAL_ENV (
    echo Virtual environment is already active.
) else (
    if exist venv\Scripts\activate.bat (
        echo Activating virtual environment...
        call venv\Scripts\activate.bat
    )
)

echo.
echo Ensuring GoveeControl is not running...
taskkill /IM "GoveeControl.exe" /F 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Cleaning up previous builds...
rmdir /s /q build dist
del /q *.spec

echo.
echo Building Lightweight Executable...
echo This uses standard Python libraries + requests, so it will be much smaller.
echo.

pyinstaller --noconfirm --onefile --console --name "GoveeControl" --add-data "web;web" --exclude-module PyQt6 --exclude-module webview --exclude-module tkinter server.py

if %errorlevel% neq 0 (
    echo.
    echo BUILD FAILED!
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo          Build Successful!
echo ==========================================
echo.
echo Your executable is located in the 'dist' folder.
echo.
pause