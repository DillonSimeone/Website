@echo off
cd /d "%~dp0"

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing requirements...
pip install -r requirements.txt
:: Install pywebview without dependencies to avoid pythonnet on Windows (which fails on Py 3.14)
pip install pywebview --no-deps

echo Starting Application...
python app.py
pause