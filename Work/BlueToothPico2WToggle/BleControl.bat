@echo off
cls
echo ==============================================
echo BIONI BLE CONTROL DESKTOP TOOL
echo ==============================================

if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo Installing bleak...
    pip install bleak
) else (
    call venv\Scripts\activate.bat
)

:menu
echo.
echo [1] Select INPUT 1
echo [2] Select INPUT 2
echo [0] Deselect All
echo [Q] Quit
set /p choice="Enter your choice: "

if /I "%choice%"=="Q" (
    exit /b
)

if "%choice%"=="1" goto execute
if "%choice%"=="2" goto execute
if "%choice%"=="0" goto execute

echo Invalid choice.
goto menu

:execute
python scripts\ble_send.py %choice%
goto menu
