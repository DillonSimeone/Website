"use strict";

let currentIndex = 0;
let track;
let prevButton;
let nextButton;

let idleTimer = null;
let attractInterval = null;

const ITEM_WIDTH = 200;

function updateCarousel() {
  const offset = -currentIndex * ITEM_WIDTH;
  track.style.transform = `translateX(${offset}px)`;
}

function jumpAndSlide(direction) {
  track.style.transition = "none";
  updateCarousel();
  setTimeout(() => {
    track.style.transition = "transform 0.5s ease";
    currentIndex += direction;
    updateCarousel();
  }, 0);
}

function transition(direction) {
  if (currentIndex === onions.length && direction === 1) {
    currentIndex = 0;
    jumpAndSlide(direction);
  } else if (currentIndex === 0 && direction === -1) {
    currentIndex = onions.length;
    jumpAndSlide(direction);
  } else {
    currentIndex += direction;
    updateCarousel();
  }
}

function showNextItem() {
  transition(1);
}

function showPrevItem() {
  transition(-1);
}

function startAttractMode() {
  if (!attractInterval) {
    attractInterval = setInterval(showNextItem, 1000);
  }
}

function stopAttractMode() {
  if (attractInterval) {
    clearInterval(attractInterval);
    attractInterval = null;
  }
}

function resetIdleTimer() {
  stopAttractMode();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(startAttractMode, 1000);
}

function formatDate(dateStr) {
  const date = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function createCarouselItem(onion) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "carouselItem";

  itemDiv.innerHTML = `
    <a class="onion-card carouselCard" href="${onion.projectUrl}" title="${onion.name}">
      <div class="carouselThumbWrapper">
        <img class="carouselThumb onion-thumb" src="${onion.thumbnailUrl}" alt="${onion.name}">
      </div>
      <div class="carouselItemTitle">${onion.name}</div>
      <p class="carouselItemDesc">${onion.description || ""}</p>
      <div class="carouselDates">
        <div>Created: ${formatDate(onion.createdDate)}</div>
        <div>Last Modified: ${formatDate(onion.modifiedDate)}</div>
      </div>
    </a>
  `;
  return itemDiv;
}

function createItems() {
  onions.forEach((onion) => {
    track.appendChild(createCarouselItem(onion));
  });
}

function appendToCarousel(onion) {
  if (!track) return;
  onions.push(onion);
  track.appendChild(createCarouselItem(onion));
  track.appendChild(createCarouselItem(onion));
  updateCarousel();
}

document.addEventListener("DOMContentLoaded", () => {
  track = document.querySelector(".carouselTrack");
  prevButton = document.querySelector("#prevButton");
  nextButton = document.querySelector("#nextButton");

  if (!track) return;

  if (typeof onions !== "undefined" && Array.isArray(onions)) {
    createItems();
    createItems();
  }

  if (prevButton) {
    prevButton.addEventListener("click", showPrevItem);
  }
  if (nextButton) {
    nextButton.addEventListener("click", showNextItem);
  }

  ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "click"].forEach((event) => {
    document.addEventListener(event, resetIdleTimer, { passive: true });
  });

  updateCarousel();
  resetIdleTimer();
});

window.appendToCarousel = appendToCarousel;
