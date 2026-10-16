@echo off
echo ==========================================
echo    Govee Tray Controller - Builder
echo ==========================================

REM Check if py or python is available
where py >nul 2>&1
if %errorlevel% equ 0 (
    set PY_CMD=py
) else (
    set PY_CMD=python
)

echo.
echo Ensuring GoveeTrayControl is not running...
taskkill /IM "GoveeTrayControl.exe" /F 2>nul
timeout /t 1 /nobreak >nul

echo.
echo Generating application icon...
%PY_CMD% -c "from PIL import Image, ImageDraw; img = Image.new('RGBA', (256, 256), (0, 0, 0, 0)); d = ImageDraw.Draw(img); d.ellipse((16, 16, 240, 240), fill=(255, 215, 0, 50)); d.ellipse((56, 40, 200, 176), fill=(255, 210, 40)); d.polygon([(80, 144), (176, 144), (156, 196), (100, 196)], fill=(255, 210, 40)); d.rectangle((104, 196, 152, 216), fill=(190, 190, 200)); d.arc((104, 208, 152, 232), start=0, end=180, fill=(190, 190, 200), width=8); img.save('bulb.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])"

echo.
echo Building Standalone Windowed Tray Executable...
echo (No console window, runs silently in system tray)
echo.

%PY_CMD% -m PyInstaller --noconfirm --onefile --windowed --name "GoveeTrayControl" --icon="bulb.ico" --add-data "bulb.ico;." tray_app.py

if %errorlevel% neq 0 (
    echo.
    echo BUILD FAILED!
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo          Build Successful!
echo ==========================================
echo.
echo Executable created: dist\GoveeTrayControl.exe
echo.
pause
