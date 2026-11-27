@echo off
cls
echo ==============================================
echo BIONI E-INK - CHOOSE DEMO SCRIPT TO UPLOAD
echo ==============================================
echo [1] Fast Partial B/W  (~500ms, The Winner)
echo [2] Slow Tri-Color    (~5-15s, Use for Red)
echo [3] Hybrid Red        (Failed Test, Very Slow)
echo [4] Main App          (Current Development)
echo [5] Cold Boot Speed   (EEPROM + Fast Boot Bypass)
echo ==============================================
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    echo Switching to Fast Partial B/W Demo...
    copy /Y demos\FastPartialBW.cpp src\main.cpp
) else if "%choice%"=="2" (
    echo Switching to Slow Tri-Color Demo...
    copy /Y demos\SlowTriColor.cpp src\main.cpp
) else if "%choice%"=="3" (
    echo Switching to Hybrid Red Test...
    copy /Y demos\HybridRedBackground.cpp src\main.cpp
) else if "%choice%"=="4" (
    echo Switching to Main App...
    copy /Y demos\MainApp.cpp src\main.cpp
) else if "%choice%"=="5" (
    echo Switching to Cold Boot Speed...
    copy /Y demos\ColdBootSpeed.cpp src\main.cpp
) else (
    echo Invalid choice!
    pause
    exit /b
)

echo.
echo Compiling and uploading...
pio run -t upload
pause
