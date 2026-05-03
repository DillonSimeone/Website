@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Portfolio Content Generator (Modular)
echo ========================================
echo.
echo Select Section:
echo 1. Laser (Hobby)
echo 2. 3D Printing (Hobby)
echo 3. Work (Professional)
echo 4. Mini-Projects
echo 5. ESP32 (Embedded)
echo 6. Shop
echo.

set /p mychoice="Enter choice (1-6): "

if "!mychoice!"=="1" ( set "sect=laser" & set "temp=hobby" )
if "!mychoice!"=="2" ( set "sect=3dprinting" & set "temp=hobby" )
if "!mychoice!"=="3" ( set "sect=work" & set "temp=work" )
if "!mychoice!"=="4" ( set "sect=mini-projects" & set "temp=grid" )
if "!mychoice!"=="5" ( set "sect=esp32" & set "temp=grid" )
if "!mychoice!"=="6" ( set "sect=shop" & set "temp=shop" )

if "!sect!"=="" (
    echo Error: Invalid selection.
    pause
    exit /b
)

set /p mytitle="Enter Project Title: "
if "!mytitle!"=="" (
    echo Error: Title cannot be empty.
    pause
    exit /b
)

set "myfile=!mytitle: =_!"
set "myfile=!myfile:,=!"
set "myfile=!myfile:.=!"
set "myfile=!myfile:(=!"
set "myfile=!myfile:)=!"
set "mypath=src\content\!sect!\!myfile!.html"

echo Creating modular entry: !mypath!

if "!temp!"=="hobby" (
    echo ^<div class="artwork"^> > "!mypath!"
    echo     ^<h2^>!mytitle!^</h2^> >> "!mypath!"
    echo     ^<p^>Description goes here...^</p^> >> "!mypath!"
    echo     ^<div class="medias"^> >> "!mypath!"
    echo         ^<div class="images"^> >> "!mypath!"
    echo             ^<img loading="lazy" data-src="./path/to/image.webp" alt="!mytitle!"^> >> "!mypath!"
    echo         ^</div^> >> "!mypath!"
    echo     ^</div^> >> "!mypath!"
    echo ^</div^> >> "!mypath!"
) else if "!temp!"=="grid" (
    echo ^<div class="grid-item"^> > "!mypath!"
    echo     ^<h2^>!mytitle!^</h2^> >> "!mypath!"
    echo     ^<p^>Summary goes here...^</p^> >> "!mypath!"
    echo     ^<ul^> >> "!mypath!"
    echo         ^<li^>^<a href="./path/to/project/index.html"^>Launch^</a^>^</li^> >> "!mypath!"
    echo     ^</ul^> >> "!mypath!"
    echo ^</div^> >> "!mypath!"
) else if "!temp!"=="shop" (
    echo ^<div class="grid-item"^> > "!mypath!"
    echo     ^<h2^>!mytitle!^</h2^> >> "!mypath!"
    echo     ^<p^>Product description goes here...^</p^> >> "!mypath!"
    echo     ^<div class="medias"^> >> "!mypath!"
    echo         ^<div class="images"^> >> "!mypath!"
    echo             ^<img loading="lazy" data-src="./path/to/product-image.webp" alt="!mytitle!"^> >> "!mypath!"
    echo         ^</div^> >> "!mypath!"
    echo     ^</div^> >> "!mypath!"
    echo     ^<div class="shop-actions" style="margin-top: 20px; text-align: center;"^> >> "!mypath!"
    echo         ^<a href="https://buy.stripe.com/..." class="buy-button" target="_blank" style="display: inline-block; padding: 12px 30px; background: var(--neon-cyan); color: #000; text-decoration: none; font-family: 'Orbitron', sans-serif; font-weight: bold; border-radius: 4px; box-shadow: 0 0 15px var(--neon-cyan); transition: all 0.3s;"^>BUY NOW^</a^> >> "!mypath!"
    echo     ^</div^> >> "!mypath!"
    echo ^</div^> >> "!mypath!"
) else (
    echo ^<div^> > "!mypath!"
    echo     ^<h2^>!mytitle!^</h2^> >> "!mypath!"
    echo     ^<p^>Professional description...^</p^> >> "!mypath!"
    echo     ^<div class="medias"^> >> "!mypath!"
    echo         ^<div class="images"^> >> "!mypath!"
    echo             ^<img loading="lazy" data-src="./path/to/image.webp" alt="!mytitle!"^> >> "!mypath!"
    echo         ^</div^> >> "!mypath!"
    echo     ^</div^> >> "!mypath!"
    echo ^</div^> >> "!mypath!"
)

echo.
echo [✔] Success! Created !mypath!
echo.
pause
