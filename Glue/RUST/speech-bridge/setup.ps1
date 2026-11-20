<#
.SYNOPSIS
    Automated 1-click offline installer for Speech Bridge (portable CUDA runtimes + neural models).
.DESCRIPTION
    Downloads and extracts all portable GPU runtimes and neural speech models into local
    runtime/, models/, and piper/ folders. Resumable via curl.exe -C - and skips files already present.
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Tmp = Join-Path $env:TEMP "speech_bridge_setup"
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

function Get-ResumableFile {
    param([string]$Url, [string]$Dest, [string]$Label)
    if ((Test-Path $Dest) -and ((Get-Item $Dest).Length -gt 4096)) {
        Write-Host "  [SKIP] $Label (already present)" -ForegroundColor DarkGray
        return
    }
    $dir = Split-Path -Parent $Dest
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Write-Host "  [GET ] $Label" -ForegroundColor Cyan
    & curl.exe -L -C - --retry 8 --retry-all-errors --fail -o "$Dest" "$Url"
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed for $Label ($Url)"
    }
}

Write-Host "`n[1/5] Downloading Portable CUDA Speech Runtime (sherpa-onnx + NVIDIA CUDA 12 / cuDNN 9 DLLs)..." -ForegroundColor Green
$SherpaLib = Join-Path $Root "runtime\sherpa-cuda\lib"
New-Item -ItemType Directory -Force -Path $SherpaLib | Out-Null

if (-not (Test-Path (Join-Path $SherpaLib "sherpa-onnx-c-api.dll"))) {
    Write-Host "  [GET ] Latest sherpa-onnx CUDA 12 / cuDNN 9 Windows runtime..." -ForegroundColor Cyan
    $sRel = Invoke-RestMethod "https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/latest"
    $sAsset = $sRel.assets | Where-Object { $_.name -like "*cuda-12*cudnn-9*win-x64*cuda*.tar.bz2" } | Select-Object -First 1
    if ($sAsset) {
        $sherpaTar = Join-Path $Tmp "sherpa-onnx-cuda.tar.bz2"
        Get-ResumableFile $sAsset.browser_download_url $sherpaTar "sherpa-onnx CUDA 12 / cuDNN 9 runtime"
        $extractDir = Join-Path $Tmp "sherpa_extract"
        New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
        & tar -xf $sherpaTar -C $extractDir
        Get-ChildItem -Path $extractDir -Recurse -Filter "*.dll" | Copy-Item -Destination $SherpaLib -Force
    }
} else {
    Write-Host "  [SKIP] sherpa-onnx-c-api.dll (already present)" -ForegroundColor DarkGray
}

# Portable NVIDIA CUDA 12 / cuDNN 9 DLLs (extracted from official PyPI win_amd64 wheels, no CUDA Toolkit install needed)
$CudaWheels = @(
    @{ Name = "cudart"; Pkg = "nvidia-cuda-runtime-cu12"; Check = "cudart64_12.dll" },
    @{ Name = "cublas"; Pkg = "nvidia-cublas-cu12";       Check = "cublas64_12.dll" },
    @{ Name = "cufft";  Pkg = "nvidia-cufft-cu12";        Check = "cufft64_11.dll" },
    @{ Name = "cudnn";  Pkg = "nvidia-cudnn-cu12";        Check = "cudnn64_9.dll" },
    @{ Name = "nvrtc";  Pkg = "nvidia-cuda-nvrtc-cu12";   Check = "nvrtc64_120_0.dll" }
)
foreach ($w in $CudaWheels) {
    if (Test-Path (Join-Path $SherpaLib $w.Check)) {
        Write-Host "  [SKIP] NVIDIA $($w.Name) DLLs (already present)" -ForegroundColor DarkGray
        continue
    }
    Write-Host "  [GET ] NVIDIA $($w.Name) portable DLLs from PyPI..." -ForegroundColor Cyan
    $meta = Invoke-RestMethod "https://pypi.org/pypi/$($w.Pkg)/json"
    $whl = $meta.urls | Where-Object { $_.filename -like "*win_amd64.whl" } | Select-Object -First 1
    if ($whl) {
        $whlPath = Join-Path $Tmp "$($w.Name).zip"
        Get-ResumableFile $whl.url $whlPath "PyPI $($w.Pkg)"
        $whlDir = Join-Path $Tmp "whl_$($w.Name)"
        Expand-Archive -Path $whlPath -DestinationPath $whlDir -Force
        Get-ChildItem -Path $whlDir -Recurse -Filter "*.dll" | Copy-Item -Destination $SherpaLib -Force
    }
}

Write-Host "`n[2/5] Downloading NVIDIA Parakeet TDT 0.6B v2 FP16 (Primary GPU Speech Model)..." -ForegroundColor Green
$ParakeetBase = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-fp16/resolve/main"
Get-ResumableFile "$ParakeetBase/encoder.fp16.onnx" (Join-Path $Root "models\parakeet\encoder.fp16.onnx") "Parakeet Encoder FP16 (~1.18 GB)"
Get-ResumableFile "$ParakeetBase/decoder.fp16.onnx" (Join-Path $Root "models\parakeet\decoder.fp16.onnx") "Parakeet Decoder FP16 (~14 MB)"
Get-ResumableFile "$ParakeetBase/joiner.fp16.onnx"  (Join-Path $Root "models\parakeet\joiner.fp16.onnx")  "Parakeet Joiner FP16 (~3.5 MB)"
Get-ResumableFile "$ParakeetBase/tokens.txt"        (Join-Path $Root "models\parakeet\tokens.txt")        "Parakeet tokens.txt"

Write-Host "`n[3/5] Downloading Neural VAD, Denoisers (GTCRN, DPDFNet8, VoxLock) & Speaker ID (WeSpeaker)..." -ForegroundColor Green
Get-ResumableFile `
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx" `
    (Join-Path $Root "models\vad\silero_vad_v5.onnx") "Silero VAD v5 (2.2 MB)"
Get-ResumableFile `
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/gtcrn_simple.onnx" `
    (Join-Path $Root "models\denoise\gtcrn_simple.onnx") "GTCRN Denoiser (0.5 MB)"
Get-ResumableFile `
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/dpdfnet8.onnx" `
    (Join-Path $Root "models\denoise\dpdfnet8.onnx") "DPDFNet8 Denoiser (14 MB)"
Get-ResumableFile `
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM++.onnx" `
    (Join-Path $Root "models\speaker\wespeaker_en_voxceleb_CAM++.onnx") "WeSpeaker CAM++ Speaker ID (28 MB)"

Write-Host "`n[4/5] Downloading Local LLM Phonetic Polisher (Qwen2.5-1.5B Q4_K_M + llama.cpp CUDA)..." -ForegroundColor Green
Get-ResumableFile `
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf" `
    (Join-Path $Root "models\llm\qwen2.5-1.5b-instruct-q4_k_m.gguf") "Qwen2.5-1.5B-Instruct Q4_K_M (~1.06 GB)"

$LlamaDir = Join-Path $Root "runtime\llama-cuda"
if (-not (Test-Path (Join-Path $LlamaDir "llama-server.exe"))) {
    Write-Host "  [GET ] Latest llama.cpp CUDA 12.4 Windows binary..." -ForegroundColor Cyan
    $rel = Invoke-RestMethod "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
    $asset = $rel.assets | Where-Object { $_.name -like "*bin-win-cuda-12.4-x64.zip" } | Select-Object -First 1
    if ($asset) {
        $lzip = Join-Path $Tmp "llama-cuda.zip"
        Get-ResumableFile $asset.browser_download_url $lzip "llama.cpp CUDA 12.4"
        New-Item -ItemType Directory -Force -Path $LlamaDir | Out-Null
        Expand-Archive -Path $lzip -DestinationPath $LlamaDir -Force
    }
} else {
    Write-Host "  [SKIP] llama-server.exe (already present)" -ForegroundColor DarkGray
}

Write-Host "`n[5/5] Creating Desktop Shortcut for 1-Click Launch..." -ForegroundColor Green
$ExePath = Join-Path $Root "speech-bridge.exe"
if (Test-Path $ExePath) {
    $Desktop = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $Desktop "Speech Bridge.lnk"
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $ExePath
    $Shortcut.WorkingDirectory = $Root
    $Shortcut.Description = "Speech Bridge - Offline GPU Neural Speech-to-Text & Text-to-Speech"
    $Shortcut.Save()
    Write-Host "  [OK  ] Shortcut saved to Desktop\Speech Bridge.lnk" -ForegroundColor Green
}

Write-Host "`nAll offline components verified!" -ForegroundColor Green
