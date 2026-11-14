# upload.ps1 - ESP32-C3 Manager
# Usage:
#   .\upload.ps1                          (Checks REPL, then Uploads)
#   .\upload.ps1 -Flash                   (Forces Firmware Flash, then Uploads)
#   .\upload.ps1 -Reset                   (Just Resets the board)

param (
    [Switch]$Flash,
    [Switch]$Reset,
    [String[]]$Files = $null
)

$ErrorActionPreference = "Stop"
$DEFAULT_BIN = "ESP32_GENERIC_C3-20251209-v1.27.0.bin"

# PC-side scripts to exclude
$EXCLUDE_LIST = @("check_repl.py", "monitor_serial.py", "check_wifi.py")

Write-Host "========================================================"
Write-Host "           ESP32-C3 Manager"
Write-Host "========================================================"

# --- 1. File Discovery ---
if ($null -eq $Files) {
    Write-Host "Scanning for project files..."
    $Files = Get-ChildItem -Path $PSScriptRoot -Include *.py, *.html, *.css, *.js -Recurse | 
             Where-Object { $EXCLUDE_LIST -notcontains $_.Name } |
             Select-Object -ExpandProperty Name
    $Files = $Files | Sort-Object { if ($_ -eq "boot.py") { 0 } else { 1 } }
}

# --- 2. Hostname Discovery ---
$Hostname = "esp32.local"
if (Test-Path "boot.py") {
    $content = Get-Content "boot.py" -Raw
    if ($content -match 'HOSTNAME\s*=\s*"([^"]+)"') {
        $Hostname = "http://" + $matches[1] + ".local"
    } elseif ($content -match 'hostname\s*=\s*"([^"]+)"') {
        $Hostname = "http://" + $matches[1] + ".local"
    }
}

# --- 3. Port Detection ---
function Get-ESPPort {
    try {
        $ports = Get-CimInstance -ClassName Win32_SerialPort | Select-Object DeviceID, Description
        if ($ports) {
            return ($ports | Sort-Object { [int]($_.DeviceID -replace "COM", "") } -Descending | Select-Object -First 1).DeviceID
        } else {
            $coms = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
            if ($coms) { return $coms[-1] }
        }
    } catch {}
    return "COM6"
}

$esp32c3Port = Get-ESPPort
Write-Host "Targeting: $esp32c3Port"

# --- 4. Helpers ---
function Invoke-HardReset {
    $code = "import serial, time; s=serial.Serial('$esp32c3Port'); s.dtr=0; s.rts=0; time.sleep(0.1); s.dtr=0; s.rts=1; time.sleep(0.1); s.dtr=0; s.rts=0; s.close()"
    $p = Start-Process -FilePath "python" -ArgumentList "-c `"$code`"" -NoNewWindow -PassThru -Wait
    Start-Sleep -Seconds 1
}

function Invoke-Flash {
    param([string]$BinFile = $DEFAULT_BIN)
    $BinPath = Join-Path $PSScriptRoot $BinFile
    if (-not (Test-Path $BinPath)) { Write-Error "Bin not found: $BinPath"; return $false }
    
    $esptoolCmd = "esptool.py"
    try {
        $pioInfo = pio system info --json-output 2>$null | ConvertFrom-Json
        $pkgDir = Join-Path $pioInfo.core_dir.value "packages"
        $toolDir = Get-ChildItem -Path $pkgDir -Filter "tool-esptoolpy*" -Directory | Select-Object -First 1
        if ($toolDir) { $esptoolCmd = "python " + (Join-Path $toolDir.FullName "esptool.py") }
    } catch {}

    try {
        Write-Host "--------------------------------------------------------"
        Write-Host "FLASHING FIRMWARE"
        Write-Host "--------------------------------------------------------"
        Invoke-Expression "$esptoolCmd --chip esp32c3 --port $esp32c3Port erase_flash"
        Invoke-Expression "$esptoolCmd --chip esp32c3 --port $esp32c3Port --baud 460800 --after hard_reset write_flash -z 0x0 `"$BinPath`""
        
        Write-Host -NoNewline "Waiting for reboot..."
        $timeout = 10
        while ($timeout -gt 0) {
            Write-Host -NoNewline "."
            Start-Sleep -Seconds 1
            if ([System.IO.Ports.SerialPort]::GetPortNames() -contains $esp32c3Port) { break }
            $timeout--
        }
        Write-Host " Ready."
        Start-Sleep -Seconds 2
        return $true
    } catch { return $false }
}

function Check-MicroPython {
    Write-Host -NoNewline "Checking MicroPython..."
    $checkScript = Join-Path $PSScriptRoot "check_repl.py"
    $p = Start-Process -FilePath "python" -ArgumentList "`"$checkScript`"", "$esp32c3Port" -NoNewWindow -PassThru -Wait
    if ($p.ExitCode -eq 0) { Write-Host " OK" -ForegroundColor Green; return $true }
    else { Write-Host " NO REPLY" -ForegroundColor Red; return $false }
}

# --- 5. Main Execution ---

if ($Reset) { Invoke-HardReset; exit 0 }

# Auto-Flash Logic
if (-not $Flash) {
    if (-not (Check-MicroPython)) {
        Invoke-HardReset
        if (-not (Check-MicroPython)) {
            $choice = Read-Host "Board not responding. Flash Firmware? (Y/N)"
            if ($choice -eq 'y') { $Flash = $true } else { exit 1 }
        }
    }
}

if ($Flash) {
    if (-not (Invoke-Flash)) { Write-Error "Flash failed."; exit 1 }
    if (-not (Check-MicroPython)) { Write-Error "Board unresponsive after flash."; exit 1 }
}

Write-Host "--------------------------------------------------------"
Write-Host "Uploading Files..."
Write-Host "--------------------------------------------------------"

foreach ($file in $Files) {
    if (Test-Path $file) {
        Write-Host -NoNewline "Uploading $file ... "
        $p = Start-Process -FilePath "ampy" -ArgumentList "-p $esp32c3Port", "put", "`"$file`"" -NoNewWindow -PassThru -Wait
        if ($p.ExitCode -eq 0) { Write-Host "OK" -ForegroundColor Green; Start-Sleep -Seconds 2 }
        else { Write-Host "FAILED" -ForegroundColor Red; exit 1 }
    }
}

Write-Host ""
Invoke-HardReset
Write-Host "--------------------------------------------------------"
Write-Host "SUCCESS!" -ForegroundColor Green
Write-Host "Access your device at: $Hostname"
Write-Host "--------------------------------------------------------"
