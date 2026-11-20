"use strict";

let currentIndex = 0;
let carouselTrack;
let prevButton;
let nextButton;

const ITEM_WIDTH = 200;
const VISIBLE_COUNT = 4;

function getMaxIndex() {
  const items = carouselTrack ? carouselTrack.querySelectorAll(".carouselItem") : [];
  return Math.max(0, items.length - VISIBLE_COUNT);
}

function updateCarousel() {
  const maxIndex = getMaxIndex();

  if (currentIndex < 0) {
    currentIndex = 0;
  }
  if (currentIndex > maxIndex) {
    currentIndex = maxIndex;
  }

  const offset = -currentIndex * ITEM_WIDTH;
  carouselTrack.style.transform = `translateX(${offset}px)`;

  if (prevButton) {
    prevButton.disabled = currentIndex <= 0;
  }
  if (nextButton) {
    nextButton.disabled = currentIndex >= maxIndex;
  }
}

function handleNext() {
  const maxIndex = getMaxIndex();
  currentIndex++;
  if (currentIndex > maxIndex) {
    currentIndex = maxIndex;
  }
  updateCarousel();
}

function handlePrev() {
  currentIndex--;
  if (currentIndex < 0) {
    currentIndex = 0;
  }
  updateCarousel();
}

function createCarouselItem(onion) {
  const itemDiv = document.createElement("div");
  itemDiv.classList.add("carouselItem");

  itemDiv.innerHTML = `
    <a class="onion-card carouselCard" href="${onion.projectUrl}" title="${onion.name}">
      <div class="carouselThumbWrapper">
        <img class="carouselThumb onion-thumb" src="${onion.thumbnailUrl}" alt="${onion.name}">
      </div>
      <div class="carouselItemTitle">${onion.name}</div>
      <p class="carouselItemDesc">${onion.description || ""}</p>
    </a>
  `;

  return itemDiv;
}

function appendToCarousel(onion) {
  if (!carouselTrack) return;
  const newItem = createCarouselItem(onion);
  carouselTrack.appendChild(newItem);
  updateCarousel();
}

document.addEventListener("DOMContentLoaded", () => {
  carouselTrack = document.querySelector(".carouselTrack");
  prevButton = document.querySelector("#prevButton");
  nextButton = document.querySelector("#nextButton");

  if (!carouselTrack) return;

  if (typeof onions !== "undefined" && Array.isArray(onions)) {
    onions.forEach((onion) => {
      const itemElement = createCarouselItem(onion);
      carouselTrack.appendChild(itemElement);
    });
  }

  if (prevButton) {
    prevButton.addEventListener("click", handlePrev);
  }
  if (nextButton) {
    nextButton.addEventListener("click", handleNext);
  }

  updateCarousel();
});

window.appendToCarousel = appendToCarousel;
