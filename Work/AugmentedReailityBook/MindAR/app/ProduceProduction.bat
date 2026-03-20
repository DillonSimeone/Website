@echo off
setlocal enabledelayedexpansion

:: ============================================================================
:: PRODUCTION BUILD & DEPLOY SCRIPT
:: ============================================================================
:: Usage: ProduceProduction.bat [TargetHTML]
:: Example: ProduceProduction.bat indexV4.html
::
:: This script minifies the app, gathers all "linkables" (images, models),
:: and overwrites the production folder while preserving .git
:: ============================================================================

:: --- CONFIGURATION ---
set "APP_DIR=%~dp0"
set "TARGET_REPO=F:\Github\AugmentedRealityBook"
set "SRC_ROOT=F:\Github\Website\Work\AugmentedReailityBook"

:: --- ARGUMENT HANDLING ---
set "TARGET_HTML=%~1"
if "!TARGET_HTML!"=="" (
    set "TARGET_HTML=indexV4.html"
    echo [INFO] No target HTML specified. Defaulting to !TARGET_HTML!.
)

echo ============================================================================
echo [1/5] RUNNING MINIFIER (Target: !TARGET_HTML!)...
echo ============================================================================
cd /d "!APP_DIR!"
:: Run the minifier with the target HTML argument
call npm run minify -- --target !TARGET_HTML!
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Minification failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================================
echo [2/5] SYNCING LINKABLES (From Local Assets)...
echo ============================================================================
:: 1. Copy local training images into assets/trainingImages
echo Copying training images...
if not exist "!APP_DIR!dist\assets\trainingImages" mkdir "!APP_DIR!dist\assets\trainingImages"
xcopy "!APP_DIR!assets\trainingImages\*" "!APP_DIR!dist\assets\trainingImages\" /y /s /e /q

:: 2. Copy local 3D models into assets/3dModel
echo Copying 3D models...
if not exist "!APP_DIR!dist\assets\3dModel" mkdir "!APP_DIR!dist\assets\3dModel"
xcopy "!APP_DIR!assets\3dModel\*" "!APP_DIR!dist\assets\3dModel\" /y /s /e /q

:: 3. Copy shaders and relocate tracking targets
echo Copying shaders...
if not exist "!APP_DIR!dist\assets\shaders" mkdir "!APP_DIR!dist\assets\shaders"
xcopy "!APP_DIR!assets\shaders\*" "!APP_DIR!dist\assets\shaders\" /y /s /e /q

echo Relocating tracking descriptors...
if exist "!APP_DIR!targets\" (
    if not exist "!APP_DIR!dist\assets\targets" mkdir "!APP_DIR!dist\assets\targets"
    xcopy "!APP_DIR!targets\*" "!APP_DIR!dist\assets\targets\" /y /s /e /q
) else if exist "!APP_DIR!assets\targets\" (
    if not exist "!APP_DIR!dist\assets\targets" mkdir "!APP_DIR!dist\assets\targets"
    xcopy "!APP_DIR!assets\targets\*" "!APP_DIR!dist\assets\targets\" /y /s /e /q
)

echo.
echo ============================================================================
echo [3/5] PREPARING PRODUCTION REPO (Clearing stale files)...
echo ============================================================================
if not exist "!TARGET_REPO!" (
    echo [ERROR] Target repository not found at !TARGET_REPO!
    pause
    exit /b 1
)

:: Use PowerShell to delete everything in the target repo EXCEPT the .git folder
echo Clearing !TARGET_REPO! (preserving .git)...
powershell -Command "Get-ChildItem -Path '!TARGET_REPO!' -Exclude .git | Remove-Item -Recurse -Force"

echo.
echo ============================================================================
echo [4/5] DEPLOYING MINIFIED ASSETS...
echo ============================================================================
:: Copy everything from dist to the production repo
xcopy "!APP_DIR!dist\*" "!TARGET_REPO!\" /y /s /e /h /c /i /q

echo.
echo ============================================================================
echo [5/5] SUCCESS!
echo ============================================================================
echo Production Build for !TARGET_HTML! is complete.
echo Location: !TARGET_REPO!
echo.
pause
