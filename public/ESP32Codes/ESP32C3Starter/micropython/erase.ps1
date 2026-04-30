# erase.ps1 - PowerShell script to erase flash on ESP32-C3 SuperMini using PlatformIO's esptool

$ErrorActionPreference = "Stop"

Write-Host "========================================================"
Write-Host "     ESP32-C3 SuperMini MicroPython Flasher (Erase Only)"
Write-Host "========================================================"
Write-Host ""
Write-Host "Ensure your ESP32-C3 SuperMini is connected and in DOWNLOAD MODE."
Write-Host ""
Write-Host "To enter DOWNLOAD MODE:"
Write-Host "  1. Hold BOOT button."
Write-Host "  2. Press and release RESET button."
Write-Host "  3. Release BOOT button."
Write-Host ""

# 1. Locate esptool.py using PlatformIO's environment
Write-Host "[1/2] Locating esptool.py..."
try {
    $pioSystemInfo = pio system info --json-output | ConvertFrom-Json
    $platformioCoreDir = $pioSystemInfo.core_dir.value
    
    if (-not $platformioCoreDir) {
        throw "Could not determine PlatformIO core directory."
    }
    
    $packagesDir = Join-Path $platformioCoreDir "packages"
    
    $esptoolDir = Get-ChildItem -Path $packagesDir -Filter "tool-esptoolpy*" -Directory | Select-Object -First 1
    
    if (-not $esptoolDir) {
        throw "PlatformIO package 'tool-esptoolpy' not found. Ensure PlatformIO is correctly installed."
    }
    
    $pioEsptoolPath = Join-Path $esptoolDir.FullName "esptool.py"
    if (-not (Test-Path $pioEsptoolPath)) {
        throw "esptool.py not found at expected path: $pioEsptoolPath"
    }
    Write-Host "Found esptool.py at: $pioEsptoolPath"
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}

# 2. Find ESP32-C3 COM Port
Write-Host "[2/2] Detecting ESP32-C3 COM port..."
try {
    $deviceList = pio device list --json-output 2>$null | ConvertFrom-Json
    
    # Try to find a matching ESP32-C3 port by HWID/Description
    $esp32c3Port = $deviceList.ports | Where-Object { 
        $_.hwid -like "*VID:303A*PID:1001*" -or 
        $_.description -like "*ESP32-C3*" -or
        $_.description -like "*USB-SERIAL CH340*"
    } | Select-Object -ExpandProperty port

    if (-not $esp32c3Port) {
        Write-Warning "Could not auto-detect ESP32-C3 by HWID/Description."
        
        # Heuristic: Find the highest COM port (likely the plugged-in dev board)
        $detectedPorts = $deviceList.ports | Select-Object -ExpandProperty port
        $validPorts = $detectedPorts | Where-Object { $_ -match "^COM(\d+)$" }
        
        if ($validPorts) {
            $highestPort = $validPorts | Sort-Object { [int]($_ -replace "^COM", "") } -Descending | Select-Object -First 1
            Write-Host "Heuristic: Selecting highest COM port found ($highestPort) as probable ESP32."
            $esp32c3Port = $highestPort
        } else {
            Write-Warning "No valid COM ports detected."
            Write-Host "Defaulting to COM5 as fallback."
            $esp32c3Port = "COM5"
        }
    } elseif ($esp32c3Port.Count -gt 1) {
        Write-Warning "Multiple ESP32-C3 devices found. Using the first one: $($esp32c3Port[0])"
        $esp32c3Port = $esp32c3Port[0]
    }
    Write-Host "Targeting port: $esp32c3Port"
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}

# Erase Flash
Write-Host "Erasing flash (this may take a while)..."
try {
    & python $pioEsptoolPath --chip esp32c3 --port $esp32c3Port erase_flash
    if ($LASTEXITCODE -ne 0) { throw "esptool.py erase_flash command failed." }
    Write-Host "Flash erase completed successfully."
}
catch {
    Write-Error $_.Exception.Message
    Write-Host "!!!! ERASE FAILED !!!!"
    Write-Host "Ensure your board is in DOWNLOAD MODE."
    exit 1
}

Write-Host ""
Write-Host "========================================================"
Write-Host "      Flash Erase Complete"
Write-Host "========================================================"
Write-Host ""
Write-Host "Please disconnect and reconnect the board, then put it into DOWNLOAD MODE for flashing firmware."
Write-Host ""
pause