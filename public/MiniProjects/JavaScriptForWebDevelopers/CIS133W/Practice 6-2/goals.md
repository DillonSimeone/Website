Practice 6-2 Instructions: Image Carousel 2.0
Objective

Create an enhanced image carousel that cycles through images using left and right buttons, similar to the app in Exercise 6-3. You’ll write most of the code yourself, using the previous carousel as a model, but with some new challenges. Due to the use of fade transitions, the final product may appear more like a slideshow – one image at a time – than the carousel in Exercise 6-3.

Files Provided

    index.html: minimal structure with placeholders
    carousel.css: contains the default styling animation which you can change
    carousel.js: a basic scaffold with DOMContentLoaded event and TODOs

Click to download practice_6_2_student_files.zip
What You’ll Do

    Environment Setup
        Download the practice_6_2_student_files.zip to the CIS133W root folder in VS Code.
        Unzip it to create a practice_6_2_image_carousel_2 folder.
    Write your own JavaScript logic in carousel.js:
        Reuse logic from Exercise 6-3 if helpful, but don’t copy and paste without understanding it.
        You must code your own image rotation using arrays and event listeners. 
    Use your own images 
        Include at least 4 images of your choice. (Don’t reuse those from the textbook.)
        Images should be of similar size and proportions (e.g., all 600×400) for smooth transitions.
        Save them in an images/ folder and reference them relatively.
    Add a CSS transition or animation
        Apply a smooth transition effect (e.g., fade, slide, scale) when images change.
        This demonstrates how CSS and JavaScript work together for UI effects.
        This is not covered in the textbook – see Fade Effect in the Tips below for an explanation.
    Include header comments in the .js file with your name and date.

Tips

    Refer to Image Carousel, Exercise 6-3, in the textbook as a model.
    Fade Effect
        For the CSS part of the fade effect, you can use the following style to create a simple fade transition on image updates (this style is currently in the carousel.css file):

img {
    transition: opacity 0.5s ease-in-out;
}

img.fade-out {
    opacity: 0;
}

        For the JavaScript part of the fade effect, add the fade-out class before swapping the image, then remove it after a brief delay:

img.classList.add("fade-out");
setTimeout(() => {
    img.src = newImageSrc;
    img.classList.remove("fade-out");
}, 300);

        This effect makes the image fade out and back in when changed.

Deliverables

Students should submit:

    A working carousel/slideshow with left/right navigation
    A working transition or animation effect
    JavaScript file with custom logic and event handling
    At least 4 properly sized images

