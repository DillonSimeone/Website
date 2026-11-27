"use strict";

let currentIndex = 0;
let track;
let prevButton;
let nextButton;

let idleTimer = null;
let attractInterval = null;

const ITEM_WIDTH = 200;

let jumpRaf = null;

function updateCarousel() {
  const offset = -currentIndex * ITEM_WIDTH;
  track.style.transform = `translateX(${offset}px)`;
}

function jumpAndSlide(direction) {
  const currentX = new DOMMatrix(getComputedStyle(track).transform).m41;
  const loopWidth = onions.length * ITEM_WIDTH;
  const shiftedX = currentX + (direction === 1 ? loopWidth : -loopWidth);

  track.style.transition = "none";
  track.style.transform = `translateX(${shiftedX}px)`;
  void track.offsetWidth;

  currentIndex += direction;

  if (jumpRaf) cancelAnimationFrame(jumpRaf);
  jumpRaf = requestAnimationFrame(() => {
    jumpRaf = null;
    track.style.transition = "transform 0.5s ease";
    updateCarousel();
  });
}

function transition(direction) {
  if (currentIndex >= onions.length * 2 && direction === 1) {
    currentIndex -= onions.length;
    jumpAndSlide(direction);
  } else if (currentIndex <= 1 && direction === -1) {
    currentIndex += onions.length;
    jumpAndSlide(direction);
  } else {
    if (jumpRaf) {
      cancelAnimationFrame(jumpRaf);
      jumpRaf = null;
      track.style.transition = "transform 0.5s ease";
    }
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
  track.innerHTML = "";
  createItems();
  createItems();
  createItems();
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
    createItems();
    currentIndex = onions.length;
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

  track.style.transition = "none";
  updateCarousel();
  void track.offsetWidth;
  track.style.transition = "transform 0.5s ease";

  resetIdleTimer();
});

window.appendToCarousel = appendToCarousel;
