@echo off
setlocal
echo ========================================================
echo        Portfolio Website Dead Link Spider Auditor
echo ========================================================
echo.

set "ARG1=%~1"

:: If user passed flags directly (e.g. deadlinksearch.bat --external or --open), pass through directly
if not "%ARG1%"=="" (
    if "%ARG1:~0,2%"=="--" (
        node "%~dp0tools\deadlink-search\crawler.js" %*
        goto :DONE
    )
    if "%ARG1:~0,4%"=="http" (
        node "%~dp0tools\deadlink-search\crawler.js" %*
        goto :DONE
    )
)

echo Choose a scan mode:
echo   1. Active Portfolio Spider (Fast internal scan of homepage, projects, assets ^& anchors)
echo   2. Full Audit (Internal scan + External web links verification)
echo   3. Deep Audit (Active site + All 500+ standalone legacy/college public HTML files)
echo   4. Custom Target URL or Port
echo.
set /p CHOICE="Select [1-4, default 1]: "

set "FLAGS=--open"

if "%CHOICE%"=="2" (
    set "FLAGS=--external --open"
) else if "%CHOICE%"=="3" (
    set "FLAGS=--all-public --open"
) else if "%CHOICE%"=="4" (
    echo.
    set /p CUSTOM_URL="Enter Target URL (e.g. http://localhost:5173): "
    if not "%CUSTOM_URL%"=="" set "FLAGS=%CUSTOM_URL% --open"
)

echo.
node "%~dp0tools\deadlink-search\crawler.js" %FLAGS%

:DONE
echo.
pause

