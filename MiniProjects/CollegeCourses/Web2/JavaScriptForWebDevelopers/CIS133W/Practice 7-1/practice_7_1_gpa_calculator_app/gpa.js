// gpa.js
// Name: Dillon Simeone
// Date: November 3, 2026

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const calculateBtn = document.getElementById("calculate");
    calculateBtn.addEventListener("click", calculateGpa);
/* 
Type of error: Syntax error
Problem: Missing closing {} and () for the event listener
Solution: Added missing closing {} and () to properly close the event listener
*/
});

function calculateGpa() {
    const input = document.getElementById("grades").value;
    const grades = input.split(",");
    const totalCourses = grades.length;

    let sum = 0;
    for (let i = 0; i < grades.length; i++) {
        const grade = grades[i].trim().toUpperCase();
        sum += convertGrade(grade); 
    }

/* 
Type of error: Type error
Problem: Calling .toFixed() directly on total sum instead of calculating the GPA average
Solution: Divided sum by totalCourses before calling .toFixed(2)
*/
    const gpa = (sum / totalCourses).toFixed(2); 
    const output = document.getElementById("output");
    output.innerText = "You entered " + totalCourses + " courses. GPA: " + gpa;
}

/* 
Type of error: Runtime error
Problem: Function was defined as convertGrades instead of convertGrade, causing a ReferenceError
Solution: Renamed the function to convertGrade to match the function call
*/
function convertGrade(grade) {
/* 
Type of error: Logic error
Problem: Grade point values for A, B, and C were assigned incorrect values
Solution: Corrected return values so A returns 4.0, B returns 3.0, and C returns 2.0
*/
    if (grade === "A") return 4.0;
    else if (grade === "B") return 3.0;
    else if (grade === "C") return 2.0;
    else if (grade === "D") return 1.0;
    else if (grade === "F") return 0.0;
    else return 0.0;
}
