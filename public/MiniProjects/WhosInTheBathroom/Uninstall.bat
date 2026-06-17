@echo off
setlocal EnableExtensions

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo.
    echo ================================================
    echo ERROR: You must right-click and Run as Administrator!
    echo ================================================
    echo.
    exit /b 1
)

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "DLL_PATH=%BASE_DIR%\WhosInTheBathroomContextMenu.dll"

regsvr32.exe /u /s "%DLL_PATH%"

reg delete "HKLM\Software\WhosInTheBathroom" /f >nul 2>&1

echo.
echo ================================================
echo WhosInTheBathroom? uninstallation complete.
echo File-locking handler registry footprint fully removed.
echo ================================================
echo.

exit /b 0
