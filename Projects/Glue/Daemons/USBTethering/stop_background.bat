@echo off
setlocal
echo Stopping any running auto_tether.py instances...

powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*auto_tether.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Terminated process ' + $_.ProcessId) }"

echo Done.
timeout /t 2 >nul
