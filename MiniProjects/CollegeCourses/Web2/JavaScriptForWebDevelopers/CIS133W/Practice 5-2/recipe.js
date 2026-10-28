"use strict";

// TODO: Create an array named recipes with at least 6 recipe names
const recipes = [
    "Vegetable Stir Fry",
    "Vegetable Soup",
    "Vegetable Lasagna",
    "Chicken Parmesan",
    "Beef Tacos",
    "Spaghetti Bolognese"
];

// TODO: Write a function listRecipes() to show all recipes in #message
const listRecipes = () => {
    document.querySelector("#message").textContent = recipes.join(" | ");
};

// TODO: Write a function searchRecipes() to filter recipes by search term
const searchRecipes = () => {
    const searchTerm = document.querySelector("#search_term").value.trim().toLowerCase();

    if (searchTerm === "") {
        document.querySelector("#message").textContent = "No matching recipes found.";
        return;
    }

    const matches = recipes.filter(recipe => recipe.toLowerCase().includes(searchTerm));

    if (matches.length > 0) {
        document.querySelector("#message").textContent = matches.join(" | ");
    } else {
        document.querySelector("#message").textContent = "No matching recipes found.";
    }
};

// TODO: Add DOMContentLoaded event handler to attach the button events
document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#list").addEventListener("click", listRecipes);
    document.querySelector("#search").addEventListener("click", searchRecipes);
});
