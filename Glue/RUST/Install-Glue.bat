@echo off
title Glue Rust Ecosystem Installer
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Setup encountered an issue. See details above.
    pause
) else (
    echo.
    echo Press any key to exit this window...
    pause >nul
)
