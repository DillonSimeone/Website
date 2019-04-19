//From https://coolors.co! Useful site.
const colorScheme1 = ["#bee6ce", "#bcffdb", "#8dffcd", "#44bba4", "4f9d69"];
//From shrio
const palette = ["#1abc9c", "#2ecc71","#3498db", "#9b59b6", "#34495e", "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#2c3e50", "#f1c40f", "#e67e22", "#e74c3c", "#ecf0f1", "#95a5a6", "#f39c12", "#d35400", "#c0392b", "#bdc3c7", "#7f8c8d"];

function SchemeColors(scheme){
    switch(scheme){
        case 1: 
            return colorScheme1;
            break;
        default:
            return colorScheme1;
            break;
    }
}


function randomSchemeColor(scheme){
    switch(scheme){
        case 1: 
            return colorScheme1[Math.ceil(Math.random() * colorScheme1.length)] 
            break;
        default:
            return colorScheme1[Math.ceil(Math.random() * colorScheme1.length)] 
            break;
    }
}

function ItemSchemeColors(scheme, which, target){
    scheme = SchemeColors(scheme);
    target = document.querySelector(target);
    if(which >= scheme.length)
        target.style.backgroundColor = scheme[0];
    else
        target.style.backgroundColor = scheme[which];
    
} 
/* 
//Returns random colors. For use in other functions, don't use this directly.
function randomColor(min, max){
    let color = Math.floor(Math.random() * (255));
    if (color < min)
        color = min;
    if (color > max)
        color = max;
    return color;
};
 */

 function randomColor(){
     return palette[Math.ceil(Math.random * palette.length)];
 }
//Returns a random rgb, the higher the min value is, the blighter the colors will be. (Less than 255!)
function randomRgb(min, max){
    return "rgb(" + randomColor(min, max) + "," + randomColor(min, max) + "," + randomColor(min, max) + ")";
}

//Returns a random rgba, the higher the min value is, the blighter the colors will be. (Less than 255!)
//Alpha fades the colors out.
function randomRgba(min, max, alpha){
    return "rgba(" + randomColor(min, max) + "," + randomColor(min, max) + "," + randomColor(min,max) + "," + alpha + ")";
};

//Add random linear gradient to target element.
function ItemColors(min, max, alpha, target){
    document.querySelector(target).style.background = "linear-gradient(to right, " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + ")";
};

//Add random linear gradient to target elements.
function ItemsColors(min, max, alpha, targets){
    const elements = [].slice.call(document.querySelectorAll(targets)); //Turns nodeListOf from querySelectorAll into an array of objects.
    elements.map( element => element.style.background = "linear-gradient(to right, " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + ")");
}



function ItemsSchemeColors(scheme, which, targets){
    scheme = SchemeColors(scheme);
    targets = [].slice.call(document.querySelectorAll(targets));
    if(which >= scheme.length)
        targets.forEach(element => {
            element.style.backgroundColor = scheme[0];
        });
    else
    targets.forEach(element => {
        element.style.backgroundColor = scheme[which];
    });
    
}

//Wraps all of the letters inside target elements in a span wrapper, then apply random colors.
function letterings(target){
    target = document.querySelectorAll(target);
    for(let i = 0; i < target.length; i++){
        let fancyText = "";
        for(let j = 0; j < target[i].innerHTML.length; j++){
            fancyText += "<span>" + target[i].innerHTML.charAt(j) + "</span>";
        }
        target[i].innerHTML = fancyText;
        lettersColors(target[i].getElementsByTagName('span'));
        window.addEventListener('resize', function(){
           lettersColors(target[i].getElementsByTagName('span')); 
        });
    }
};

function printIt(string){
    string = string.split('');
    let string2 ="";
    for(var i=0; i<string.length;i++){
        string2 += string[i];
        console.log(string2)
    }
}

//Random colors for letters
function lettersColors(targets){
        for(let i = 0; i < targets.length; i++){
            targets[i].style.color = randomRgb(100);
        }
}