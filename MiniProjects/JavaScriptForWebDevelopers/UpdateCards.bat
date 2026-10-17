@echo off
setlocal
echo =======================================================
echo   Scanning JavaScriptForWebDevelopers Project Cards
echo =======================================================
echo.

node "%~dp0generate_cards.js"

echo.
echo Done! Open index.html to view your updated cards.
pause
