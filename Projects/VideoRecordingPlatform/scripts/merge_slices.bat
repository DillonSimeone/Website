@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
call "%~dp0..\MergeSlices.bat" %*
exit /b %ERRORLEVEL%
