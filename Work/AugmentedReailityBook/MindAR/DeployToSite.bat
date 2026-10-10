@echo off
setlocal
set "SOURCE_DIR=%~dp0dist"
set "DEST_DIR=F:\Github\AugmentedRealityBook"

echo ============================================================
echo [1/3] RUNNING PRODUCTION BUILD (ELEVENTY + ESBUILD)
echo ============================================================
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed! Aborting deployment.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================
echo [2/3] CLEANING DEPLOYMENT DIRECTORY (KEEPING .GIT)
echo Target: %DEST_DIR%
echo ============================================================

:: Brute force removal of any existing milestones folder in the destination
if exist "%DEST_DIR%\milestones" (
    echo [INFO] Removing legacy milestones folder...
    rmdir /s /q "%DEST_DIR%\milestones"
)

:: Use PowerShell to clean up ALL other non-git items to ensure a fresh mirror
powershell -Command "Get-ChildItem -Path '%DEST_DIR%' | Where-Object { \$_.Name -ne '.git' } | Remove-Item -Recurse -Force" 2>nul

echo.
echo ============================================================
echo [3/3] COPYING NEW BUILD TO %DEST_DIR%
echo Exclude: .map files
echo ============================================================

:: Create a temporary exclusion file
echo .map > xcopy_exclude.txt

:: Use XCOPY to copy all files from dist to the destination, excluding maps.
xcopy "%SOURCE_DIR%\*" "%DEST_DIR%\" /s /e /y /h /exclude:xcopy_exclude.txt >nul

:: Cleanup
del xcopy_exclude.txt

echo.
echo ============================================================
echo DEPLOYMENT SUCCESSFUL!
echo Your Netlify repository is now updated with the latest dist.
echo ============================================================

pause
