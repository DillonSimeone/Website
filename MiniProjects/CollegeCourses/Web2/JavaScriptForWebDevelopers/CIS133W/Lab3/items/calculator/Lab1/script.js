function getLetterStink(char) {
    // a = 1, b = 2, ... z = 26 (ignoring uppercase)
    const code = char.toLowerCase().charCodeAt(0);
    return (code >= 97 && code <= 122) ? (code - 96) : 5;
}

// silly shrek formula:
// base stink: average letter rank (A=1 mild, Z=26 putrid)
// swamp roulette: cube the word length, modulo 13, plus 1
// multiplication: the swamp roulette acts as an unpredictable 1x–13x booster
// examples:
//  mud   (3 letters) -> (27 % 13) + 1  = 2x (accurately mild)
//  slug  (4 letters) -> (64 % 13) + 1  = 13x (MAXIMUM STENCH)
//  snail (5 letters) -> (125 % 13) + 1 = 9x (heavy funk)
function calculateMultiplierFromWord(word) {
    const cleanWord = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (!cleanWord) return 1.0;

    let letterScoreSum = 0;
    for (let i = 0; i < cleanWord.length; i++) {
        letterScoreSum += getLetterStink(cleanWord[i]);
    }
    const len = cleanWord.length;
    const chaosFactor = ((len ** 3) % 13) + 1;
    const finalMultiplier = (letterScoreSum / len) * chaosFactor;
    return parseFloat(finalMultiplier.toFixed(2));
}

function calculateMultiplierFromId(id) {
    // Clean the ID (e.g., "slugInput" -> "slug")
    const cleanWord = id.replace("Input", "").toLowerCase();
    return calculateMultiplierFromWord(cleanWord);
}

function getStinkDescription(stink) {
    if (stink <= 0) return "No stink yet. Get brewing!";
    if (stink < 75) return "Mild swamp breeze. Farquaad's knights might still advance.";
    if (stink < 250) return "Eyes watering. Donkey is coughing.";
    if (stink < 666) return "Lord Farquaad's army is in full retreat.";
    return "Toxic swamp catastrophe. The entire kingdom has evacuated.";
}

document.addEventListener("DOMContentLoaded", () => {

    const calculateButton = document.querySelector("#calculateButton");
    const mudInput = document.querySelector("#mudInput");
    const onionsInput = document.querySelector("#onionsInput");
    const slugInput = document.querySelector("#slugInput");
    const snailInput = document.querySelector("#snailInput");

    const juiceAmountOutput = document.querySelector("#juiceAmount");
    const stinkLevelOutput = document.querySelector("#stinkLevel");
    const stinkRatingText = document.querySelector("#stinkRatingText");

    const customNameInput = document.querySelector("#customNameInput");
    const customPoundsInput = document.querySelector("#customPoundsInput");
    const multiplierPreview = document.querySelector("#multiplierPreview");
    const addIngredientButton = document.querySelector("#addIngredientButton");
    const customIngredientsList = document.querySelector("#customIngredientsList");
    const cauldronVisual = document.querySelector("#cauldronVisual");

    let customItemCounter = 0;

    // Live preview of the letter multiplier while typing an ingredient name
    customNameInput.addEventListener("input", () => {
        const name = customNameInput.value.trim();
        if (!name) {
            multiplierPreview.textContent = "Type an ingredient to test stink potency";
            return;
        }
        const mult = calculateMultiplierFromWord(name);
        multiplierPreview.textContent = `"${name}" potency: x${mult.toFixed(2)} stink per pound`;
    });

    // Add new custom item into the pot
    addIngredientButton.addEventListener("click", () => {
        const name = customNameInput.value.trim();
        if (!name) return;

        const poundsValue = parseFloat(customPoundsInput.value);
        const pounds = isNaN(poundsValue) || poundsValue <= 0 ? 1 : poundsValue;
        const multiplier = calculateMultiplierFromWord(name);

        customItemCounter++;
        const rowId = `customInput_${customItemCounter}`;

        const itemRow = document.createElement("div");
        itemRow.className = "custom-ingredient-row";
        itemRow.dataset.multiplier = multiplier;
        itemRow.dataset.name = name;

        itemRow.innerHTML = `
            <div class="custom-info">
                <span class="custom-name">${name}</span>
                <span class="custom-badge">x${multiplier.toFixed(2)} potency</span>
            </div>
            <div class="custom-controls">
                <label for="${rowId}">Pounds:</label>
                <input type="text" id="${rowId}" class="custom-amount-input" value="${pounds}">
                <button type="button" class="remove-btn" title="Fish out of pot">&times;</button>
            </div>
        `;

        itemRow.querySelector(".remove-btn").addEventListener("click", () => {
            itemRow.remove();
        });
        customIngredientsList.appendChild(itemRow);
        cauldronVisual.classList.add("splashing");
        setTimeout(() => cauldronVisual.classList.remove("splashing"), 400);
        customNameInput.value = "";
        customPoundsInput.value = "";
        multiplierPreview.textContent = `Threw ${name} into the pot!`;
    });
    calculateButton.addEventListener('click', () => {

        const mud = parseFloat(mudInput.value) || 0;
        const onions = parseFloat(onionsInput.value) || 0;
        const slug = parseFloat(slugInput.value) || 0;
        const snail = parseFloat(snailInput.value) || 0;

        // and shrek said, let there be juice
        const mudStink = mud * calculateMultiplierFromId(mudInput.id);
        const slugStink = slug * calculateMultiplierFromId(slugInput.id);
        const snailStink = snail * calculateMultiplierFromId(snailInput.id);
        const onionsStink = onions * calculateMultiplierFromId(onionsInput.id);

        // a bit of chemistry silliness
        const methaneSurge = (mud * onions) * 0.75;
        const gastropodResonance = (slug * snail) * 1.5;

        // Sum up any custom ingredients in the pot
        let customStink = 0;
        let customJuice = 0;
        const customRows = document.querySelectorAll(".custom-ingredient-row");
        customRows.forEach((row) => {
            const rowInput = row.querySelector(".custom-amount-input");
            const rowPounds = parseFloat(rowInput.value) || 0;
            const rowMultiplier = parseFloat(row.dataset.multiplier) || 1;
            customJuice += rowPounds;
            customStink += (rowPounds * rowMultiplier);
        });

        const totalStink = mudStink + slugStink + snailStink + onionsStink + methaneSurge + gastropodResonance + customStink;
        const juiceAmount = mud + onions + slug + snail + customJuice;

        juiceAmountOutput.textContent = juiceAmount.toFixed(2) + " gallons";
        stinkLevelOutput.textContent = totalStink.toFixed(2) + " stink points";
        stinkRatingText.textContent = getStinkDescription(totalStink);
        cauldronVisual.classList.add("boiling");
        setTimeout(() => cauldronVisual.classList.remove("boiling"), 1200);

    });

});
