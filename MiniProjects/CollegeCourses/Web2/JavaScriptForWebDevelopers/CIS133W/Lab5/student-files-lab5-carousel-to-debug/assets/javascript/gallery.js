const galleryDiv = document.querySelector("#galleryContainer");

/* 
Type of error: Syntax error
Problem: Missing closing parenthesis in the for loop
Solution: Added the closing parenthesis after i++
*/
for (i = 0; i < myAnime.length; i++) {
    const item = myAnime[i];
    const html = `<a href="${item.animeUrl}"><img class="thumbnail" src="${item.thumbnailUrl}"></a>`;
/* 
Type of error: Logic error
Problem: Used = which overwrites the html on each loop
Solution: Changed = to += to add each item to the gallery
*/
    galleryDiv.innerHTML += html;
}

console.log("Loaded Javascript");
