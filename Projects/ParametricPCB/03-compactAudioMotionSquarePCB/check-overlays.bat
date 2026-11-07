@echo off
node "%~dp0..\shared\check-overlays.mjs" %*
if errorlevel 1 (
    echo.
    pause
)
