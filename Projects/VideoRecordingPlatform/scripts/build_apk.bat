@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo JDK 21 was not found at %JAVA_HOME%
  echo Install it with: winget install Microsoft.OpenJDK.21
  exit /b 1
)

if not exist "%ANDROID_HOME%\platforms" (
  echo Android SDK was not found at %ANDROID_HOME%
  echo Run scripts\setup_android_sdk.bat once, then build again.
  exit /b 1
)

echo Syncing the phone app from the current hub pages...
pushd mobile
call npm run sync
if errorlevel 1 (
  popd
  exit /b 1
)

echo Building the debug APK...
pushd android
call gradlew.bat assembleDebug
set "BUILD_CODE=%ERRORLEVEL%"
popd
if not "%BUILD_CODE%"=="0" (
  popd
  exit /b %BUILD_CODE%
)

node sync-www.js
popd

echo.
echo APK ready: downloads\MYT-Capture.apk
echo Restart the hub, then use the QR screen Android App button.
exit /b 0
