@echo off
setlocal
title Art-Net Lights

:: One admin prompt covers installs and the ethernet address change.
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo.
    echo  Windows needs permission to install anything missing
    echo  and to set the ethernet port for the lights.
    echo  Click Yes on the next prompt.
    echo.
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "cmd.exe", "/c \""%~dp0%~nx0\""", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /b
)

cd /d "%~dp0"

if not exist "%~dp0startArtnet.ps1" (
    echo.
    echo  Missing startArtnet.ps1.
    echo  Keep it in the same folder as startArtnet.bat.
    echo.
    pause
    exit /b 1
)

if exist "%~dp0audio_artnet.py" (
    set "APPDIR=%~dp0."
) else if exist "%~dp0artnet\audio_artnet.py" (
    set "APPDIR=%~dp0artnet"
) else (
    echo.
    echo  Could not find audio_artnet.py.
    echo  Keep startArtnet.bat in the same folder as audio_artnet.py.
    echo.
    pause
    exit /b 1
)

:: Drop the trailing slash so the path does not escape the closing quote.
for %%I in ("%APPDIR%") do set "APPDIR=%%~fI"

echo.
echo ====================================================
echo   Art-Net lights
echo ====================================================
echo.
echo  Stay on Wi-Fi. The lights cable does not provide internet,
echo  and the first run downloads anything that is missing.
echo.
echo  Plug the lights ethernet cable into this laptop.
echo  Leave this window open while the lights are running.
echo.
echo  When you are finished, double-click restore_network.bat
echo  to put the ethernet port back to normal.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0startArtnet.ps1" -AppDir "%APPDIR%"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo  The lights have stopped.
    echo  Double-click restore_network.bat if the ethernet port
    echo  should go back to normal.
) else (
    echo  Setup did not finish.
    echo  Stay on Wi-Fi and double-click startArtnet.bat again.
)
echo.
pause
exit /b %RC%
