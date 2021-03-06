var viewW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
var viewH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

function circleOfLife(className, count){
	var elems = document.getElementsByClassName(className);
	var increase = Math.PI * 2 / elems.length;
	var x = 0, y = 0, angle = count;

	for (var i = 0; i < elems.length; i++) {
		var elem = elems[i];
		// modify to change the radius and position of a circle
		x = viewW/2.3 * Math.cos(angle) + viewW/1.1;
		y = viewH/1.7 * Math.sin(angle) + viewH/2;
		elem.style.position = 'fixed';
		elem.style.left = x + 'px';
		elem.style.top = y + 'px';
		//need to work this part out
		/*
		var rot = 90 + (i * (360 / elems.length));
		elem.style['-moz-transform'] = "rotate("+rot+"deg)";
		elem.style.MozTransform = "rotate("+rot+"deg)";
		elem.style['-webkit-transform'] = "rotate("+rot+"deg)";
		elem.style['-o-transform'] = "rotate("+rot+"deg)";
		elem.style['-ms-transform'] = "rotate("+rot+"deg)";
		*/
		angle += increase;
		//console.log(angle);
	}
	//return count;
}

function random_rgba(){
			var o = Math.round, r = Math.random, s = 255;
			return 'rgba(' + o(r()*s) + ',' + o(r()*s) + ',' + o(r()*s) + ',' + r().toFixed(1) + ')';
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


var parent = document.getElementById("background");		
var words = "C#, Java8, JavaScript, HTML5 and CSS3, PHP, SQL, Python, C, C++, Window XP - Window 10, Unix/Linux, MAC OSX, Android, Microsoft Visual Studio, Notepad++, Sublime Text, JGrasp, Brackets, Filezilla, MySQL, DD-WRT, Deep Freeze, Creation of ethernet cables, basic hardware repairs, Version Control, search engines, HTML, CSS, Java8, Server-sided programming, Malwarebytes, SSL Certificate configuration and management, .htaccess, access levels, Website optimization , basic automation of simple tasks, search engine optimization";
words = words.split(",");
words = shuffle(words);
words.forEach(
	function(word, index){
		var element = document.createElement("h1");
		element.className = "circleOfLife";
		var text = document.createTextNode(word);
		element.appendChild(text);
		element.style["color"] = random_rgba();
		element.style["font-size"] = 1 + Math.floor(Math.random() * 0.5) + 'em';
		parent.appendChild(element);
	}
);

var children = parent.childNodes;
var chosenChildren = [];
children.forEach(
	function(child, index){
		if(child.nodeType != 3) //3 is text nodes. I want only the dom elements.
			chosenChildren.push(child);
	}
);

chosenChildren.forEach(
	function(child, index)
	{
		child.style["top"] = (5 + 1)* (Math.random() * 5)+ "%";
		child.style["left"] = (5 + 1)* (Math.random() * 5)+ "%";
	}
);
				
circleOfLife("circleOfLife", 0);

var count = 0;
var ticker = 0;
		
function mousePostion(e){
	ticker++;
	if(ticker == 10){
		console.log("Rotating circle");
		count += 0.1;
		circleOfLife("circleOfLife", count);
		ticker = 0;
	}
}

var oldAcceleration = 0;
var newAcceleration = 0;

var turn = 0;
if (window.DeviceMotionEvent != undefined){
	window.ondevicemotion = function(event) {
		var accelerationX = event.accelerationIncludingGravity.x;
		var accelerationY = event.accelerationIncludingGravity.y;
		var accelerationZ = event.accelerationIncludingGravity.z;
		newAcceleration = Math.floor(accelerationY);
		if(newAcceleration < 0)
			newAcceleration *= -1;
		if(newAcceleration != oldAcceleration){
			oldAcceleration = newAcceleration;
			ticker++;
			count += 0.1;
			//data.innerHTML = "<ul>" + "<li>Accelration Y: " + newAcceleration + "</li>" + "<li>Pervious Y input: " + oldAcceleration + "</li>" + "<li>Acceleration X: " + accelerationX + "</li>" + "<li>acceleration Z: " + accelerationZ + "</li></ul>";
			if(ticker == 5){
				circleOfLife("circleOfLife", count);
				ticker = 0;
				}
		}
	}
}


window.addEventListener('resize', mousePostion);
window.addEventListener('mousemove', mousePostion);