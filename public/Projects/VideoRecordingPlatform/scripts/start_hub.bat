@echo off
TITLE "MYT Video Capture Hub & Sync Gateway"
echo ========================================================
echo   MYT Multi-Device Video Capture Hub - Windows Starter   
echo ========================================================
cd /d "%~dp0\.."

echo Purging any previous or orphaned processes on ports 3456 and 3457...
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr :3457') do (
  if "%%a" neq "0" (
    taskkill /F /PID %%a >nul 2>&1
  )
)
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr :3456') do (
  if "%%a" neq "0" (
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo Checking environment and prerequisites...
node check_environment.js

echo.
echo Starting MYT Hub Gateway Server...
node server.js

pause
