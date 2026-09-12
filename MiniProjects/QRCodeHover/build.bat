@echo off
cd /d "%~dp0"
echo Building Firefox extension...
call npm run build
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Built: web-ext-artifacts\asset_to_qr_code_panel-1.0.1.zip
    echo Load temporarily in Firefox: about:debugging ^> Load Temporary Add-on ^> manifest.json
)
pause
