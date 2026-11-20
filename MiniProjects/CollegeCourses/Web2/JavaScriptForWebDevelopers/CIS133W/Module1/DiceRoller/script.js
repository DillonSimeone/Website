const dice = document.getElementById('dice');
const instruction = document.getElementById('instruction');

let isRolling = false;

function getRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r}, ${g}, ${b})`;
}

function getRandomDiceNumber() {
    return Math.floor(Math.random() * 6) + 1;
}

function rollDice() {
    if (isRolling) return;
    isRolling = true;
    dice.classList.add('rolling');
    if (instruction) instruction.textContent = 'Rolling...';

    const intervalDuration = 250;
    const totalDuration = 1000;
    let elapsed = 0;

    // Immediately trigger the first flash
    dice.textContent = getRandomDiceNumber();
    dice.style.backgroundColor = getRandomColor();
    dice.style.color = '#ffffff';

    const rollInterval = setInterval(() => {
        elapsed += intervalDuration;

        if (elapsed >= totalDuration) {
            clearInterval(rollInterval);

            // Final reveal: final selected number, white background, black number
            const finalRoll = getRandomDiceNumber();
            dice.textContent = finalRoll;
            dice.style.backgroundColor = '#ffffff';
            dice.style.color = '#111827';
            dice.classList.remove('rolling');

            if (instruction) instruction.textContent = 'Click the die to roll again!';
            isRolling = false;
        } else {
            // Flash a random number and random background color
            dice.textContent = getRandomDiceNumber();
            dice.style.backgroundColor = getRandomColor();
            dice.style.color = '#ffffff';
        }
    }, intervalDuration);
}

dice.addEventListener('click', rollDice);
