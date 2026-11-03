$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ScriptDir "haptics.pid"
if (Test-Path $PidFile) {
    try {
        $pidVal = [int](Get-Content -Path $PidFile -ErrorAction SilentlyContinue)
        if ($pidVal) {
            Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
        }
    } catch {}
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "audio_haptics_daemon\.py" }
if ($procs) {
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped Audio to Haptic Daemon process (PID: $($p.ProcessId))"
    }
}
