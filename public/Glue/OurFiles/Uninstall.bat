@echo off
setlocal EnableDelayedExpansion

:: Check for Administrator elevation
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Requesting administrative authorization from the Politburo...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

title THE PEOPLE'S COMMISSARIAT OF NTFS — UNINSTALLER
color 0C

set "MENU_NAME=OurFiles"

echo ===============================================================================
echo            UNION OF SOVIET SOCIALIST FILESYSTEMS (USSF)
echo          REMOVING CONTEXT MENU: "OUR FILE, COMRADE"
echo ===============================================================================
echo.
echo Removing registry keys...

reg delete "HKCR\*\shell\%MENU_NAME%" /f >nul 2>&1
reg delete "HKCR\Directory\shell\%MENU_NAME%" /f >nul 2>&1
reg delete "HKCR\Directory\Background\shell\%MENU_NAME%" /f >nul 2>&1

echo.
echo ===============================================================================
echo [SUCCESS] Context menu has been thoroughly demobilized and cleaned up.
echo ===============================================================================
echo.
pause
exit /b 0
