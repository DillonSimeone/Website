// Lab 2 - Parallel Arrays & Dynamic Gallery

// 1 Parallel Array: Item Titles
const itemNames = [
  "Swamp Juice Master Brewer (Lab 1)",
  "Ogre Vidalia Prime Bulb",
  "Pungent Red Creek Onion",
  "Whispering Swamp Shallot",
  "Slender Mud-Spring Scallion"
];

// 2 Parallel Array: Thumbnail Image URLs
const thumbnailUrls = [
  "assets/images/calculator.webp",
  "assets/images/vidalia.webp",
  "assets/images/red-onion.webp",
  "assets/images/shallot.webp",
  "assets/images/green-scallion.webp"
];

// 3 Parallel Array: Item Detail Page URLs
const itemUrls = [
  "items/calculator/index.html",
  "items/vidalia/index.html",
  "items/red-onion/index.html",
  "items/shallot/index.html",
  "items/green-scallion/index.html"
];

const galleryContainer = document.querySelector("#galleryContainer");

for (let i = 0; i < itemNames.length; i++) {
  const thumbnailHtml = '<a class="onion-card" href="' + itemUrls[i] + '">' +
    '<div class="thumbnail-wrapper">' +
    '<img class="onion-thumb" src="' + thumbnailUrls[i] + '" alt="' + itemNames[i] + '">' +
    '</div>' +
    '<span class="onion-caption">' + itemNames[i] + '</span>' +
    '</a>';

  galleryContainer.innerHTML += thumbnailHtml;
}
