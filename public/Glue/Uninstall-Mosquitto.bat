@echo off
:: Batch script to uninstall Mosquitto MQTT Broker with Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator permissions...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo [1/3] Stopping Mosquitto Broker service...
net stop mosquitto >nul 2>&1

echo [2/3] Deleting Mosquitto Windows service...
sc.exe delete mosquitto >nul 2>&1

echo [3/3] Running silent uninstaller...
if exist "C:\Program Files\mosquitto\Uninstall.exe" (
    "C:\Program Files\mosquitto\Uninstall.exe" /S
)

echo.
echo ===================================================
echo Mosquitto MQTT Broker has been completely removed!
echo ===================================================
timeout /t 3
