param(
    [Parameter(Mandatory = $true)]
    [string]$AppDir,
    [switch]$SetupOnly
)

$ErrorActionPreference = 'Stop'
$AppDir = $AppDir.Trim().TrimEnd('\')

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host $Message
}

# Windows PowerShell turns a program's error text into a stopping error
# when ErrorActionPreference is Stop. Installers and Python print there
# even when they are fine, so native programs are run with Continue.
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList,
        [switch]$Quiet
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Quiet) {
            & $FilePath @ArgumentList 2>$null | Out-Null
        } else {
            # Keep program text on screen, including messages written to stderr,
            # without mixing that text into the exit code we return.
            & $FilePath @ArgumentList 2>&1 | ForEach-Object { Write-Host "$_" }
        }
        if ($null -eq $LASTEXITCODE) { return 0 }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Test-PythonCandidate([string]$Exe, [string[]]$Prefix) {
    if ([string]::IsNullOrWhiteSpace($Exe)) { return $null }
    if ($Exe -match '\\WindowsApps\\python(3)?\.exe$') { return $null }
    if (-not (Test-Path -LiteralPath $Exe)) { return $null }

    $versionArgs = @($Prefix) + @('-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 2)')
    $code = Invoke-Native -FilePath $Exe -ArgumentList $versionArgs -Quiet
    if ($code -ne 0) { return $null }

    $pathArgs = @($Prefix) + @('-c', 'import sys; print(sys.executable)')
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $resolved = & $Exe @pathArgs 2>$null
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($LASTEXITCODE -ne 0) { return $null }
    $path = "$resolved".Trim()
    if ($path -match '\\WindowsApps\\' ) { return $null }
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return $path
}

function Find-Python {
    $candidates = New-Object System.Collections.Generic.List[object]

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        $candidates.Add([pscustomobject]@{ Exe = $py.Source; Prefix = @('-3') })
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        $candidates.Add([pscustomobject]@{ Exe = $python.Source; Prefix = @() })
    }

    $globs = @(
        "$env:ProgramFiles\Python*\python.exe",
        "${env:ProgramFiles(x86)}\Python*\python.exe",
        "$env:LocalAppData\Programs\Python\Python*\python.exe"
    )
    foreach ($glob in $globs) {
        foreach ($item in @(Get-Item $glob -ErrorAction SilentlyContinue)) {
            $candidates.Add([pscustomobject]@{ Exe = $item.FullName; Prefix = @() })
        }
    }

    foreach ($candidate in $candidates) {
        $prefix = @()
        if ($candidate.Prefix) { $prefix = @($candidate.Prefix) }
        $found = Test-PythonCandidate -Exe $candidate.Exe -Prefix $prefix
        if ($found) { return $found }
    }
    return $null
}

function Find-Node {
    $known = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe"
    )
    foreach ($path in $known) {
        if (Test-Path -LiteralPath $path) { return $path }
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node -and $node.Source -notmatch '\\WindowsApps\\') {
        return $node.Source
    }
    return $null
}

function Get-OsArch {
    # Windows PowerShell 5.1 does not expose OSArchitecture.
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
    switch ($arch) {
        'ARM64' { return 'Arm64' }
        'X86' { return 'X86' }
        default { return 'X64' }
    }
}

function Save-Url([string]$Url, [string]$Dest) {
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        throw "This PC is missing curl.exe, so downloads cannot start."
    }
    if (Test-Path -LiteralPath $Dest) { Remove-Item -LiteralPath $Dest -Force }
    $code = Invoke-Native -FilePath 'curl.exe' -ArgumentList @('-L', '--fail', '--retry', '3', '--retry-delay', '2', '-o', $Dest, $Url)
    if ($code -ne 0 -or -not (Test-Path -LiteralPath $Dest)) {
        throw "Download failed. Stay on Wi-Fi (the lights cable has no internet) and run startArtnet.bat again."
    }
}

function Get-PythonInstallerUrls {
    $html = (Invoke-WebRequest -UseBasicParsing 'https://www.python.org/ftp/python/').Content
    $versions = [regex]::Matches($html, 'href="(3\.\d+\.\d+)/"') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object { [version]$_ } -Descending

    $preferred = @($versions | Where-Object {
        $v = [version]$_
        $v.Major -eq 3 -and $v.Minor -ge 12 -and $v.Minor -le 13
    })
    if ($preferred.Count -eq 0) { $preferred = @($versions | Select-Object -First 4) }
    else { $preferred = @($preferred | Select-Object -First 4) }

    $arch = Get-OsArch
    $suffix = switch ($arch) {
        'Arm64' { '-arm64.exe' }
        'X86' { '.exe' }
        default { '-amd64.exe' }
    }

    foreach ($ver in $preferred) {
        "https://www.python.org/ftp/python/$ver/python-$ver$suffix"
    }
}

function Install-Python {
    Write-Step "Python is not installed. Downloading it now. This can take a few minutes."
    $dest = Join-Path $env:TEMP 'artnet-python-setup.exe'
    $urls = @(Get-PythonInstallerUrls)
    if ($urls.Count -eq 0) { throw "Could not find a Python installer on python.org." }

    $downloaded = $false
    foreach ($url in $urls) {
        Write-Host "Downloading $url"
        try {
            Save-Url -Url $url -Dest $dest
            $downloaded = $true
            break
        } catch {
            Write-Host "That download did not work. Trying another Python version..."
        }
    }
    if (-not $downloaded) { throw "Could not download Python. Stay on Wi-Fi and run startArtnet.bat again." }

    Write-Step "Installing Python. A progress window will appear."
    $install = Start-Process -FilePath $dest -ArgumentList @(
        '/passive',
        'InstallAllUsers=1',
        'PrependPath=1',
        'Include_pip=1',
        'Include_test=0',
        'Include_doc=0',
        'Include_launcher=1',
        'Shortcuts=0',
        'AssociateFiles=0'
    ) -Wait -PassThru

    if ($install.ExitCode -ne 0) {
        Write-Host "The all-users install did not finish (code $($install.ExitCode)). Trying a personal install..."
        $install = Start-Process -FilePath $dest -ArgumentList @(
            '/passive',
            'InstallAllUsers=0',
            'PrependPath=1',
            'Include_pip=1',
            'Include_test=0',
            'Include_doc=0',
            'Include_launcher=1',
            'Shortcuts=0',
            'AssociateFiles=0'
        ) -Wait -PassThru
        if ($install.ExitCode -ne 0) {
            throw "Python installer failed with code $($install.ExitCode)."
        }
    }

    Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
    $exe = Find-Python
    if (-not $exe) { throw "Python installed, but it could not be found. Close this window and run startArtnet.bat again." }
    return $exe
}

function Get-NodeInstallerUrl {
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
    if (-not $lts) { throw "Could not find a Node.js download." }
    $arch = switch (Get-OsArch) {
        'Arm64' { 'arm64' }
        'X86' { 'x86' }
        default { 'x64' }
    }
    return "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-$arch.msi"
}

function Install-Node {
    Write-Step "Node.js is not installed. Downloading it now. This can take a few minutes."
    $url = Get-NodeInstallerUrl
    $dest = Join-Path $env:TEMP 'artnet-node-setup.msi'
    Write-Host "Downloading $url"
    Save-Url -Url $url -Dest $dest

    Write-Step "Installing Node.js. A progress window will appear."
    $install = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList @(
        '/i', $dest, '/qb', '/norestart'
    ) -Wait -PassThru

    # 3010 means success, but Windows wants a reboot later.
    if ($install.ExitCode -ne 0 -and $install.ExitCode -ne 3010) {
        throw "Node.js installer failed with code $($install.ExitCode)."
    }

    Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
    $exe = Find-Node
    if (-not $exe) { throw "Node.js installed, but it could not be found. Close this window and run startArtnet.bat again." }
    return $exe
}

function Install-VcRedist {
    $arch = Get-OsArch
    $url = switch ($arch) {
        'Arm64' { 'https://aka.ms/vs/17/release/vc_redist.arm64.exe' }
        'X86' { 'https://aka.ms/vs/17/release/vc_redist.x86.exe' }
        default { 'https://aka.ms/vs/17/release/vc_redist.x64.exe' }
    }
    Write-Step "Installing a Microsoft library Python packages need..."
    $dest = Join-Path $env:TEMP 'artnet-vc_redist.exe'
    Save-Url -Url $url -Dest $dest
    $install = Start-Process -FilePath $dest -ArgumentList @('/install', '/quiet', '/norestart') -Wait -PassThru
    if ($install.ExitCode -ne 0 -and $install.ExitCode -ne 3010 -and $install.ExitCode -ne 1638) {
        throw "Microsoft library installer failed with code $($install.ExitCode)."
    }
    Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
}

function Install-PythonPackages([string]$PythonExe) {
    Write-Step "Installing Python packages (audio, math, and Art-Net). The first time can take a few minutes."
    $code = Invoke-Native -FilePath $PythonExe -ArgumentList @('-m', 'pip', '--version') -Quiet
    if ($code -ne 0) {
        $code = Invoke-Native -FilePath $PythonExe -ArgumentList @('-m', 'ensurepip', '--upgrade')
        if ($code -ne 0) { throw "pip is missing and could not be installed." }
    }

    $req = Join-Path $AppDir 'requirements.txt'
    $pipArgs = @('-m', 'pip', 'install', '--disable-pip-version-check', '--retries', '5', '--timeout', '60')
    if (Test-Path -LiteralPath $req) {
        $pipArgs += @('-r', $req)
    } else {
        $pipArgs += @('numpy', 'sounddevice', 'stupidartnet')
    }

    $code = Invoke-Native -FilePath $PythonExe -ArgumentList $pipArgs
    if ($code -ne 0) {
        Install-VcRedist
        $code = Invoke-Native -FilePath $PythonExe -ArgumentList $pipArgs
        if ($code -ne 0) {
            throw "Python packages did not install. Stay on Wi-Fi and run startArtnet.bat again."
        }
    }
}

function Install-NodePackages([string]$NodeExe) {
    $express = Join-Path $AppDir 'node_modules\express\package.json'
    if (Test-Path -LiteralPath $express) {
        Write-Step "Web control panel packages are already installed."
        return
    }

    Write-Step "Installing the web control panel packages..."
    $npm = Join-Path (Split-Path -Parent $NodeExe) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm)) { throw "npm was not found next to Node.js." }

    Push-Location -LiteralPath $AppDir
    try {
        $code = Invoke-Native -FilePath $npm -ArgumentList @('install', '--no-fund', '--no-audit')
        if ($code -ne 0) {
            throw "The web control panel packages did not install. Stay on Wi-Fi and run startArtnet.bat again."
        }
    } finally {
        Pop-Location
    }
}

function Update-SessionPath([string]$NodeExe) {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
    $nodeDir = Split-Path -Parent $NodeExe
    if ($env:Path -notlike "*$nodeDir*") {
        $env:Path = "$nodeDir;$env:Path"
    }
}

try {
    $scriptPath = Join-Path $AppDir 'audio_artnet.py'
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Could not find audio_artnet.py in $AppDir"
    }
    Set-Location -LiteralPath $AppDir

    Write-Step "Checking Python..."
    $pythonExe = Find-Python
    if ($pythonExe) {
        Write-Host "Python is ready."
    } else {
        $pythonExe = Install-Python
        Write-Host "Python is ready."
    }

    Write-Step "Checking Node.js..."
    $nodeExe = Find-Node
    if ($nodeExe) {
        Write-Host "Node.js is ready."
    } else {
        $nodeExe = Install-Node
        Write-Host "Node.js is ready."
    }

    Write-Step "Checking Python packages..."
    $importArgs = @('-c', 'import numpy, sounddevice, stupidArtnet')
    $code = Invoke-Native -FilePath $pythonExe -ArgumentList $importArgs -Quiet
    if ($code -ne 0) {
        Install-PythonPackages -PythonExe $pythonExe
        $code = Invoke-Native -FilePath $pythonExe -ArgumentList $importArgs -Quiet
        if ($code -ne 0) {
            throw "Python packages are still missing after installation."
        }
    }
    Write-Host "Python packages are ready."

    Install-NodePackages -NodeExe $nodeExe
    Update-SessionPath -NodeExe $nodeExe

    if ($SetupOnly) {
        Write-Step "Setup finished. The lights were not started."
        exit 0
    }

    Write-Step "Starting the lights. Your browser will open the control page."
    Write-Host "Leave this window open. Closing it stops the show."
    Write-Host ""

    $env:PYTHONUNBUFFERED = '1'
    $code = Invoke-Native -FilePath $pythonExe -ArgumentList @($scriptPath)
    exit $code
} catch {
    Write-Host ""
    Write-Host "Something went wrong:"
    Write-Host $_.Exception.Message
    exit 1
}
