$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location -LiteralPath $root
$skipDirs = @('node_modules', '.gradle', '__pycache__', '.git', 'raw')
$skipExt = @('.webm', '.mp4', '.mkv', '.mov', '.m4v', '.avi')
$files = New-Object System.Collections.Generic.List[object]

function Walk([string]$dir) {
    foreach ($item in (Get-ChildItem -LiteralPath $dir -Force)) {
        if ($item.PSIsContainer) {
            if ($skipDirs -contains $item.Name) { continue }
            Walk $item.FullName
            continue
        }
        $ext = $item.Extension.ToLower()
        if ($skipExt -contains $ext) { continue }
        if ($item.Name -eq 'scorecard.json' -or $item.Name -eq 'file-manifest.json') { continue }
        $rel = $item.FullName.Substring($root.Length).TrimStart('\').Replace('\', '/')
        $files.Add([pscustomobject]@{ path = $rel; size = [int64]$item.Length })
    }
}

Walk $root
$json = ConvertTo-Json -InputObject @{ files = @($files.ToArray()) } -Depth 3 -Compress
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $root 'file-manifest.json'), $json, $utf8)
Write-Host "Wrote $($files.Count) paths to file-manifest.json"
