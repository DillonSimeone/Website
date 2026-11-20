@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo Installing JDK 21...
  winget install --id Microsoft.OpenJDK.21 -e --accept-package-agreements --accept-source-agreements --disable-interactivity
)

set "CMDDIR=%ANDROID_HOME%\cmdline-tools\latest"
if not exist "%CMDDIR%\bin\sdkmanager.bat" (
  echo Downloading Android command-line tools...
  set "ZIP=%TEMP%\android-cmdline-tools.zip"
  curl.exe -L "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip" -o "!ZIP!"
  if errorlevel 1 exit /b 1
  mkdir "%ANDROID_HOME%\cmdline-tools" 2>nul
  tar -xf "!ZIP!" -C "%ANDROID_HOME%\cmdline-tools"
  if exist "%ANDROID_HOME%\cmdline-tools\cmdline-tools" (
    ren "%ANDROID_HOME%\cmdline-tools\cmdline-tools" latest
  )
)

echo Installing Android SDK packages...
(echo y& echo y& echo y& echo y& echo y& echo y& echo y& echo y) | "%CMDDIR%\bin\sdkmanager.bat" --sdk_root="%ANDROID_HOME%" "platforms;android-35" "build-tools;35.0.0" "platform-tools"
exit /b %ERRORLEVEL%
