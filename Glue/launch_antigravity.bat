@echo off
:: Run the python history synchronizer
python "f:\Github\Website\public\Glue\register_all_convs.py"

:: Launch the Antigravity IDE with the workspace folder
start "" "C:\Users\DoctorNightmares\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "%~1"
