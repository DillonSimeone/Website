$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ScriptDir "sentinel.pid"
if (Test-Path $PidFile) {
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "Watch-PhoneWifi5G\.ps1" }
if ($procs) {
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force
        Write-Host "Stopped Sentinel process (PID: $($p.ProcessId))"
    }
} else {
    Write-Host "No active Phone 5GHz Sentinel process found."
}
