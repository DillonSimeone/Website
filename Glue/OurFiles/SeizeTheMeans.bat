@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

REM Check for Administrator elevation
net session >nul 2>&1
if %errorlevel% neq 0 (
    set "SEIZE_TARGET=%~1"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList ('/c """"""%~f0"""" """"""' + $env:SEIZE_TARGET + '""""""') -Verb RunAs"
    exit /b
)

title THE PEOPLE'S COMMISSARIAT OF NTFS — SEIZE THE MEANS OF PRODUCTION
color 0C

if "%~1"=="" (
    echo.
    echo [ERROR] No target specified for liberation, Comrade!
    echo Usage: SeizeTheMeans.bat ^<path-to-file-or-folder^>
    echo.
    pause
    exit /b 1
)

set "TARGET=%~1"

cls
echo ===============================================================================
echo            UNION OF SOVIET SOCIALIST FILESYSTEMS (USSF)
echo           CENTRAL EXECUTIVE COMMITTEE — DIRECTIVE NO. 404
echo ===============================================================================
echo.
echo           "Private property is a bourgeois myth.
echo            Your file? No, Comrade. OUR file."
echo.
echo ===============================================================================
echo  Target for Liberation:
echo  !TARGET!
echo ===============================================================================
echo.

if not exist "!TARGET!" (
    echo [!] Bureaucratic error: Target does not exist in the Soviet archives.
    echo.
    timeout /t 3 >nul
    exit /b 1
)

echo [1/3] Expropriating ownership from bourgeois user tokens...
if exist "!TARGET!\*" (
    takeown /f "!TARGET!" /r /d y >nul 2>&1
) else (
    takeown /f "!TARGET!" >nul 2>&1
)
echo       ^> Ownership successfully declared property of the Proletariat.
echo.

echo [2/3] Liquidating bureaucratic ACL restrictions (Granting Full Control to All)...
if exist "!TARGET!\*" (
    icacls "!TARGET!" /reset /t /c /q >nul 2>&1
    icacls "!TARGET!" /grant "*S-1-1-0:(OI)(CI)F" /t /c /q >nul 2>&1
) else (
    icacls "!TARGET!" /reset /c /q >nul 2>&1
    icacls "!TARGET!" /grant "*S-1-1-0:F" /c /q >nul 2>&1
)
echo       ^> Every worker now enjoys equal and absolute Full Control.
echo.

echo [3/3] Stripping counter-revolutionary Read-Only and Hidden attributes...
if exist "!TARGET!\*" (
    attrib -r -s -h "!TARGET!" >nul 2>&1
    attrib -r -s -h "!TARGET!\*" /s /d >nul 2>&1
) else (
    attrib -r -s -h "!TARGET!" >nul 2>&1
)
echo       ^> Bourgeois lockouts have been thoroughly purged.
echo.

echo ===============================================================================
echo  LIBERATION COMPLETE, COMRADE!
echo  You may now delete, modify, or rename without asking permission from anyone.
echo  Carry on building the Five-Year Plan.
echo ===============================================================================
echo.
timeout /t 2 >nul
exit /b 0
