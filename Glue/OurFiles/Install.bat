@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM Check for Administrator elevation
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Requesting administrative authorization from the Politburo...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

title THE PEOPLE'S COMMISSARIAT OF NTFS — INSTALLER
color 0E

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "WORKER=%SCRIPT_DIR%\SeizeTheMeans.bat"

if not exist "%WORKER%" (
    echo [ERROR] Could not find SeizeTheMeans.bat in:
    echo "%SCRIPT_DIR%"
    pause
    exit /b 1
)

echo ===============================================================================
echo            UNION OF SOVIET SOCIALIST FILESYSTEMS (USSF)
echo          REGISTERING CONTEXT MENU: "OUR FILE, COMRADE"
echo ===============================================================================
echo.
echo Installing right-click context menu:
echo Label:  [ Seize the Means of Production (Take Ownership) ]
echo Worker: %WORKER%
echo.

:: Clean up legacy keys if present
reg delete "HKCR\*\shell\OurFiles" /f >nul 2>&1
reg delete "HKCR\Directory\shell\OurFiles" /f >nul 2>&1
reg delete "HKCR\Directory\Background\shell\OurFiles" /f >nul 2>&1

set "MENU_LABEL=Seize the Means of Production (Take Ownership)"
set "ICON=imageres.dll,-5323"

:: 1. Individual Files (*) - runas verb guarantees elevated execution
reg add "HKCR\*\shell\runas" /ve /d "%MENU_LABEL%" /f >nul
reg add "HKCR\*\shell\runas" /v "HasLUAShield" /t REG_SZ /d "" /f >nul
reg add "HKCR\*\shell\runas" /v "Icon" /t REG_SZ /d "%ICON%" /f >nul
reg add "HKCR\*\shell\runas\command" /ve /d "cmd.exe /c \"\"%WORKER%\" \"%%1\"\"" /f >nul

:: 2. Folders / Directories
reg add "HKCR\Directory\shell\runas" /ve /d "%MENU_LABEL%" /f >nul
reg add "HKCR\Directory\shell\runas" /v "HasLUAShield" /t REG_SZ /d "" /f >nul
reg add "HKCR\Directory\shell\runas" /v "Icon" /t REG_SZ /d "%ICON%" /f >nul
reg add "HKCR\Directory\shell\runas\command" /ve /d "cmd.exe /c \"\"%WORKER%\" \"%%1\"\"" /f >nul

:: 3. Directory Background (Empty space inside open folder)
reg add "HKCR\Directory\Background\shell\runas" /ve /d "%MENU_LABEL%" /f >nul
reg add "HKCR\Directory\Background\shell\runas" /v "HasLUAShield" /t REG_SZ /d "" /f >nul
reg add "HKCR\Directory\Background\shell\runas" /v "Icon" /t REG_SZ /d "%ICON%" /f >nul
reg add "HKCR\Directory\Background\shell\runas\command" /ve /d "cmd.exe /c \"\"%WORKER%\" \"%%V\"\"" /f >nul

echo.
echo ===============================================================================
echo [SUCCESS] Context menu installed with native Administrator elevation!
echo Right-click any file or folder to seize ownership and liberate permissions.
echo ===============================================================================
echo.
pause
exit /b 0
