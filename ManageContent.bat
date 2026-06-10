@echo off
echo ========================================
echo   Portfolio Content Manager Server
echo ========================================
echo.
echo Starting local node server...
echo UI will open in your browser shortly.
echo.
start "" "http://localhost:3456"
node "%~dp0tools\content-manager\server.js"
pause
