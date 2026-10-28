@echo off
title Multi-Page Lighthouse & Color Contrast Auditor
cd /d "%~dp0"

echo ====================================================
echo   Running Lighthouse Multi-Page Audit Suite         
echo ====================================================
echo.

node tools\lighthouse\audit-pages.js %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Lighthouse audit execution failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [COMPLETE] Full audit results and color contrast reports are ready!
pause
