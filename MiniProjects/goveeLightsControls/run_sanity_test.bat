@echo off
cd /d "%~dp0"
echo Running Govee Lights Sanity Test...
venv\Scripts\python.exe sanityTest.py
echo.
echo Test Complete.
pause
