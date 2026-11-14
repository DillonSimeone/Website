@echo off
setlocal
cd /d "%~dp0"

set "TARGET=%~dp0run_command_center.vbs"
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DaemonCommandCenter.lnk"

echo ========================================================
echo     Daemon Command Center - Windows Startup Setup
echo ========================================================
echo.
echo Target script: %TARGET%
echo Startup link:   %SHORTCUT%
echo.

if exist "%SHORTCUT%" (
    echo [FOUND] Startup shortcut is currently installed.
    choice /M "Do you want to REMOVE Daemon Command Center from Windows Startup"
    if errorlevel 2 goto :eof
    del "%SHORTCUT%"
    echo [SUCCESS] Removed startup shortcut.
    goto :done
)

echo Creating Windows Startup shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET%\" --minimized'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = '%~dp0command_center.ico'; $s.Description = 'Daemon Command Center (Master Manager for Pixel Tether & 5GHz Sentinel)'; $s.Save()"

rem Clean up obsolete standalone shortcuts since Command Center is master manager
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PixelAutoTether.lnk" (
    del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PixelAutoTether.lnk"
    echo [CLEANUP] Consolidated PixelAutoTether.lnk into DaemonCommandCenter.
)
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PhoneWifiSentinel.lnk" (
    del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PhoneWifiSentinel.lnk"
    echo [CLEANUP] Consolidated PhoneWifiSentinel.lnk into DaemonCommandCenter.
)

if exist "%SHORTCUT%" (
    echo [SUCCESS] Daemon Command Center is configured to start automatically on boot.
) else (
    echo [ERROR] Failed to create shortcut in Startup folder.
)

:done
echo.
pause
