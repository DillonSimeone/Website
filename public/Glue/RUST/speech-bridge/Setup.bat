@echo off
setlocal
title Speech Bridge :: 1-Click Offline Setup
echo ========================================================================
echo   SPEECH_BRIDGE :: AUTOMATIC OFFLINE MODEL ^& CUDA RUNTIME INSTALLER
echo ========================================================================
echo.
echo   This will download the portable GPU runtimes and offline AI models
echo   into local runtime\, models\, and piper\ folders (no Python or
echo   system-wide CUDA Toolkit required). Already-downloaded files are skipped.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Setup encountered an issue. Re-run Setup.bat to resume downloads.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo [DONE] Speech Bridge is ready! Launching speech-bridge.exe...
if exist "%~dp0speech-bridge.exe" (
    start "" "%~dp0speech-bridge.exe"
)
pause
