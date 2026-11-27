"use strict";

document.addEventListener('DOMContentLoaded', () => {
    // Add constants for elements from the DOM
    const userInput = document.querySelector("#userInput");
    const translateButton = document.querySelector("#translateButton");
    const pigLatinOutput = document.querySelector("#pigLatinOutput");

    // Event listener for the translate button
    translateButton.addEventListener('click', () => {
        // Add a constant to get the user input and trim whitespace
        const input = userInput.value.trim();

        // Add a constant array to store the vowels
        const vowels = ['a', 'e', 'i', 'o', 'u', 'y'];

        // Add a variable to hold an array of translated words
        const translatedWords = [];

        // Add a control structure to check if the input is empty and display a message if it is
        if (input === "") {
            pigLatinOutput.textContent = "Please enter text to translate.";
            return;
        }

        // Add a constant to clean the text, convert to lower case and split the sentence into an array of words
        const words = input.toLowerCase().replace(/[^a-z\s]/g, "").split(" ");

        // Add a for loop to iterate over the array of words
        for (let i = 0; i < words.length; i++) {
            // Add a constant to hold the current word
            const word = words[i];

            // Add a control structure to only translate non-empty words
            if (word.length > 0) {
                // Add a control structure to check if the word starts with a vowel using array.includes()
                if (vowels.includes(word[0])) {
                    // Push the translated word to the array
                    translatedWords.push(word + "way");
                // Add an else block to handle words that start with consonants
                } else {
                    // Add a variable to hold the index of the first vowel
                    let firstVowelIndex = -1;

                    // Add a for loop to find the index of the first vowel
                    for (let j = 0; j < word.length; j++) {
                        // Add a control structure to check if the character at index is a vowel using array.includes()
                        if (vowels.includes(word[j])) {
                            // If vowel found, set the index and break the loop
                            firstVowelIndex = j;
                            break;
                        }
                    }

                    // Add a control structure to handle words with no vowels
                    if (firstVowelIndex === -1) {
                        // If no vowel found, just add "ay"
                        translatedWords.push(word + "ay");
                    // If vowel found add an else block to handle words with vowels
                    } else {
                        // Add constants to hold the consonant cluster and the rest of the word
                        const consonants = word.substring(0, firstVowelIndex);
                        const restOfWord = word.substring(firstVowelIndex);

                        // Push the translated word to the array
                        translatedWords.push(restOfWord + consonants + "ay");

                        // End of else block for words with vowels
                    }
                    // End of control structure for words with no vowels
                }
                // End of else block for words that start with consonants
            }
            // End of control structure for non-empty words
        }
        // End of for loop iterating over words

        // Join the array of translated words back into a single string
        pigLatinOutput.textContent = translatedWords.join(" ");

    });
});