const galleryContainer = document.querySelector("#galleryContainer");

for (const onion of onions) {
  const thumbnailHtml = '<a class="onion-card" href="' + onion.projectUrl + '">' +
    '<div class="thumbnail-wrapper">' +
    '<img class="onion-thumb" src="' + onion.thumbnailUrl + '" alt="' + onion.name + '">' +
    '</div>' +
    '<span class="onion-caption">' + onion.name + '</span>' +
    '</a>';

  galleryContainer.innerHTML += thumbnailHtml;
}
