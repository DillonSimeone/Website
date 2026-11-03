# Setup.ps1 - 1-Click Portable Setup for Native Rust Glue Daemon Ecosystem
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       GLUE RUST ECOSYSTEM: PORTABLE 1-CLICK SETUP        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Target Directory: $ScriptDir`n" -ForegroundColor DarkGray

# 1. Verify / Auto-Download Google platform-tools (adb.exe)
$PlatformToolsDir = Join-Path $ScriptDir "platform-tools"
$AdbPath = Join-Path $PlatformToolsDir "adb.exe"

if (-not (Test-Path $AdbPath)) {
    Write-Host "[1/4] ADB not found locally. Auto-downloading Google Platform Tools..." -ForegroundColor Yellow
    $ZipUrl = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
    $ZipDest = Join-Path $ScriptDir "platform-tools.zip"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipDest -UseBasicParsing
        Write-Host "      Unpacking platform-tools..." -ForegroundColor DarkGray
        Expand-Archive -Path $ZipDest -DestinationPath $ScriptDir -Force
        Remove-Item -Path $ZipDest -Force -ErrorAction SilentlyContinue
        Write-Host "      ADB successfully installed to: $AdbPath" -ForegroundColor Green
    } catch {
        Write-Host "      [WARNING] Could not auto-download platform-tools: $_" -ForegroundColor Red
        Write-Host "      Please ensure internet access or place adb.exe in $PlatformToolsDir" -ForegroundColor Yellow
    }
} else {
    Write-Host "[1/4] ADB verified: $AdbPath" -ForegroundColor Green
}

# 2. Verify / Generate default config.json
$CommandCenterDir = Join-Path $ScriptDir "daemon-command-center"
$ConfigFile = Join-Path $CommandCenterDir "config.json"

if (-not (Test-Path $ConfigFile)) {
    Write-Host "[2/4] Generating initial default daemon configuration..." -ForegroundColor DarkGray
    $DefaultConfig = @{
        toggles = @{
            wifi_sentinel = $true
            usb_tether = $true
            energy_daemon = $true
            audio_haptics = $true
        }
        auto_restart_crashed = $true
    } | ConvertTo-Json -Depth 4
    Set-Content -Path $ConfigFile -Value $DefaultConfig -Encoding UTF8
    Write-Host "      Configuration written to $ConfigFile" -ForegroundColor Green
} else {
    Write-Host "[2/4] Configuration verified: $ConfigFile" -ForegroundColor Green
}

$HapticsDir = Join-Path $ScriptDir "audio-to-smartphone-haptics"
$HapticsConfigFile = Join-Path $HapticsDir "config.json"
if (-not (Test-Path $HapticsConfigFile)) {
    $DefaultHapticsConfig = @{
        enabled = $true
        amplitude_scale = 2.0
        base_amplitude = 70
        punch_duration_ms = 90
        noise_floor = 0.010
        min_velocity = 0.018
        enable_snap_primitives = $true
        sub_bass_low_hz = 30
        sub_bass_high_hz = 90
        mid_punch_high_hz = 220
        snap_high_hz = 1200
        mode = "gestolumina_pwm"
        govee_sync = $false
    } | ConvertTo-Json -Depth 4
    Set-Content -Path $HapticsConfigFile -Value $DefaultHapticsConfig -Encoding UTF8
}

# 3. Create Windows Startup Shortcuts
Write-Host "[3/4] Configuring Windows Auto-Startup..." -ForegroundColor DarkGray
$StartupDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$WshShell = New-Object -ComObject WScript.Shell

# Daemon Command Center Shortcut
$CcExe = Join-Path $CommandCenterDir "daemon-command-center.exe"
if (Test-Path $CcExe) {
    $CcShortcut = $WshShell.CreateShortcut((Join-Path $StartupDir "GlueCommandCenter.lnk"))
    $CcShortcut.TargetPath = $CcExe
    $CcShortcut.WorkingDirectory = $CommandCenterDir
    $CcShortcut.Description = "Glue Daemon Command Center (Native Rust System Tray Supervisor)"
    $CcShortcut.Save()
    Write-Host "      Created Startup Shortcut: GlueCommandCenter.lnk" -ForegroundColor Green
}

# Taskbar Sentinel Shortcut
$TsDir = Join-Path $ScriptDir "taskbar-sentinel"
$TsExe = Join-Path $TsDir "taskbar-sentinel.exe"
if (Test-Path $TsExe) {
    $TsShortcut = $WshShell.CreateShortcut((Join-Path $StartupDir "TaskbarSentinel.lnk"))
    $TsShortcut.TargetPath = $TsExe
    $TsShortcut.WorkingDirectory = $TsDir
    $TsShortcut.Description = "Taskbar Sentinel (Native Rust Taskbar Telemetry Widget)"
    $TsShortcut.Save()
    Write-Host "      Created Startup Shortcut: TaskbarSentinel.lnk" -ForegroundColor Green
}

# Remove legacy python links if present
$OldPyLnk = Join-Path $StartupDir "DaemonCommandCenter.lnk"
if (Test-Path $OldPyLnk) {
    Remove-Item $OldPyLnk -Force -ErrorAction SilentlyContinue
}

# 4. Stop any existing processes and launch clean suite
Write-Host "[4/4] Launching native Rust ecosystem..." -ForegroundColor DarkGray
Stop-Process -Name "daemon-command-center", "wifi-sentinel", "usb-tether", "energy-daemon", "taskbar-sentinel", "audio-to-smartphone-haptics" -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*audio_haptics_daemon.py*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

if (Test-Path $CcExe) {
    $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$CcExe`"" ; CurrentDirectory = "$CommandCenterDir" }
    Write-Host "      Started Glue Command Center (Tray Badge Active)" -ForegroundColor Cyan
}

if (Test-Path $TsExe) {
    $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$TsExe`"" ; CurrentDirectory = "$TsDir" }
    Write-Host "      Started Taskbar Sentinel (Live Taskbar HUD Active)" -ForegroundColor Cyan
}

Start-Sleep -Milliseconds 1200
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   INSTALLATION COMPLETE! Native Rust suite is active.     " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " - Left-click Tray Icon: Open Command Center HUD" -ForegroundColor DarkGray
Write-Host " - Right-click Tray Icon: Open Daemon Toggles & Quick Actions" -ForegroundColor DarkGray
Write-Host " - Right-click Taskbar Widget: Open Electricity Cost Settings" -ForegroundColor DarkGray
Write-Host ""
