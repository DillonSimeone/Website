@echo off
cd /d "%~dp0"

if not exist venv (
    echo Virtual environment not found. Please run run_gui.bat first to set up the environment.
    pause
    exit /b
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing PyInstaller...
pip install pyinstaller

echo Building Standalone Executable...
:: --hidden-import=webview.platforms.qt: FORCE PyInstaller to include the Qt backend
:: --hidden-import=PyQt6: Ensure PyQt6 is included
:: --hidden-import=PyQt6.QtWebEngineWidgets: Explicitly include QtWebEngine
:: --hidden-import=PyQt6.QtWebEngineCore: Explicitly include QtWebEngineCore
pyinstaller --noconsole --onefile --add-data "web;web" --hidden-import=webview.platforms.qt --hidden-import=PyQt6 --hidden-import=PyQt6.QtWebEngineWidgets --hidden-import=PyQt6.QtWebEngineCore --name "OSC_Monitor" app.py

echo.
echo Build Complete!
echo You can find your app in the "dist" folder.
pause
