@echo off
setlocal
echo ========================================================
echo         Portfolio Website Lighthouse Auditor
echo ========================================================
echo.

set "MODE=%~1"
set "TARGET_URL=%~2"

if not "%MODE%"=="" goto :START_AUDIT

echo Choose an audit mode:
echo   1. Both Mobile and Desktop (Recommended)
echo   2. Mobile only (Simulated Slow 4G + Moto G Power)
echo   3. Desktop only
echo.
set /p CHOICE="Select [1-3, default 1]: "

if "%CHOICE%"=="2" (
    set "MODE=mobile"
) else if "%CHOICE%"=="3" (
    set "MODE=desktop"
) else (
    set "MODE=all"
)

:START_AUDIT
if "%TARGET_URL%"=="" set "TARGET_URL=http://localhost:5173/"

node "%~dp0tools\lighthouse\run.js" %MODE% %TARGET_URL%

echo.
pause
