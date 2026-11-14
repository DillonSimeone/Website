@echo off
title Uninstall Glue Rust Suite
echo ==========================================================
echo        UNINSTALLING GLUE RUST SUITE & STARTUP HOOKS       
echo ==========================================================
echo.

powershell.exe -NoProfile -Command ^
    "Stop-Process -Name 'daemon-command-center', 'wifi-sentinel', 'usb-tether', 'energy-daemon', 'taskbar-sentinel', 'audio-to-smartphone-haptics' -Force -ErrorAction SilentlyContinue; ^
    $StartupDir = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup'); ^
    Remove-Item (Join-Path $StartupDir 'GlueCommandCenter.lnk') -Force -ErrorAction SilentlyContinue; ^
    Remove-Item (Join-Path $StartupDir 'TaskbarSentinel.lnk') -Force -ErrorAction SilentlyContinue; ^
    Remove-Item (Join-Path $StartupDir 'DaemonCommandCenter.lnk') -Force -ErrorAction SilentlyContinue; ^
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'TaskbarSentinel' -ErrorAction SilentlyContinue; ^
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'GlueCommandCenter' -ErrorAction SilentlyContinue; ^
    Write-Host 'All Glue processes stopped and Startup shortcuts removed successfully.' -ForegroundColor Green"

echo.
echo Glue suite has been uninstalled from Windows Startup.
pause
