@echo off
:: Check for administrative privileges
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"

if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges to modify network adapter settings...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "cmd.exe", "/c \""%~dp0%~nx0\""", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    echo ====================================================
    echo        Restoring Ethernet Interface to DHCP
    echo ====================================================
    
    :: Use PowerShell to dynamically find physical Ethernet name and set to DHCP
    powershell -Command ^
        "$adapter = Get-NetAdapter -Physical | Where-Object { $_.Name -like '*Ethernet*' } | Select-Object -ExpandProperty Name -First 1;" ^
        "if (-not $adapter) {" ^
        "    $adapter = Get-NetAdapter -Physical | Where-Object { $_.Name -notlike '*Wi-Fi*' } | Select-Object -ExpandProperty Name -First 1;" ^
        "}" ^
        "if ($adapter) {" ^
        "    Write-Host 'Found interface:' $adapter;" ^
        "    netsh interface ipv4 set address name=\"$adapter\" source=dhcp;" ^
        "    netsh interface ipv4 set dnsservers name=\"$adapter\" source=dhcp;" ^
        "    Write-Host 'Successfully reverted to DHCP!';" ^
        "} else {" ^
        "    Write-Host '[!] No physical network adapter detected. No changes made.';" ^
        "}"
        
    echo ====================================================
    echo Network restore complete.
    pause
