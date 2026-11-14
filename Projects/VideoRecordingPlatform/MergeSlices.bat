@echo off
setlocal EnableExtensions
TITLE MYT Slice Merger Engine
cd /d "%~dp0"

:: Refresh common Windows PATH locations for Node.js and FFmpeg if not in active environment
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles%\ffmpeg\bin\ffmpeg.exe" set "PATH=%ProgramFiles%\ffmpeg\bin;%PATH%"
if exist "%ProgramFiles%\Git\usr\bin\openssl.exe" set "PATH=%ProgramFiles%\Git\usr\bin;%PATH%"
if exist "%LocalAppData%\Microsoft\WinGet\Links\ffmpeg.exe" set "PATH=%LocalAppData%\Microsoft\WinGet\Links;%PATH%"

set "NO_PAUSE="
for %%A in (%*) do (
  if /I "%%~A"=="--no-pause" set "NO_PAUSE=1"
  if /I "%%~A"=="-n" set "NO_PAUSE=1"
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js was not found in PATH!
  echo Please install Node.js LTS from https://nodejs.org/ or run scripts\start_hub.bat.
  echo.
  if "%NO_PAUSE%"=="" pause
  exit /b 1
)

echo.
echo Running MYT 5-Second Video Slice Merger...
node "%~dp0scripts\merge_slices.js" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if %EXIT_CODE% NEQ 0 (
  echo [ERROR] Slice merger exited with error code %EXIT_CODE%.
) else (
  echo [SUCCESS] Slices merged and merged.md manifests updated.
)

if "%NO_PAUSE%"=="" (
  echo.
  pause
)

exit /b %EXIT_CODE%
