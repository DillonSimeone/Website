const track = document.querySelector("#mainTrack");
const prevButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");

let currentIndex = 0;

function updateCarousel() {
    const offset = -currentIndex * 220;
    track.style.transform = `translateX(${offset}px)`;
}

myAnime.forEach((item) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "carouselItem";
    itemDiv.innerHTML = `${item.name}<br><a href="${item.animeUrl}">`
        + `<img class="thumbnail" src="${item.thumbnailUrl}" alt="${item.name} thumbnail"></a><br>${item.description}`;
    track.appendChild(itemDiv);
});

prevButton.addEventListener("click", () => {
    currentIndex -= 1;
    if (currentIndex < 0)
        currentIndex = 0;
/* 
Type of error: Runtime error
Problem: Misspelled function name updateCarosel
Solution: Changed it to updateCarousel to match the function name
*/
    updateCarousel();
});

/* 
Type of error: Syntax error
Problem: Missing > in the arrow function
Solution: Changed = to => to fix the arrow function
*/
nextButton.addEventListener("click", () => {
    currentIndex += 1;
    if (currentIndex > myAnime.length - 4)
        currentIndex = myAnime.length - 4;
    updateCarousel();
});
