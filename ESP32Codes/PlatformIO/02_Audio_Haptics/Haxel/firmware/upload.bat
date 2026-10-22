@echo off
REM Launch the PlatformIO Web Uploader (handles UTF-8, upload + uploadfs for LittleFS projects).
cd /d "%~dp0..\..\..\..\_tooling\uploader"
if not exist "start-uploader.bat" (
  echo [ERROR] Web uploader not found at %CD%
  pause
  exit /b 1
)
call start-uploader.bat
