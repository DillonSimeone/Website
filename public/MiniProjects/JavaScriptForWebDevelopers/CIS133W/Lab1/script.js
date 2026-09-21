function getLetterStink(char) {
    // a = 1, b = 2, ... z = 26 (ignoring uppercase)
    const code = char.toLowerCase().charCodeAt(0);
    return (code >= 97 && code <= 122) ? (code - 96) : 5;
}

function calculateMultiplierFromId(id) {
    // Clean the ID (e.g., "slugInput" -> "slug")
    const cleanWord = id.replace("Input", "").toLowerCase();

    // Sum up the letter stink points
    let letterScoreSum = 0;
    for (let i = 0; i < cleanWord.length; i++) {
        letterScoreSum += getLetterStink(cleanWord[i]);
    }
    const len = cleanWord.length;
    // SILLY SHREK FORMULA:
    // Base stink: average letter score
    // Weirdness factor: length cubed modulo 13, scaled by Math.sqrt(length)
    // Long words swing wildly between mega-stink and weirdly mild
    const chaosFactor = ((len ** 3) % 13) + 1;
    const finalMultiplier = (letterScoreSum / len) * chaosFactor;
    return parseFloat(finalMultiplier.toFixed(2));
}

document.addEventListener("DOMContentLoaded", () => {

    const calculateButton = document.querySelector("#calculateButton");
    const mudInput = document.querySelector("#mudInput");
    const onionsInput = document.querySelector("#onionsInput");
    const slugInput = document.querySelector("#slugInput");
    const snailInput = document.querySelector("#snailInput");

    const juiceAmountOutput = document.querySelector("#juiceAmount");
    const stinkLevelOutput = document.querySelector("#stinkLevel");

    // Add event listener to the button
    calculateButton.addEventListener('click', () => {

        // Add constants for each input field value
        const mud = parseFloat(mudInput.value);
        const onions = parseFloat(onionsInput.value);
        const slug = parseFloat(slugInput.value);
        const snail = parseFloat(snailInput.value);

        // let there be juice
        const mudStink = mud * calculateMultiplierFromId(mudInput.id);
        const slugStink = slug * calculateMultiplierFromId(slugInput.id);
        const snailStink = snail * calculateMultiplierFromId(snailInput.id);
        const onionsStink = onions * calculateMultiplierFromId(onionsInput.id);

        // a bit of chemistry silliness
        const methaneSurge = (mud * onions) * 0.75;
        const gastropodResonance = (slug * snail) * 1.5;

        //final math
        const totalStink = mudStink + slugStink + snailStink + onionsStink + methaneSurge + gastropodResonance;
        const juiceAmount = mud + onions + slug + snail;

        // Display the results, rounded to 2 decimal places
        juiceAmountOutput.textContent = juiceAmount.toFixed(2) + " gallons";
        stinkLevelOutput.textContent = totalStink.toFixed(2) + " stink points";


    });

});
