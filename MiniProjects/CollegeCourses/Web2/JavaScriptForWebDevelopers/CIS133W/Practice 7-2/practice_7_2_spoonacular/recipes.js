// recipes.js
// Name: Dillon Simeone
// Date: November 3, 2026

"use strict";

// TODO: 1) Replace with your own Spoonacular API key
const apiKey = "862186011c084c5fa2ec6bb6452c2b56";

document.addEventListener("DOMContentLoaded", () => {
	const form = document.getElementById("recipe-form");

	form.addEventListener("submit", async (e) => {
		e.preventDefault(); // Prevents page reload

		// TODO: 2) Get the values entered by the user from the three input fields
		   /* - Use document.getElementById and the .value property
		      - .trim is also helpful
		      - Store each value in variables: ing1, ing2, ing3 
			*/
		const ing1 = document.getElementById("ingredient1").value.trim();
		const ing2 = document.getElementById("ingredient2").value.trim();
		const ing3 = document.getElementById("ingredient3").value.trim();

		// Build ingredients string for API (skip blanks)
		const ingredients = [ing1, ing2, ing3].filter(i => i !== "").join(",");

		// TODO: 3) Get the number of recipes to display from #recipe-count
		
		// TODO: 4) Ensure these are integers from 1-10
			// Use parseInt() so it’s a number, not a string
		let count = parseInt(document.getElementById("recipe-count").value, 10);
		if (isNaN(count) || count < 1) {
			count = 1;
		} else if (count > 10) {
			count = 10;
		}

		// TODO: 5) Check if the "random-recipes" box is checked
			// Store in a variable named randomize
		const randomize = document.getElementById("random-recipes").checked;

		// Simple validation: need at least one ingredient 
			// renderMessage() will output to a box created later in the code
		if (!ingredients) {
			renderMessage("Please enter at least one ingredient.", "error");
			return;
		}
		
		// TODO: 6) Build the API URL using a template literal (` `) 
			/* - Note that backticks are used in template literals rather than apostrophes or quote marks
			   - Example: https://api.spoonacular.com/recipes/findByIngredients?ingredients=...expression here... &number=...expression here...&apiKey=...expression here...
			   	 - follow the = sign in the URL with JavaScript expressions
			   	 - Use encodeURIComponent() with ingredients expression
			 */
		const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(ingredients)}&number=${count}&apiKey=${apiKey}`;

		// Fetch API and display the status message
			// Read the instructions for more information
			// renderMessage() will output to a box created later in the code
		try {
			renderMessage("Searching…", "status");
			const response = await fetch(url);
			if (!response.ok) {
				// Constructs a simple message using an expression
				throw new Error(`Request failed (${response.status})`);
			}
			const data = await response.json();
			displayRecipes(data, count, randomize);
		} catch (err) {
			console.error("Fetch error:", err);
			renderMessage("There was a problem retrieving recipes. Try again.", "error");
		}
	});
});

// TODO: 7) Write the displayRecipes() function
   // Parameters: recipes, count, randomize  
function displayRecipes(recipes, count, randomize) {

	// TODO: 8) Get data from #results-grid
		// Store in a variable named results
	const results = document.getElementById("results-grid");

	// TODO: 9) Clear any previous results with .innerHTML
	results.innerHTML = "";
  
	// Message created if no recipes match the search
	if (!Array.isArray(recipes) || recipes.length === 0) {
		renderMessage("No recipes found. Try different ingredients.", "status");
		return;
	}
	
	// If randomize is true (checked in the form), shuffle the recipes array
	if (randomize) {
		shuffle(recipes); // see Fisher-Yates shuffle() below
	}

	// Loop through the array (for...of loop)
	for (const recipe of recipes) {		
	// You will build the HTML for each recipe card and append to results with the following code. Here is the HTML structure you are attempting to create:
		/*
		<div class="recipe-card">
			<img src="recipe URL" alt="title of the recipe">
			<h3>title of the recipe</h3>
		</div>
		*/
		
		// TODO: 10) Create the div elements and store in a variable named card
		const card = document.createElement("div");
		
		// TODO: 11) Give each card a class "recipe-card"
		card.className = "recipe-card";
		
		// Defensive checks for image/title in case there are no results for either of these in the recipe
			// Variables created are imgSrc and title
		const imgSrc = recipe.image || "";
		const title = recipe.title || "Untitled";
		
		// TODO: 12) Construct the template literal for the HTML of each card
			// You'll start with card.innerHTML =
			// Be sure to include backticks around the HTML you are constructing within
			// Expressions needed are ${imgSrc} and ${title}
		card.innerHTML = `
			<img src="${imgSrc}" alt="${title}">
			<h3>${title}</h3>
		`;
		
		// TODO: 13) Append the results to card with .appendChild
		results.appendChild(card);
		
	} // loop ends

	// TODO: 14) Clear any status message if present
	clearMessage();

// displayRecipes() should close } here
}

// Fisher–Yates Shuffle
	// This is a commonly used JavaScript function to randomly shuffle items in an array
function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		// pick a random index 0..i
		const j = Math.floor(Math.random() * (i + 1));
		// swap arr[i] and arr[j]
		const tmp = arr[i];
		arr[i] = arr[j];
		arr[j] = tmp;
	}
}

// Creates a message box (above <main> in the HTML) that indicates the status of the search -- don't forget to style this
function renderMessage(text, type) {
	let box = document.getElementById("status-box");
	if (!box) {
		box = document.createElement("div");
		box.id = "status-box";
		// Students can style #status-box in their own CSS
		const main = document.querySelector("main");
		main.insertBefore(box, main.firstChild);
	}
	box.textContent = text;
	box.dataset.type = type; // "status" or "error"
}

// Clears the message box when it's no longer necessary
function clearMessage() {
	const box = document.getElementById("status-box");
	if (box) box.textContent = "";
}
