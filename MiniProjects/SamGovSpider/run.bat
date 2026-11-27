@echo off
echo ==================================================
echo         Running SamGovSpider Crawler
echo ==================================================
echo checking python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

echo python found. starting scraper scripts...
echo [1/2] Running Directory Crawler...
python "%~dp0sam_gov_spider.py"
echo.
echo [2/2] Running Daily CSV Downloader & Extractor...
python "%~dp0download_datagov.py"
echo.
echo ==================================================
echo         All scraper scripts finished.
echo ==================================================
pause
