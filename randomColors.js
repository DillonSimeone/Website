//Returns random colors. For use in other functions, don't use this directly.
function randomColor(min){
    let color = Math.floor(Math.random() * (255));
    if (color < min)
        color = min;
    return color;
};

//Returns a random rgb, the higher the min value is, the blighter the colors will be. (Less than 255!)
function randomRgb(min){
    return "rgb(" + randomColor(min) + "," + randomColor(min) + "," + randomColor(min) + ")";
}

//Returns a random rgba, the higher the min value is, the blighter the colors will be. (Less than 255!)
//Alpha fades the colors out.
function randomRgba(min, alpha){
    return "rgba(" + randomColor(min) + "," + randomColor(min) + "," + randomColor(min) + "," + alpha + ")";
};

//Add random linear gradient to target element.
function ItemColors(min, alpha, target){
    document.querySelector(target).style.background = "linear-gradient(to right, " + randomRgba(min, alpha) + " , " + randomRgba(min, alpha) + " , " + randomRgba(min, alpha) + ")";
};

//Add random linear gradient to target elements.
function ItemsColors(min, alpha, targets){
    const elements = [].slice.call(document.querySelectorAll(targets)); //Turns nodeListOf from querySelectorAll into an array of objects.
    elements.map( element => element.style.background = "linear-gradient(to right, " + randomRgba(min, alpha) + " , " + randomRgba(min, alpha) + " , " + randomRgba(min, alpha) + ")");
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

//Random colors for letters
function lettersColors(targets){
        for(let i = 0; i < targets.length; i++){
            targets[i].style.color = randomRgb(100);
        }
}