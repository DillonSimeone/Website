var viewW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
var viewH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

function circleOfLife(className, count){
	console.log("WORKING");
	var elems = document.getElementsByClassName(className);
	var increase = Math.PI * 2 / elems.length;
	var x = 0, y = 0, angle = count;
	var circleSize = 0.2;

	for (var i = 0; i < elems.length; i++) {
		var elem = elems[i];

		// modify to change the radius and position of a circle
		x = (viewW * circleSize/2) * Math.cos(angle) + (viewW * circleSize);
		y = (viewH * circleSize) * Math.sin(angle) + (viewH * circleSize * 2);
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

circleOfLife("colors", 20);



		