@echo off
echo ============================================
echo [AR BOOK] REGENERATING IMAGE TARGETS
echo ============================================
echo.
echo Scanning /trainingImages...
echo.

python compiler/rebuild.py

echo.
echo DONE!
echo If the browser window opened and closed, your targets are ready.
echo.
pause
