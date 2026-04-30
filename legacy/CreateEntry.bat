@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Portfolio Content Generator
echo ========================================
echo.
echo Select the section for the new entry:
echo 1. Laser
echo 2. 3D Printing
echo 3. Work
echo 4. Mini-Project
echo 5. ESP32
echo.

set /p choice="Enter choice (1-5): "

if "%choice%"=="1" (
    set section=laser
    set template=artwork
) else if "%choice%"=="2" (
    set section=3dprinting
    set template=artwork
) else if "%choice%"=="3" (
    set section=work
    set template=div
) else if "%choice%"=="4" (
    set section=mini-projects
    set template=grid-item
) else if "%choice%"=="5" (
    set section=esp32
    set template=grid-item
) else (
    echo Invalid choice.
    pause
    exit /b
)

set /p title="Enter the project title: "
set filename=!title: =_!
set filename=!filename:,=!
set filename=!filename:.=!
set filename=!filename:^(=!
set filename=!filename:^)=!
set filename=!filename:^&=!
set filename=!filename:^@=!
set filename=!filename:^#=!
set filename=!filename:^$=!
set filename=!filename:^%%=!
set filename=!filename:^*=!
set filename=!filename:^+=!
set filename=!filename:^/=!
set filename=!filename:^\=!
set filename=!filename:^?=!
set filename=!filename:^<=!
set filename=!filename:^>=!
set filename=!filename:^|=!
set filename=!filename:^:=!
set filename=!filename:^;=!
set filename=!filename:^'=!
set filename=!filename:^"=!

set filepath=src\content\%section%\!filename!.html

echo.
echo Creating entry: %filepath%

if "%template%"=="artwork" (
    (
    echo ^<div class="artwork"^>
    echo     ^<h2^>%title%^</h2^>
    echo     ^<p^>Description goes here...^</p^>
    echo     ^<div class="medias"^>
    echo         ^<div class="images"^>
    echo             ^<img loading="lazy" src="./path/to/image.webp" alt="%title%"^>
    echo         ^</div^>
    echo     ^</div^>
    echo ^</div^>
    ) > %filepath%
) else if "%template%"=="grid-item" (
    (
    echo ^<div class="grid-item"^>
    echo     ^<h2^>%title%^</h2^>
    echo     ^<p^>Description goes here...^</p^>
    echo     ^<ul^>
    echo         ^<li^>^<a href="./path/to/project/index.html"^>Project Link^</a^>^</li^>
    echo     ^</ul^>
    ^</div^>
    ) > %filepath%
) else (
    (
    echo ^<div^>
    echo     ^<h2^>%title%^</h2^>
    echo     ^<p^>Description goes here...^</p^>
    echo ^</div^>
    ) > %filepath%
)

echo.
echo [✔] Success! Your new entry has been created.
echo You can now edit %filepath% to add your content.
echo The Vite dev server will pick it up automatically.
echo.
pause
