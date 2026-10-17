"use strict";

document.addEventListener('DOMContentLoaded', () => {
    const seperator = ", "
    const numberInput = document.querySelector("#numberInput")
    const addNumberButton = document.querySelector("#addNumberButton")
    const numbersList = document.querySelector("#numbersList")
    let numbersListString = ""
    let numberTracker = 0;
    let count = 0;
    let min = null;
    let max = null;

    const calculateButton = document.querySelector("#calculateButton")
    const sumOutput = document.querySelector("#sumOutput")
    const averageOutput = document.querySelector("#averageOutput")
    const minOutput = document.querySelector("#minOutput")
    const maxOutput = document.querySelector("#maxOutput")

    addNumberButton.addEventListener('click', () => {
        const value = numberInput.value
        const number = parseFloat(value)

        if (isNaN(number) || number !== parseInt(value)) {
            numbersList.textContent = "Please enter a valid integer."
            numbersList.style.color = '#dc3545'
            return
        } else {
            numberTracker += number
            count++

            if (min === null || number < min)
                min = number
            if (max === null || number > max)
                max = number

            if (numbersListString != "")
                numbersListString += seperator + number;
            else
                numbersListString += number;

            numbersList.textContent = numbersListString;
            numbersList.style.color = '#777';
        }
        numberInput.value = '';
    });

    calculateButton.addEventListener('click', () => {
        if (count === 0) {
            numbersList.textContent = "Please add at least one number before calculating.";
            numbersList.style.color = '#dc3545';
            return;
        }

        //Wait, it was already calculated the entire time?
        //Always has been.
        sumOutput.textContent = "Sum: " + numberTracker

        const average = numberTracker / count
        averageOutput.textContent = "Average: " + average
        minOutput.textContent = "Minimum: " + min
        maxOutput.textContent = "Maximum: " + max
    })
});
