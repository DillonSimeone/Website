@echo off
TITLE "MYT Hub - Configure Windows Firewall for Mobile"
echo ========================================================
echo   MYT Capture Hub: Windows Firewall Configuration
echo ========================================================
echo.
echo Checking administrator privileges to allow phone connections...
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Administrator privileges required.
  echo Launching elevated administrator prompt...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

echo Adding Windows Firewall rules for Ports 3456 (HTTP), 3457 (HTTPS), and 5353 (mDNS)...
netsh advfirewall firewall delete rule name="MYT Hub HTTP Port 3456" >nul 2>&1
netsh advfirewall firewall add rule name="MYT Hub HTTP Port 3456" dir=in action=allow protocol=TCP localport=3456 profile=any >nul 2>&1

netsh advfirewall firewall delete rule name="MYT Hub HTTPS Port 3457" >nul 2>&1
netsh advfirewall firewall add rule name="MYT Hub HTTPS Port 3457" dir=in action=allow protocol=TCP localport=3457 profile=any >nul 2>&1

netsh advfirewall firewall delete rule name="MYT Hub mDNS UDP 5353" >nul 2>&1
netsh advfirewall firewall add rule name="MYT Hub mDNS UDP 5353" dir=in action=allow protocol=UDP localport=5353 profile=any >nul 2>&1

netsh advfirewall firewall delete rule name="MYT Hub Node.js" >nul 2>&1
netsh advfirewall firewall add rule name="MYT Hub Node.js" dir=in action=allow program="C:\Program Files\nodejs\node.exe" profile=any >nul 2>&1

echo.
echo ========================================================
echo [OK] Windows Firewall rules configured successfully!
echo Mobile phones on your Wi-Fi can now connect seamlessly.
echo ========================================================
echo.
pause
