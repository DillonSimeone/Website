@echo off
echo Building LittleFS image...
pio run -t buildfs
echo Uploading LittleFS image...
pio run -t uploadfs
echo Building and Uploading Code...
pio run -t upload
if %ERRORLEVEL% EQU 0 (
    timeout /t 2 /nobreak >nul
    pio device monitor
)
pause
