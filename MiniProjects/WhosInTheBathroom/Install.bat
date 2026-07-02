@echo off
setlocal EnableExtensions

set "ERRMSG="
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "DLL_PATH=%BASE_DIR%\WhosInTheBathroomContextMenu.dll"
set "DLL_NEW_PATH=%BASE_DIR%\WhosInTheBathroomContextMenu.new.dll"
set "HELPER_PATH=%BASE_DIR%\WhosInTheBathroomHelper.exe"
set "BUILD_LOG=%TEMP%\WhosInTheBathroom_Install_%RANDOM%.log"
set "VSBT_EXE=%TEMP%\vs_BuildTools.exe"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    set "ERRMSG=ERROR: You must right-click and Run as Administrator!"
    goto :FAIL
)

if exist "%BASE_DIR%\ContextMenuExtension.cpp" goto :BUILD_BINARIES
if exist "%BASE_DIR%\HelperApp.cpp" goto :BUILD_BINARIES
if not exist "%DLL_PATH%" goto :FAIL_MISSING_BINARIES
if not exist "%HELPER_PATH%" goto :FAIL_MISSING_BINARIES
goto :PREPARE_REGISTER

:BUILD_BINARIES
echo.
echo ================================================
echo Build artifacts not found. Attempting local build...
echo Build log: %BUILD_LOG%
echo ================================================
echo.

call :ENSURE_MSVC
if not "%errorlevel%"=="0" (
    set "ERRMSG=ERROR: MSVC compiler (cl.exe) was not found after auto-install/bootstrap."
    goto :FAIL
)

pushd "%BASE_DIR%" >nul 2>&1
if not "%errorlevel%"=="0" (
    set "ERRMSG=ERROR: Failed to enter build directory."
    goto :FAIL
)

cl.exe /nologo /std:c++20 /EHsc /DUNICODE /D_UNICODE /LD ^
    ContextMenuExtension.cpp ^
    /link /OUT:"WhosInTheBathroomContextMenu.new.dll" /DEF:"Exports.def" ^
    shell32.lib ole32.lib advapi32.lib user32.lib >"%BUILD_LOG%" 2>&1
if not "%errorlevel%"=="0" (
    popd >nul 2>&1
    set "ERRMSG=ERROR: Failed to build WhosInTheBathroomContextMenu.dll."
    goto :FAIL
)

cl.exe /nologo /std:c++20 /EHsc /DUNICODE /D_UNICODE ^
    HelperApp.cpp ^
    /link /OUT:"WhosInTheBathroomHelper.exe" ^
    comctl32.lib shell32.lib advapi32.lib user32.lib gdi32.lib >>"%BUILD_LOG%" 2>&1
if not "%errorlevel%"=="0" (
    popd >nul 2>&1
    set "ERRMSG=ERROR: Failed to build WhosInTheBathroomHelper.exe."
    goto :FAIL
)

popd >nul 2>&1

if not exist "%DLL_NEW_PATH%" (
    set "ERRMSG=ERROR: Build completed but DLL output is missing."
    goto :FAIL
)
if not exist "%HELPER_PATH%" (
    set "ERRMSG=ERROR: Build completed but EXE output is missing."
    goto :FAIL
)

:PREPARE_REGISTER
regsvr32.exe /u /s "%DLL_PATH%" >nul 2>&1
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

if exist "%DLL_NEW_PATH%" (
    copy /y "%DLL_NEW_PATH%" "%DLL_PATH%" >nul
    if not "%errorlevel%"=="0" (
        set "ERRMSG=ERROR: Failed to replace WhosInTheBathroomContextMenu.dll."
        start explorer.exe
        goto :FAIL
    )
    del /f /q "%DLL_NEW_PATH%" >nul 2>&1
)

start explorer.exe >nul 2>&1

:REGISTER
regsvr32.exe /s "%DLL_PATH%"
if not "%errorlevel%"=="0" (
    set "ERRMSG=ERROR: Failed to register WhosInTheBathroomContextMenu.dll."
    goto :FAIL
)

reg add "HKLM\Software\WhosInTheBathroom" /v "HelperPath" /t REG_SZ /d "%HELPER_PATH%" /f >nul
if not "%errorlevel%"=="0" (
    set "ERRMSG=ERROR: Failed to write HKLM\Software\WhosInTheBathroom\HelperPath."
    goto :FAIL
)

echo.
echo ================================================
echo WhosInTheBathroom? installation complete.
echo Context menu handler is now active.
echo ================================================
echo.
pause
exit /b 0

:FAIL_MISSING_BINARIES
set "ERRMSG=ERROR: Missing binaries and no source files found for build."
goto :FAIL

:ENSURE_MSVC
where cl.exe >nul 2>&1
if "%errorlevel%"=="0" exit /b 0

call :TRY_DEV_ENV
where cl.exe >nul 2>&1
if "%errorlevel%"=="0" exit /b 0

echo.
echo ================================================
echo MSVC tools not found. Installing Build Tools...
echo ================================================
echo.

where winget.exe >nul 2>&1
if "%errorlevel%"=="0" (
    winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-package-agreements --accept-source-agreements >>"%BUILD_LOG%" 2>&1
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile '%VSBT_EXE%'; exit 0 } catch { exit 1 }" >>"%BUILD_LOG%" 2>&1
    if exist "%VSBT_EXE%" (
        "%VSBT_EXE%" --quiet --wait --norestart --nocache --installPath "C:\BuildTools" --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --includeRecommended >>"%BUILD_LOG%" 2>&1
    )
)

call :TRY_DEV_ENV
where cl.exe >nul 2>&1
if "%errorlevel%"=="0" exit /b 0
exit /b 1

:TRY_DEV_ENV
if exist "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    echo [MSVC] Using vcvars64 from C:\BuildTools
    call "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)
where cl.exe >nul 2>&1
if "%errorlevel%"=="0" exit /b 0

if exist "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    echo [MSVC] Using vcvars64 from VS 2022 BuildTools
    call "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)
where cl.exe >nul 2>&1
if "%errorlevel%"=="0" exit /b 0

if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    echo [MSVC] Using vcvars64 from VS 2019 BuildTools
    call "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)
where cl.exe >nul 2>&1
if "%errorlevel%"=="0" exit /b 0
exit /b 0

:FAIL
echo.
echo ================================================
echo %ERRMSG%
echo Build log: %BUILD_LOG%
echo ================================================
echo.
pause
exit /b 1
