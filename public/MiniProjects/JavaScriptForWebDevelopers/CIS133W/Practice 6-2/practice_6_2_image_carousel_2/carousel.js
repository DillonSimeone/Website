// Name: Dillon Simeone
// Date: October 27, 2026
"use strict";

// TODO: Create an array of image filenames (e.g., image1.jpg, image2.jpg, etc.)
const images = [
    "images/image1.jpg",
    "images/image2.jpg",
    "images/image3.jpg",
    "images/image4.jpg"
];
let currentIndex = 0;

// TODO: Get references to DOM elements: the image and the two buttons
let carouselImage;
let previousBtn;
let nextBtn;

// TODO: Add event listeners for the buttons to cycle images forward and backward
const nextImage = () => {
    currentIndex = (currentIndex + 1) % images.length;
    changeImage(images[currentIndex]);
};

const prevImage = () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    changeImage(images[currentIndex]);
};

// TODO: Add fade-out class before image changes, then remove it after timeout
const changeImage = (newImageSrc) => {
    carouselImage.classList.add("fade-out");
    setTimeout(() => {
        carouselImage.src = newImageSrc;
        carouselImage.classList.remove("fade-out");
    }, 300);
};

document.addEventListener("DOMContentLoaded", () => {
    // Code here
    carouselImage = document.querySelector("#carousel_image");
    previousBtn = document.querySelector("#previous");
    nextBtn = document.querySelector("#next");

    previousBtn.addEventListener("click", prevImage);
    nextBtn.addEventListener("click", nextImage);
});
