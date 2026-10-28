// feedback.js (starter version)
// Name: Dillon Simeone
// Date: October 27, 2026
"use strict";

const getElement = id => document.getElementById(id);

const displayErrorMsgs = msgs => {

	//TODO: Create the <ul> and all the <li> elements that hold the error messages
    const ul = document.createElement("ul");
    ul.classList.add("messages");

    for (const msg of msgs) {
        const li = document.createElement("li");
        li.textContent = msg;
        ul.appendChild(li);
    }

    const node = document.querySelector("ul.messages");
    if (node == null) {
        const form = getElement("feedback_form");
        form.parentNode.insertBefore(ul, form);
    } else {
        node.parentNode.replaceChild(ul, node);
    }
};

const processEntries = () => {
    const name = getElement("name").value.trim();
    const email = getElement("email").value.trim();
    const rating = getElement("rating").value;
    const terms = getElement("terms").checked;

    const errorMessages = [];

    // TODO: Add validation conditions
    if (name === "") {
        errorMessages.push("Please enter your name.");
    }

    if (email === "") {
        errorMessages.push("Please enter your email.");
    } else if (!email.includes("@") || !email.includes(".")) {
        errorMessages.push("Please enter a valid email address with '@' and '.'.");
    }

    if (rating === "") {
        errorMessages.push("Please select a rating between 1 and 5.");
    }

    if (!terms) {
        errorMessages.push("You must accept the terms.");
    }

    if (errorMessages.length > 0) {
        displayErrorMsgs(errorMessages);
    } else {
        getElement("feedback_form").submit();
    }
};

const resetForm = () => {
    getElement("feedback_form").reset();
    const ul = document.querySelector("ul.messages");
    if (ul) ul.remove();
    getElement("name").focus();
};

const init = () => {
    getElement("submit_btn").addEventListener("click", processEntries);
    getElement("reset_btn").addEventListener("click", resetForm);
    getElement("name").focus();
};

document.addEventListener("DOMContentLoaded", init);
