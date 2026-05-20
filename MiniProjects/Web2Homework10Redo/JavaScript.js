

function randomColor(){
    return "rgb(" + Math.floor(Math.random()*255) + "," + Math.floor(Math.random()*255) + "," + Math.floor(Math.random()*255) + ")";
}

function colorsArray(amount){
    let colors = [];
    for(let i = 0; i < amount; i++){
        colors.push(randomColor());
    }
    return colors;
}

function setBgcolor(element){
	document.body.style.backgroundColor = element.style.backgroundColor;
	let text = document.getElementsByClassName("text")[0];
	text.innerHTML = element.style.backgroundColor;
	text.style.marginLeft = parseInt(text.style.marginLeft.replace("px", "")) + 10 + "px"
}

function slideryColors(element){
    setUpColors(colorsArray(element.value));
}

function setUpSlider(){
    var div = document.createElement('div');
    
    var label = document.createElement('label');
    label.setAttribute("for", "colors");
    label.innerHTML = "Drag slider to change amounts of random colors displayed";
    div.appendChild(label);
    
    var input = document.createElement('input');
    input.setAttribute('type', 'range');
    input.setAttribute('id', 'colors');
    input.setAttribute('name', 'colors');
    input.setAttribute('min', '8');
    input.setAttribute('max', '100');
    input.value = 8;
    input.style.width = "80%";
    input.style.margin = "auto";
    input.addEventListener("input", function(){slideryColors(this);});
    div.appendChild(input);
    
    document.body.appendChild(div);
}

function setUpText(){
    var amazingText = document.createElement('p');
    amazingText.className = "text";
    amazingText.innerHTML = "rgb(0,0,0)";
    amazingText.style.fontSize = "2em";
    amazingText.style.marginLeft = "0px";
    document.body.appendChild(amazingText);
}

function setUpColors(colors){
    var viewW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
	var viewH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
	
    while(document.body.childElementCount > 3){ //Meh, just purge everything that isn't the first or second child, which is the slider and text.
        document.body.removeChild(document.body.lastChild);
    }
    
    var palette = document.createElement('div');
    palette.className = "palette";
    //palette.style.display = "flex";

    for(let i = 0; i < colors.length; i++){
        let heightAndWidth = (viewW/viewH * 0.25) * (Math.floor(Math.random() * 50) + 50) + "px";
        let color = document.createElement('div');
        color.className = "colors";
        color.style.backgroundColor = colors[i];
        color.style.border = Math.floor(Math.random() * 5) + 1 + "px solid black";
        color.style.height = heightAndWidth;
        color.style.width = heightAndWidth;
        color.addEventListener("click", function(){setBgcolor(this)});
        palette.appendChild(color);
    }

    document.body.appendChild(palette);
	circleOfLife("colors", 20);
}

function circleOfLife(className, count){
	var viewW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
	var viewH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
	var elems = document.getElementsByClassName(className);
	var circleSize = 0.5;
	var increase = Math.PI * 2 / elems.length;
	var x = 0, y = 0, angle = count;
	
	for (var i = 0; i < elems.length; i++) {
		var elem = elems[i];

		// modify to change the radius and position of a circle
		x = (viewW * circleSize/2) * Math.cos(angle) + (viewW * circleSize);
		y = (viewH * circleSize/2) * Math.sin(angle) + (viewH * circleSize + 10);
		elem.style.position = 'fixed';
		elem.style.left = x + 'px';
		elem.style.top = y + 'px';
		//need to work this part out
	
		var rot = 90 + (i * (360 / elems.length));
		elem.style['-moz-transform'] = "rotate("+rot+"deg)";
		elem.style.MozTransform = "rotate("+rot+"deg)";
		elem.style['-webkit-transform'] = "rotate("+rot+"deg)";
		elem.style['-o-transform'] = "rotate("+rot+"deg)";
		elem.style['-ms-transform'] = "rotate("+rot+"deg)";
	
		angle += increase;
		//console.log(angle);
		console.log(elem);
	}
	//return count;
}

function random_rgba(){
			var o = Math.round, r = Math.random, s = 255;
			var red = o(r()*s);
			var green = o(r()*s);
			var blue = o(r()*s);
			return 'rgba(' + red + ',' + blue + ',' + green + ',' + (r() * (0.3 - 1) + 1).toFixed(1) + ')';
}

function shuffle(array){
		  var currentIndex = array.length, temporaryValue, randomIndex;

		  // While there remain elements to shuffle...
		  while (0 !== currentIndex) {

			// Pick a remaining element...
			randomIndex = Math.floor(Math.random() * currentIndex);
			currentIndex -= 1;

			// And swap it with the current element.
			temporaryValue = array[currentIndex];
			array[currentIndex] = array[randomIndex];
			array[randomIndex] = temporaryValue;
		  }

		  return array;
}

setUpSlider();
setUpText();
setUpColors(colorsArray(8));




