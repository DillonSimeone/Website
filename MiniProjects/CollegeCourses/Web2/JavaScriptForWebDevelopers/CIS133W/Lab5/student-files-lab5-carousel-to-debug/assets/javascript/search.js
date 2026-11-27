/* 
Type of error: Runtime error
Problem: Wrong id in querySelector with lowercase i
Solution: Changed #searchTextinput to #searchTextInput to find the input element
*/
const searchTextInput = document.querySelector("#searchTextInput");
const searchButton = document.querySelector("#searchButton");
const clearButton = document.querySelector("#clearButton");
const resultsDiv = document.querySelector("#resultsDiv");

function searchCell(content) {
    const div = document.createElement("div");
    div.className = "searchCell";
    div.append(content);
    return div;
}
function displayResults(items) {
    resultsDiv.innerHTML = '';

    items.forEach(item => {
        const thumbnail = document.createElement("img");
        const anchor = document.createElement("a");
        anchor.href = item.animeUrl
        thumbnail.className = "thumbnail";
        thumbnail.src = item.thumbnailUrl;
        anchor.appendChild(thumbnail);
        resultsDiv.appendChild(searchCell(anchor));
        resultsDiv.appendChild(searchCell(item.name));
        resultsDiv.appendChild(searchCell("Type: " + item.type))
        resultsDiv.appendChild(searchCell(item.description));
    });
}

function matchItem(item, terms) {
    for (i = 0; i < terms.length; i++) {
        const term = terms[i];
        const text = `${item.name} ${item.description} ${item.type}`.toLowerCase();
        if (!text.includes(term))
            return false;
    }
    return true;
}

searchButton.addEventListener("click", () => {
/* 
Type of error: Type error
Problem: Called toLowerCase on an input element instead of a string
Solution: Added .value so toLowerCase is called on the text string
*/
    const searchText = searchTextInput.value.toLowerCase();
    const terms = searchText.split(" ");

    const filtered = myAnime.filter(item => matchItem(item, terms));
    displayResults(filtered);
});

clearButton.addEventListener("click", () => {
   searchTextInput.value = "";
   displayResults(myAnime);
});

displayResults(myAnime);
