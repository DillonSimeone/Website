# Setup.ps1 - 1-Click Portable Setup for Native Rust Glue Daemon Ecosystem
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       GLUE RUST ECOSYSTEM: PORTABLE 1-CLICK SETUP        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Target Directory: $ScriptDir`n" -ForegroundColor DarkGray

# Strip Mark-of-the-Web (Zone.Identifier) streams if downloaded/synced from web
Get-ChildItem -Path $ScriptDir -Recurse -Include *.exe,*.dll,*.ps1,*.bat -ErrorAction SilentlyContinue |
    Unblock-File -ErrorAction SilentlyContinue

# 1. Verify / Auto-Download Google platform-tools (adb.exe)
$PlatformToolsDir = Join-Path $ScriptDir "platform-tools"
$AdbPath = Join-Path $PlatformToolsDir "adb.exe"

if (-not (Test-Path $AdbPath)) {
    Write-Host "[1/5] ADB not found locally. Auto-downloading Google Platform Tools..." -ForegroundColor Yellow
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
    Write-Host "[1/5] ADB verified: $AdbPath" -ForegroundColor Green
}

# 2. Verify / Generate default config.json
$CommandCenterDir = Join-Path $ScriptDir "daemon-command-center"
$ConfigFile = Join-Path $CommandCenterDir "config.json"

if (-not (Test-Path $ConfigFile)) {
    Write-Host "[2/5] Generating initial default daemon configuration..." -ForegroundColor DarkGray
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
    Write-Host "[2/5] Configuration verified: $ConfigFile" -ForegroundColor Green
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

# 3. Verify / Compile Native Rust Binaries
Write-Host "[3/5] Verifying native Rust binaries..." -ForegroundColor DarkGray
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

$Crates = @(
    @{ Name = "daemon-command-center"; Exe = "daemon-command-center.exe" },
    @{ Name = "taskbar-sentinel"; Exe = "taskbar-sentinel.exe" },
    @{ Name = "audio-to-smartphone-haptics"; Exe = "audio-to-smartphone-haptics.exe" },
    @{ Name = "wifi-sentinel"; Exe = "wifi-sentinel.exe" },
    @{ Name = "usb-tether"; Exe = "usb-tether.exe" },
    @{ Name = "energy-daemon"; Exe = "energy-daemon.exe" }
)

$MissingCrates = @()
foreach ($c in $Crates) {
    $exePath = Join-Path (Join-Path $ScriptDir $c.Name) $c.Exe
    if (-not (Test-Path $exePath)) {
        $MissingCrates += $c
    }
}

if ($MissingCrates.Count -gt 0) {
    $missingNames = ($MissingCrates | ForEach-Object { $_.Exe }) -join ", "
    Write-Host "      [!] Missing prebuilt binaries: $missingNames" -ForegroundColor Yellow

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Host "      [!] Rust/Cargo not found. Bootstrapping rustup (stable-x86_64-pc-windows-gnu) to compile missing binaries..." -ForegroundColor Yellow
        $RustupExe = Join-Path $env:TEMP "rustup-init.exe"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $RustupExe -UseBasicParsing
        & $RustupExe -y --default-toolchain stable-x86_64-pc-windows-gnu --profile minimal
        $env:PATH += ";$env:USERPROFILE\.cargo\bin"
    }

    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        foreach ($c in $MissingCrates) {
            $crateDir = Join-Path $ScriptDir $c.Name
            $exeDest = Join-Path $crateDir $c.Exe
            Write-Host "      Compiling $($c.Name) (--release)..." -ForegroundColor Cyan
            Push-Location $crateDir
            try {
                cargo build --release
                $builtExe = Join-Path $crateDir "target\release\$($c.Exe)"
                if (Test-Path $builtExe) {
                    Copy-Item -Path $builtExe -Destination $exeDest -Force
                    Unblock-File -Path $exeDest -ErrorAction SilentlyContinue
                    Write-Host "      Built and staged: $($c.Exe)" -ForegroundColor Green
                }
            } finally {
                Pop-Location
            }
        }
    } else {
        Write-Host "      [ERROR] Cannot compile missing binaries without Cargo." -ForegroundColor Red
    }
} else {
    Write-Host "      All 6 native Rust binaries verified." -ForegroundColor Green
}

# 4. Create Windows Startup Shortcuts
Write-Host "[4/5] Configuring Windows Auto-Startup..." -ForegroundColor DarkGray
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
} else {
    Write-Host "      [ERROR] Missing $CcExe - could not create GlueCommandCenter.lnk" -ForegroundColor Red
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
} else {
    Write-Host "      [ERROR] Missing $TsExe - could not create TaskbarSentinel.lnk" -ForegroundColor Red
}

# Remove legacy python links if present
$OldPyLnk = Join-Path $StartupDir "DaemonCommandCenter.lnk"
if (Test-Path $OldPyLnk) {
    Remove-Item $OldPyLnk -Force -ErrorAction SilentlyContinue
}

# 5. Stop any existing processes and launch clean suite
Write-Host "[5/5] Launching native Rust ecosystem..." -ForegroundColor DarkGray
Stop-Process -Name "daemon-command-center", "wifi-sentinel", "usb-tether", "energy-daemon", "taskbar-sentinel", "audio-to-smartphone-haptics" -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*audio_haptics_daemon.py*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

if (Test-Path $CcExe) {
    # Launch in interactive user session first so Windows Smart App Control stamps $KERNEL.PURGE.ESBCACHE
    Start-Process -FilePath $CcExe -WorkingDirectory $CommandCenterDir
    Write-Host "      Started Glue Command Center (Tray Badge Active)" -ForegroundColor Cyan
} else {
    Write-Host "      [ERROR] Could not launch Glue Command Center ($CcExe not found)" -ForegroundColor Red
}

if (Test-Path $TsExe) {
    Start-Process -FilePath $TsExe -WorkingDirectory $TsDir
    Write-Host "      Started Taskbar Sentinel (Live Taskbar HUD Active)" -ForegroundColor Cyan
} else {
    Write-Host "      [ERROR] Could not launch Taskbar Sentinel ($TsExe not found)" -ForegroundColor Red
}

Start-Sleep -Milliseconds 1200
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   INSTALLATION COMPLETE! Native Rust suite is active.     " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " - Left-click Tray Icon: Open Command Center HUD" -ForegroundColor DarkGray
Write-Host " - Right-click Tray Icon: Open Daemon Toggles & Quick Actions" -ForegroundColor DarkGray
Write-Host " - Right-click Taskbar Widget: Open Electricity Cost Settings" -ForegroundColor DarkGray
Write-Host ""
