@echo off
setlocal enabledelayedexpansion

title Haxel Haptic Engine Flasher
color 0F

echo ========================================================================
echo                 HAXEL HAPTIC ENGINE — TURNKEY FLASHER
echo ========================================================================
echo  Hardware Abstraction Layer - Declarative Patterns - Web Telemetry
echo ========================================================================
echo.

REM ------------------------------------------------------------------------
REM STEP 1: Verify Python Installation
REM ------------------------------------------------------------------------
set "PYTHON_CMD="
where python >nul 2>&1 && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
    where py >nul 2>&1 && set "PYTHON_CMD=py"
)

if not defined PYTHON_CMD (
    echo [!] Python is not detected on this system.
    echo.
    where winget >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set /p "INSTALL_PY=Would you like to install Python 3 automatically using Windows Package Manager (winget)? [Y/N]: "
        if /i "!INSTALL_PY!"=="Y" (
            echo [*] Installing Python via winget...
            winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
            echo [*] Python installation requested. Refreshing environment...
            where python >nul 2>&1 && set "PYTHON_CMD=python"
            if not defined PYTHON_CMD (
                where py >nul 2>&1 && set "PYTHON_CMD=py"
            )
        )
    )
    if not defined PYTHON_CMD (
        echo [!] Python installation could not be verified automatically.
        echo Please download and install Python from: https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    )
)

echo [OK] Python found: !PYTHON_CMD!

REM ------------------------------------------------------------------------
REM STEP 2: Verify PlatformIO Core
REM ------------------------------------------------------------------------
set "PIO_EXE="
where pio >nul 2>&1 && set "PIO_EXE=pio"

REM Check common local PlatformIO installations
if not defined PIO_EXE (
    if exist "%USERPROFILE%\.platformio\penv\Scripts\pio.exe" (
        set "PIO_EXE=%USERPROFILE%\.platformio\penv\Scripts\pio.exe"
    ) else if exist "F:\.platformio\penv\Scripts\pio.exe" (
        set "PIO_EXE=F:\.platformio\penv\Scripts\pio.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\Scripts\pio.exe" (
        set "PIO_EXE=%LOCALAPPDATA%\Programs\Python\Python312\Scripts\pio.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\Scripts\pio.exe" (
        set "PIO_EXE=%LOCALAPPDATA%\Programs\Python\Python311\Scripts\pio.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\Scripts\pio.exe" (
        set "PIO_EXE=%LOCALAPPDATA%\Programs\Python\Python310\Scripts\pio.exe"
    )
)

if not defined PIO_EXE (
    echo.
    echo [!] PlatformIO Core is not detected.
    set /p "INSTALL_PIO=Would you like to install PlatformIO Core using pip? [Y/N]: "
    if /i "!INSTALL_PIO!"=="Y" (
        echo [*] Installing platformio via pip...
        !PYTHON_CMD! -m pip install --upgrade platformio
        where pio >nul 2>&1 && set "PIO_EXE=pio"
        if not defined PIO_EXE (
            if exist "%USERPROFILE%\.platformio\penv\Scripts\pio.exe" (
                set "PIO_EXE=%USERPROFILE%\.platformio\penv\Scripts\pio.exe"
            )
        )
    )
    if not defined PIO_EXE (
        echo [!] PlatformIO could not be found or installed.
        echo You can install it manually by running: !PYTHON_CMD! -m pip install platformio
        echo Or use VS Code with the PlatformIO IDE extension.
        pause
        exit /b 1
    )
)

REM Add pio directory to PATH for child subprocesses
for %%F in ("!PIO_EXE!") do set "PIO_DIR=%%~dpF"
if defined PIO_DIR set "PATH=%PIO_DIR%;%PATH%"

echo [OK] PlatformIO executable: !PIO_EXE!
echo.

REM ------------------------------------------------------------------------
REM STEP 3: Select Target Hardware & Mode
REM ------------------------------------------------------------------------
echo ========================================================================
echo  SELECT YOUR TARGET BOARD & HARDWARE PROFILE:
echo ========================================================================
echo  [1] ESP32-C3 SuperMini - WiFi Captive Portal + FastLED (DEFAULT / RECOMMENDED)
echo  [2] ESP32-C3 SuperMini - Chrome Web Bluetooth (BLE) + FastLED
echo  [3] DFRobot FireBeetle 2 ESP32-C6 Mini - WiFi Captive Portal (L298N 3-Motors)
echo  [4] DFRobot FireBeetle 2 ESP32-C6 Mini - Chrome Web Bluetooth (BLE)
echo  [5] ESP32-C6 FireBeetle - Fleet Follower (ESP-NOW Mesh Slave)
echo  [6] ESP32 DevKit v1 / Classic ESP32 - WiFi Captive Portal + FastLED
echo  [7] ESP32-S3 DevKit - WiFi Captive Portal + FastLED
echo ========================================================================
echo.
set "CHOICE=1"
set /p "CHOICE=Enter choice [1-7] (Default: 1): "

set "TARGET_ENV=c3WIFILED"
set "NEEDS_FS=1"

if "%CHOICE%"=="1" (
    set "TARGET_ENV=c3WIFILED"
    set "NEEDS_FS=1"
) else if "%CHOICE%"=="2" (
    set "TARGET_ENV=c3BLULED"
    set "NEEDS_FS=0"
) else if "%CHOICE%"=="3" (
    set "TARGET_ENV=c6WIFILED"
    set "NEEDS_FS=1"
) else if "%CHOICE%"=="4" (
    set "TARGET_ENV=c6BLULED"
    set "NEEDS_FS=0"
) else if "%CHOICE%"=="5" (
    set "TARGET_ENV=c6WIFILED_FOLLOWER"
    set "NEEDS_FS=0"
) else if "%CHOICE%"=="6" (
    set "TARGET_ENV=devWIFILED"
    set "NEEDS_FS=1"
) else if "%CHOICE%"=="7" (
    set "TARGET_ENV=s3WIFILED"
    set "NEEDS_FS=1"
)

echo.
echo [*] Target Environment: %TARGET_ENV%
echo [*] Please ensure your ESP32 is plugged into USB.
echo [*] (If the board fails to enter download mode, hold BOOT, pulse RESET, release BOOT)
echo.
pause

REM ------------------------------------------------------------------------
REM STEP 4: Compile & Upload Firmware
REM ------------------------------------------------------------------------
cd /d "%~dp0"
echo.
echo ========================================================================
echo  [1/3] VERIFYING PLATFORM PACKAGES (%TARGET_ENV%)...
echo ========================================================================
"!PIO_EXE!" pkg install -e %TARGET_ENV%

echo.
echo ========================================================================
echo  [2/3] COMPILING & FLASHING FIRMWARE (%TARGET_ENV%)...
echo ========================================================================
"!PIO_EXE!" run -e %TARGET_ENV% -t upload
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Firmware upload failed!
    echo Check USB cable connection, drivers, or hold BOOT button while plugging in.
    pause
    exit /b %ERRORLEVEL%
)

REM ------------------------------------------------------------------------
REM STEP 5: Upload LittleFS Web Portal (if applicable)
REM ------------------------------------------------------------------------
if "%NEEDS_FS%"=="1" (
    echo.
    echo ========================================================================
    echo  [2/2] UPLOADING LITTLEFS WEB PORTAL FILESYSTEM...
    echo ========================================================================
    "!PIO_EXE!" run -e %TARGET_ENV% -t uploadfs
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [WARNING] LittleFS filesystem upload failed.
        echo The firmware was flashed, but captive portal web pages may be missing.
        echo Try running this script again.
        pause
    )
)

echo.
echo ========================================================================
echo                    FLASH COMPLETED SUCCESSFULLY!
echo ========================================================================
if "%NEEDS_FS%"=="1" (
    echo  HOW TO CONNECT (WiFi Portal):
    echo  1. Unplug and replug USB, or press the physical RESET button on the board.
    echo  2. On your phone or laptop, open Wi-Fi settings.
    echo  3. Connect to the open network: Haxel-XXXX (XXXX = unique MAC suffix).
    echo  4. The Bauhaus captive portal will pop up automatically!
    echo     (Or navigate to http://192.168.4.1 in your browser).
) else (
    echo  HOW TO CONNECT (Web Bluetooth):
    echo  1. Unplug and replug USB, or press the physical RESET button on the board.
    echo  2. Open Chrome or Edge and visit:
    echo     https://dillonsimeone.com/Projects/Haxel/bluetooth.html
    echo  3. Click "CONNECT BLE" and select your Haxel device!
)
echo ========================================================================
echo.

set /p "START_MONITOR=Would you like to open the Serial Monitor (115200 baud)? [Y/N]: "
if /i "!START_MONITOR!"=="Y" (
    echo Starting serial monitor (Press Ctrl+C to exit)...
    "!PIO_EXE!" device monitor
)

echo Goodbye!
pause
exit /b 0
