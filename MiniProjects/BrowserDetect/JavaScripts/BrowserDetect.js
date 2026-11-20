//http://stackoverflow.com/questions/2257597/reliable-user-browser-detection-with-php

function BrowserDetect() 
	{ 
		let body = document.body;
		if((navigator.userAgent.indexOf("Opera") || navigator.userAgent.indexOf('OPR')) != -1 ) 
		{
			body.innerHTML = "You're using Opera.";
		}
		else if(navigator.userAgent.indexOf("Chrome") != -1 )
		{
			//stackoverflow.com/questions/17278770/how-do-i-detect-chromium-specifically-vs-chrome
			for (var i=0; i<navigator.plugins.length; i++)
			if (navigator.plugins[i].name == 'Chromium PDF Viewer')
				body.innerHTML = "You're using Chromium.";
			else
				body.innerHTML = "You're using Chrome.";
		}
		else if(navigator.userAgent.indexOf("Safari") != -1)
		{
			body.innerHTML = "You're using Safari.";
		}
		else if(navigator.userAgent.indexOf("Firefox") != -1 ) 
		{
			body.innerHTML = "You're using Firefox.";
		}
		else if((navigator.userAgent.indexOf("MSIE") != -1 ) || (!!document.documentMode == true )) //IF IE > 10
		{
			body.innerHTML = "You're using IE."; 
		}
		else 
		{
			body.innerHTML = "I have no idea what you're using.";
		}
		
	}