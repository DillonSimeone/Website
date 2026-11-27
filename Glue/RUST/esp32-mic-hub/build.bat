@echo off
cd /d "%~dp0"
cargo build --release
if %ERRORLEVEL% EQU 0 (
    copy /Y target\release\esp32-mic-hub.exe esp32-mic-hub.exe >nul
    echo Built esp32-mic-hub.exe
)
