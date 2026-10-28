"use strict";

const searchInput = document.querySelector("#searchTerm");
const searchBtn = document.querySelector("#searchBtn");
const clearBtn = document.querySelector("#clearBtn");
const resultsContainer = document.querySelector("#searchResults");

const displayResults = (items) => {
  resultsContainer.innerHTML = "";

  if (items.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "noResults";
    emptyMsg.textContent = "No matching cultivars found.";
    resultsContainer.appendChild(emptyMsg);
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "resultItem";

    const img = document.createElement("img");
    img.className = "resultThumb";
    img.src = item.thumbnailUrl;
    img.alt = item.name;
    row.appendChild(img);

    const details = document.createElement("div");
    details.className = "resultDetails";

    const title = document.createElement("h3");
    title.textContent = item.name;
    details.appendChild(title);

    const desc = document.createElement("p");
    desc.textContent = item.description;
    details.appendChild(desc);

    const link = document.createElement("a");
    link.className = "resultLink";
    link.href = item.projectUrl;
    link.textContent = "View Cultivar Details \u2192";
    details.appendChild(link);

    row.appendChild(details);
    resultsContainer.appendChild(row);
  }
};

searchBtn.addEventListener("click", () => {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = onions.filter((item) =>
    item.name.toLowerCase().includes(term) ||
    item.description.toLowerCase().includes(term)
  );
  displayResults(filtered);
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  displayResults(onions);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    searchBtn.click();
  }
});

displayResults(onions);
