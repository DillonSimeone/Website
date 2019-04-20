//From shrio
const palette = ["#1abc9c", "#2ecc71","#3498db", "#9b59b6", "#34495e", "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#2c3e50", "#e67e22", "#e74c3c", "#f39c12", "#d35400", "#c0392b"];

/**
 * Returns a color randomly selected from a palette.
 */
function randomPaletteColor(){
    return palette[Math.floor(Math.random() * palette.length)];
}

/**
 * Adds a linear-gradient background to an element using colors selected from the palette.
 * @param {string} target DOM element class/id/tag.
 */
function ItemPaletteColors(target){
    document.querySelector(target).style.background = "linear-gradient(to right, " + randomPaletteColor() + " , " + randomPaletteColor() + " , " + randomPaletteColor() + ")";
}

/**
 * Returns a value between min - max
 * @param {integar} min lowest rgb value
 * @param {integar} max highest rgb value
 */
function randomColor(min, max){
    
    if(min < 0)
        min = 0;
    if(max < 0)
        max = 0;
    if(min > 255)
        min = 255;
    if(max > 255)
        max = 255;
    
    if(max === min)
        return max;
    
    let color = Math.floor(Math.random() * (255));
    if (color < min)
        color = min;
    if (color > max)
        color = max;
    return color;
};

/**
 * Adds a linear-gradient background to an element using random colors.
 * @param {integar} min lowest rgb value
 * @param {integar} max highest rgb value
 * @param {integar} alpha opacity
 * @param {string} target DOM element class/id/tag.
 */
function ItemColors(min, max, alpha, target){
    document.querySelector(target).style.background = "linear-gradient(to right, " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + ")";
};

/**
 * Adds a linear-gradient background to elements using random colors.
 * @param {integar} min lowest rgb value
 * @param {integar} max highest rgb value
 * @param {integar} alpha opacity
 * @param {string} target DOM element class/id/tag.
 */
function ItemsColors(min, max, alpha, targets){
    const elements = [].slice.call(document.querySelectorAll(targets)); //Turns nodeListOf from querySelectorAll into an array of objects.
    elements.map( element => element.style.background = "linear-gradient(to right, " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + " , " + randomRgba(min, max, alpha) + ")");
}

/**
 * Returns a random rgb. The range between min and max is how blight, or dark the random color will be.
 * @param {integar} min lowest rgb value
 * @param {integar} max highest rgb value
 */
function randomRgb(min, max){
    return "rgb(" + randomColor(min, max) + "," + randomColor(min, max) + "," + randomColor(min, max) + ")";
}

//Returns a random rgba, the higher the min value is, the blighter the colors will be. (Less than 255!)
//Alpha fades the colors out.
/**
 * Returns a random rgba. The range between min and max is how blight, or dark the random color will be. Alpha affects the opacity of the color. 
 * @param {integar} min lowest rgb value
 * @param {integar} max highest rgb value
 * @param {integar} alpha opacity
 */
function randomRgba(min, max, alpha){
    if(alpha > 1)
        alpha = 1;
    if(alpha < 0)
        alpha = 0;
    return "rgba(" + randomColor(min, max) + "," + randomColor(min, max) + "," + randomColor(min,max) + "," + alpha + ")";
};

/**
 * Wraps each of the letters inside target elements in a span wrapper, then apply random colors. 
 * @param {string} target DOM element
 * @param {integar} min lowest rgb value
 * @param {integar} max highest rgb value
 */
function letterings(min, max, target){
    target = [...document.querySelectorAll(target)];
    for(let i = 0; i < target.length; i++){
        let fancyText = "";
        for(let j = 0; j < target[i].innerHTML.length; j++){
            fancyText += "<span>" + target[i].innerHTML.charAt(j) + "</span>";
        }
        target[i].innerHTML = fancyText;
        target.forEach(element => {
            target.style.color = randomColor(min, max);
        });
    }
};