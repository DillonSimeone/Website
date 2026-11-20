// countdown.js
// Name: Dillon Simeone
// Date: November 10, 2026

"use strict";

let timer = null;

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("birthday-form");
    const birthdayInput = document.getElementById("birthday-input");
    const countdownDisplay = document.getElementById("countdown-display");
    const daysSpan = document.getElementById("days");
    const hoursSpan = document.getElementById("hours");
    const minutesSpan = document.getElementById("minutes");
    const secondsSpan = document.getElementById("seconds");

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (timer) {
            clearInterval(timer);
        }

        const dateValue = birthdayInput.value;
        if (!dateValue) {
            alert("Please enter your birthday.");
            countdownDisplay.classList.add("d-none");
            return;
        }

        const birthDate = new Date(dateValue + "T00:00:00");
        const now = new Date();

        if (birthDate > now || birthDate.getFullYear() < 1900) {
            alert("Please enter a valid birthday between 1900 and today.");
            countdownDisplay.classList.add("d-none");
            return;
        }

        let nextBirthday = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate());

        if (nextBirthday < now) {
            nextBirthday.setFullYear(now.getFullYear() + 1);
        }

        function updateCountdown() {
            const current = new Date();
            const diff = nextBirthday.getTime() - current.getTime();

            if (diff <= 0) {
                clearInterval(timer);
                daysSpan.textContent = "0";
                hoursSpan.textContent = "0";
                minutesSpan.textContent = "0";
                secondsSpan.textContent = "0";
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);

            daysSpan.textContent = days;
            hoursSpan.textContent = hours;
            minutesSpan.textContent = minutes;
            secondsSpan.textContent = seconds;
        }

        updateCountdown();
        countdownDisplay.classList.remove("d-none");
        timer = setInterval(updateCountdown, 1000);
    });
});
