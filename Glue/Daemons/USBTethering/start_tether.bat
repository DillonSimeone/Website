@echo off
title Pixel 6a Auto USB Tethering
cd /d "%~dp0"
echo ===================================================
echo     Pixel 6a Auto USB Tethering Daemon (Console)
echo ===================================================
echo.
python "%~dp0auto_tether.py"
pause
