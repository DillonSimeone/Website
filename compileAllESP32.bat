@echo off
title Compile All ESP32 Projects for ESP32-C3
cd /d "%~dp0"

echo ========================================================
echo   Compiling All ESP32 Projects for ESP32-C3 Architecture 
echo ========================================================
echo.

node tools\compile-esp32c3-suite.js

echo.
echo ========================================================
echo   Finished! Review compile_errors.log for any build failures.
echo ========================================================
echo.
pause
