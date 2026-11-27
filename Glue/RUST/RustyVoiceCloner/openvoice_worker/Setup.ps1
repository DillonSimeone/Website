$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

Write-Host "=== RustyVoiceCloner: OpenVoice v2 Sidecar Setup ===" -ForegroundColor Cyan

# 1. Ensure uv is available
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "Installing uv (fast Python & venv manager)..." -ForegroundColor Yellow
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    $env:Path = "$env:USERPROFILE\.local\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
}

# 2. Create isolated Python 3.11 venv (leaves system Python 3.14 untouched)
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creating Python 3.11 virtual environment..." -ForegroundColor Yellow
    uv venv --python 3.11 .venv
}

$Py = Join-Path $Here ".venv\Scripts\python.exe"

# 3. Install PyTorch with CUDA 12.4
Write-Host "Installing PyTorch (CUDA 12.4)..." -ForegroundColor Yellow
uv pip install --python $Py torch torchaudio --index-url https://download.pytorch.org/whl/cu124

# 4. Install OpenVoice v2 + minimal runtime deps
Write-Host "Installing OpenVoice v2..." -ForegroundColor Yellow
uv pip install --python $Py "git+https://github.com/myshell-ai/OpenVoice.git" --no-deps
uv pip install --python $Py librosa scipy numpy soundfile pydub wavmark inflect unidecode eng_to_ipa pypinyin cn2an jieba huggingface_hub

# 5. Download OpenVoice v2 converter checkpoints if missing
$ConverterDir = Join-Path $Here "checkpoints_v2\converter"
if (-not (Test-Path (Join-Path $ConverterDir "checkpoint.pth"))) {
    Write-Host "Downloading OpenVoice v2 converter checkpoints from HuggingFace..." -ForegroundColor Yellow
    & $Py -c "from huggingface_hub import hf_hub_download; hf_hub_download('myshell-ai/OpenVoiceV2', 'converter/config.json', local_dir='checkpoints_v2'); hf_hub_download('myshell-ai/OpenVoiceV2', 'converter/checkpoint.pth', local_dir='checkpoints_v2')"
}

Write-Host "Verifying OpenVoice worker..." -ForegroundColor Yellow
& $Py -c "import torch; from openvoice.api import ToneColorConverter; print('CUDA available:', torch.cuda.is_available())"
Write-Host "Setup complete!" -ForegroundColor Green
