# Watch-PhoneWifi5G.ps1
# Background daemon to monitor Pixel 6a Wi-Fi band and auto-nudge to 5 GHz

$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $ScriptDir "sentinel.log"
$PidFile = Join-Path $ScriptDir "sentinel.pid"
$MaxLogLines = 500

# Single instance check
if (Test-Path $PidFile) {
    try {
        $oldPid = [int](Get-Content -Path $PidFile -ErrorAction SilentlyContinue)
        if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
            exit 0
        }
    } catch {}
}
Set-Content -Path $PidFile -Value $PID -ErrorAction SilentlyContinue

# Locate adb.exe
$AdbCandidates = @(
    (Join-Path (Split-Path -Parent $ScriptDir) "USBTethering\platform-tools\adb.exe"),
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "C:\platform-tools\adb.exe"
)
$Adb = $null
foreach ($c in $AdbCandidates) {
    if (Test-Path $c) { $Adb = $c; break }
}
if (-not $Adb) {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { $Adb = $cmd.Source }
}

function Log-Message([string]$msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $msg"
    Write-Output $line
    try {
        Add-Content -Path $LogFile -Value $line
        if ((Get-Item $LogFile).Length -gt 200KB) {
            $lines = Get-Content $LogFile | Select-Object -Last $MaxLogLines
            Set-Content -Path $LogFile -Value $lines
        }
    } catch {}
}

function Send-Toast([string]$Title, [string]$Message) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $textNodes = $template.GetElementsByTagName("text")
        $textNodes.Item(0).AppendChild($template.CreateTextNode($Title)) > $null
        $textNodes.Item(1).AppendChild($template.CreateTextNode($Message)) > $null
        $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Phone 5GHz Sentinel")
        $notifier.Show($toast)
    } catch {
        try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}
    }
}

Log-Message "=== Phone 5GHz Sentinel started ==="
Log-Message "Using ADB at: $Adb"
& $Adb start-server > $null 2>&1

$lastNudgeTime = [DateTime]::MinValue
$cooldownSeconds = 45

while ($true) {
    try {
        # Check if adb sees any authorized device
        $devices = & $Adb devices
        $isDeviceConnected = $false
        foreach ($d in $devices) {
            if ($d -match "([a-zA-Z0-9]+)\s+device$") {
                $isDeviceConnected = $true
                break
            }
        }

        if (-not $isDeviceConnected) {
            Start-Sleep -Seconds 10
            continue
        }

        # Query wifi status directly
        $statusRaw = (& $Adb shell "cmd wifi status") -join "`n"
        
        $freq = $null
        $ssid = "Unknown"
        $rxSpeed = $null
        $score = $null

        if ($statusRaw -match 'Frequency:\s*(\d+)MHz') {
            $freq = [int]$matches[1]
        }
        if ($statusRaw -match 'SSID:\s*"([^"]+)"') {
            $ssid = $matches[1]
        }
        if ($statusRaw -match 'Rx Link speed:\s*(\d+)Mbps') {
            $rxSpeed = [int]$matches[1]
        }
        if ($statusRaw -match 'score:\s*(\d+)') {
            $score = [int]$matches[1]
        }

        # If connected to Wi-Fi
        if ($freq -gt 0) {
            $is24GHz = ($freq -lt 5000)
            $isDegraded = ($rxSpeed -ne $null -and $rxSpeed -le 5)

            if ($is24GHz -or $isDegraded) {
                $now = Get-Date
                if (($now - $lastNudgeTime).TotalSeconds -ge $cooldownSeconds) {
                    $lastNudgeTime = $now
                    Log-Message "ALERT: Phone drifted to 2.4 GHz or degraded! SSID: $ssid, Freq: $freq MHz, Rx: $rxSpeed Mbps, Score: $score"
                    
                    try { [System.Media.SystemSounds]::Hand.Play() } catch {}
                    Send-Toast "Wi-Fi Drift Detected!" "Phone roamed to 2.4 GHz ($freq MHz, ${rxSpeed} Mbps). Nudging back to 5 GHz..."

                    # Nudge phone Wi-Fi
                    Log-Message "Executing auto-nudge (Wi-Fi cycle via ADB)..."
                    & $Adb shell "svc wifi disable; sleep 1; svc wifi enable"
                    
                    # Wait 6 seconds for Wi-Fi to re-associate
                    Start-Sleep -Seconds 6

                    # Verify new state
                    $newStatus = (& $Adb shell "cmd wifi status") -join "`n"
                    $newFreq = if ($newStatus -match 'Frequency:\s*(\d+)MHz') { [int]$matches[1] } else { 0 }
                    $newRx = if ($newStatus -match 'Rx Link speed:\s*(\d+)Mbps') { [int]$matches[1] } else { 0 }

                    if ($newFreq -ge 5000) {
                        Log-Message "SUCCESS: Reconnected to 5 GHz ($newFreq MHz, ${newRx} Mbps)."
                        try { [System.Media.SystemSounds]::Asterisk.Play() } catch {}
                        Send-Toast "5 GHz Restored" "Successfully pushed phone back to 5 GHz ($newFreq MHz, ${newRx} Mbps)."
                    } else {
                        Log-Message "WARNING: Auto-nudge failed to restore 5 GHz. Currently still on $newFreq MHz."
                        try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}
                        Send-Toast "5 GHz Reconnect Failed" "Phone is still on 2.4 GHz ($newFreq MHz). You may need to cycle Wi-Fi manually."
                    }
                }
            }
        }
    } catch {
        Log-Message "Error in sentinel loop: $_"
    }

    Start-Sleep -Seconds 12
}
