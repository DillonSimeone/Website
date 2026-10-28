"use strict";

// TODO: Add function to split input into array
const splitString = (str, separator) => str.split(separator);

// TODO: Add function to capitalize each word
const capitalizeWords = (words) => {
    const wordArray = Array.isArray(words) ? words : words.split(" ");
    const capitalized = [];
    for (const word of wordArray) {
        if (word.length > 0) {
            capitalized.push(word[0].toUpperCase() + word.slice(1).toLowerCase());
        }
    }
    return capitalized.join(" ");
};

// TODO: Add function to trim whitespace
const trimArray = (arr) => {
    const trimmed = [];
    for (const item of arr) {
        const clean = item.trim();
        if (clean.length > 0) {
            trimmed.push(clean);
        }
    }
    return trimmed;
};

// TODO: Add function to display formatted bio
const joinColors = (colors) => {
    if (colors.length === 0) return "";
    if (colors.length === 1) return colors[0];
    if (colors.length === 2) return `${colors[0]} and ${colors[1]}`;
    return `${colors.slice(0, -1).join(", ")} and ${colors[colors.length - 1]}`;
};

const displayBio = (name, birthYear, colors) => {
    const colorCount = colors.length;
    const formattedColors = joinColors(colors);
    const colorLabel = colorCount === 1 ? "favorite color" : "favorite colors";
    const message = `Hello, my name is ${name}. I was born in ${birthYear}. I have ${colorCount} ${colorLabel}: ${formattedColors}.`;
    document.querySelector("#message").textContent = message;
};

const submitClick = () => {
    // TODO: Get values from form inputs
    const fullName = document.querySelector("#full_name").value;
    const dob = document.querySelector("#dob").value;
    const colors = document.querySelector("#colors").value;

    // TODO: Process and format input values
    const nameArray = splitString(fullName.trim(), " ");
    const formattedName = capitalizeWords(nameArray);

    const dobArray = splitString(dob.trim(), "-");
    const birthYear = dobArray.length >= 3 ? dobArray[2].trim() : dob.trim();

    const colorArray = splitString(colors, ",");
    const trimmedColors = trimArray(colorArray);

    // TODO: Display the formatted bio to #message
    displayBio(formattedName, birthYear, trimmedColors);
};

document.addEventListener("DOMContentLoaded", () => {
    // TODO: Add click listener to #submit_button
    document.querySelector("#submit_button").addEventListener("click", submitClick);
});
