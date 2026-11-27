@echo off
setlocal EnableExtensions
TITLE MYT Video Capture Hub
cd /d "%~dp0\.."

if /I "%~1"=="--install-only" (
  call :refresh_path
  call :install_missing
  if "%INSTALL_FAILED%"=="1" (
    echo.
    echo One or more installs failed. The setup page lists every download.
    pause
  )
  exit /b 0
)

call :refresh_path
call :detect_missing
if "%MISSING%"=="1" (
  net session >nul 2>&1
  if errorlevel 1 (
    echo.
    echo Administrator approval is required once to install missing software.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '--install-only' -Verb RunAs -Wait } catch { exit 1 }"
    call :refresh_path
  ) else (
    call :install_missing
    call :refresh_path
  )
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is still not installed. Opening the setup page with download links.
  start "" "%CD%\setup.html"
  echo After installing Node.js, close this window and run start_hub.bat again.
  pause
  exit /b 1
)

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

call :detect_missing
if "%OPTIONAL_MISSING%"=="1" (
  echo.
  echo Some tools are still missing. Opening the setup page.
  start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3456/setup.html"
)

echo.
echo Starting MYT Hub Gateway Server...
node server.js

pause
exit /b 0

:refresh_path
powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')" > "%TEMP%\myt_hub_path.txt"
for /f "usebackq delims=" %%P in ("%TEMP%\myt_hub_path.txt") do set "PATH=%%P"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles%\OpenSSL-Win64\bin\openssl.exe" set "PATH=%ProgramFiles%\OpenSSL-Win64\bin;%PATH%"
if exist "%ProgramFiles%\Git\usr\bin\openssl.exe" set "PATH=%ProgramFiles%\Git\usr\bin;%PATH%"
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%PATH%"
if exist "%LocalAppData%\Programs\Python\Python313\python.exe" set "PATH=%LocalAppData%\Programs\Python\Python313;%LocalAppData%\Programs\Python\Python313\Scripts;%PATH%"
if exist "%ProgramFiles%\Python312\python.exe" set "PATH=%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts;%PATH%"
if exist "%ProgramFiles%\Python313\python.exe" set "PATH=%ProgramFiles%\Python313;%ProgramFiles%\Python313\Scripts;%PATH%"
exit /b 0

:detect_missing
set "MISSING=0"
set "OPTIONAL_MISSING=0"
where node >nul 2>&1
if errorlevel 1 set "MISSING=1"
python --version 2>nul | findstr /I /C:"Python 3" >nul
if errorlevel 1 (
  set "MISSING=1"
  set "OPTIONAL_MISSING=1"
)
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  set "MISSING=1"
  set "OPTIONAL_MISSING=1"
)
openssl version >nul 2>&1
if errorlevel 1 (
  set "MISSING=1"
  set "OPTIONAL_MISSING=1"
)
exit /b 0

:install_missing
where winget >nul 2>&1
if errorlevel 1 (
  echo winget was not found. Install the items on the setup page by hand.
  set "INSTALL_FAILED=1"
  exit /b 0
)
where node >nul 2>&1
if errorlevel 1 (
  echo Installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  if errorlevel 1 set "INSTALL_FAILED=1"
)
python --version 2>nul | findstr /I /C:"Python 3" >nul
if errorlevel 1 (
  echo Installing Python 3...
  winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  if errorlevel 1 set "INSTALL_FAILED=1"
)
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo Installing FFmpeg...
  winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  if errorlevel 1 set "INSTALL_FAILED=1"
)
openssl version >nul 2>&1
if errorlevel 1 (
  echo Installing OpenSSL...
  winget install --id ShiningLight.OpenSSL.Light -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  if errorlevel 1 set "INSTALL_FAILED=1"
)
exit /b 0
