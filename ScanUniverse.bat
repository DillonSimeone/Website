@echo off
echo ========================================
echo   Universe City ^& Sitemap Generator
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0ScanUniverse.ps1"

echo.
echo Operation Complete.
pause
