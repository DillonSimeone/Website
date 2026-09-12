@echo off
setlocal
cd /d "%~dp0"

set "TARGET=%~dp0run_background.vbs"
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PixelAutoTether.lnk"

echo ========================================================
echo     Pixel Auto USB Tethering Startup Configuration
echo ========================================================
echo.
echo Target script: %TARGET%
echo Startup link:   %SHORTCUT%
echo.

if exist "%SHORTCUT%" (
    echo [FOUND] Startup shortcut is currently installed.
    choice /M "Do you want to REMOVE auto-tethering from Windows Startup"
    if errorlevel 2 goto :eof
    del "%SHORTCUT%"
    echo [SUCCESS] Removed startup shortcut.
    goto :done
)

echo Creating Windows Startup shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET%\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Pixel 6a Auto USB Tethering Background Daemon'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [SUCCESS] Auto-tethering will now start automatically whenever your PC turns on.
) else (
    echo [ERROR] Failed to create shortcut in %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
)

:done
echo.
pause
