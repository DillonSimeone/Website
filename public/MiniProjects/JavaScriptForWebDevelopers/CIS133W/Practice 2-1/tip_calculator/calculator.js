document.addEventListener("DOMContentLoaded", () => {

    // Add document.querySelector for input fields, buttons and result display elements.
    const calculateButton = document.querySelector("#calculateButton");
    const mealCostInput = document.querySelector("#mealCostInput");
    const tipPercentInput = document.querySelector("#tipPercentInput");
    const tipAmountOutput = document.querySelector("#tipAmountOutput");
    const totalCostOutput = document.querySelector("#totalCostOutput");

    // Add event listener to the button
    calculateButton.addEventListener('click', () => {

        // Add constants for each input field value
        const mealCost = parseFloat(mealCostInput.value); //Javascript is silly about numbers and strings.
        const tipPercentage = parseFloat(tipPercentInput.value);

        // Add constants for each calculation
        const tipAmount = mealCost * (tipPercentage / 100);
        const totalAmount = mealCost + tipAmount;


        // Display the results, rounded to 2 decimal places
        tipAmountOutput.textContent = "$" + tipAmount.toFixed(2);
        totalCostOutput.textContent = "$" + totalAmount.toFixed(2);


    });

});
