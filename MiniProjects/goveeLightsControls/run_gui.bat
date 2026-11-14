@echo off
call venv\Scripts\activate.bat 2>NUL
if errorlevel 1 (
    echo Virtual environment not found or failed to activate. Using system python.
)
python server.py
pause
