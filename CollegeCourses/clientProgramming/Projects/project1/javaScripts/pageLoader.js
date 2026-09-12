	//Note to self:
	//STORE CURRENT ID
	//STORE CURRENT PAGE
	//PROMO on page load if cookie/locale storage have current page. Load? y/n
	//If n, devare storage and start on page 1.
	//If y, loads ONLY last page, since the story loops.
	
	var id = 1;
	
	//This creates the container for the pages to be loaded into.
	function createBook()
	{	
		var elem = text = document.createElement("form");
		elem.id = "superform";
		document.body.appendChild(elem); //Adds the form element to the body.
	}
	
	//var there be light!
	//Creates the pages to be loaded into the form createBook() makes.
	function loadPage(page, num2)
	{
		if(num != 0)
		{
			var div;
			var img;
			var text;
			var select;
			var option;
			var node;
			var pageOffSet = 1;  
			var num = parseInt(page) + pageOffSet; //I had to use this because in story.Js, I used spot 0 as an example for how a page object should be made in the array.
			var form = document.getElementById('superform');
			
				
			//Devares any newer options than current option.
			//This MUST run BEFORE anything is spawned. Else, nothing works.
			var loop = true;
			var identity = parseInt(num2) + 1; //num2 is the ID of the div with the story and whatever in it. Don't worry about memorizing what num2 is, it's only used in this section.
			do
			{
				if(exists(identity))
				{
					remove(identity);
					id -= 1;
				}
				else
				loop = false;
				identity++;
			}while(loop)
			//End of devarion loop.
				
			div = document.createElement("div");
			div.id = id; //This is how the devarion loop is able to find the correct divs to devare.
				
			if(pages[num].title != "" && pages[num].title != null) //The way this is set up, a title for each page is optimal.
			{
				text = document.createElement("h1");
				node = document.createTextNode(pages[num].title); 
				text.appendChild(node);
				div.appendChild(text);
			}
				
			if(pages[num].story.length != 0)
			{
				for(var i = 0; i < pages[num].story.length; i++)
				{
					text = document.createElement("p");
					node = document.createTextNode(pages[num].story[i]); //Pulls the text in the story array of pages.
					text.appendChild(node); //Appends the text to the newly created p element.
					div.appendChild(text); //Puts the p element into the div.
				}
			}
			//If you wanted, you could add an else here to create a p element and add some texts to it to be added to the div, then to the body if there's no text to be found in the body datafield.
			//Like, "And you live happily after all", or "This is a bug. Contact Blah@gmail.com with a screenshot of this and the previous choice.", etc.
			
			//This makes the select drop-down menus, which is how users move around in the story.
			select = document.createElement("select");
			select.name = id; //This is how the ID is passed onto the loadPage so the devarion loop can find the right divs and remove them. Creative, huh?
			select.onchange = function()
			{
				if(this.value != 0) //If this if statement is not used, clicking on 'select' would break the program since it would try to load page 0 with a null name as the id.
				{
					loadPage(this.value, 
					parseInt(this.name))
				}
			};
			
			//Creating default 'Select' option. If you don't make a default select option, opening the select menus then clicking on the first option would not fire the onclick script.
			option = document.createElement("option");
			option.value = 0; //This is how the script on line 72 knows to ignore the option if someone tries to break the program by clicking around randomly.
			node = document.createTextNode("Select");
			option.appendChild(node);
			select.appendChild(option);
                
			//PICTURES! SUCH AWE!
			//Pictures can be GIF, PNG, JPG, whatever.
			if(pages[num].image != "")
			{
				img = document.createElement("img");
				img.src = pages[num].image;
				div.appendChild(img);
			}
				
			//Creating choices from datafields in Array.
			if(pages[num].choices.length != 0)
			{
				for(var i = 0; i < pages[num].choices.length; i++)
				{
					option = document.createElement("option");
					option.value = pages[num].goTo[i]; //This is the page number to go to.
				
					node = document.createTextNode(pages[num].choices[i]);
					option.appendChild(node);
					select.appendChild(option);
				}
				div.appendChild(select);
			}
			else //If there's no choices to be spawned, "THE END" (Or any texts of your choosing) is spawned instead. 
			{
				text = document.createElement("h2");
				node = document.createTextNode("THE END");
				text.appendChild(node);
				div.appendChild(text);	
			}
				form.appendChild(div);
			}
            scrollDown(); //What it says on the tin, pretty much.
			id++; //This is important. Don't touch! If you remove this, all divs holding the stories would have an ID of 1, and that would just wreck everything!
		}
		
        //This scrolls down the page to the bottom. Imagine scrolling and scrolling for possibly thousands of pages! Screw that!
        function scrollDown() 
            { 
			try
			{
                scroll = setInterval(function()
                                    { 
                                        window.scrollBy(0, 15); //Scrolls by x pixel, y pixel...
                                    }, 10); //Per z ms...
                setTimeout(function(){ clearInterval(scroll); }, 1000); //For c seconds.
			}catch(error){}
            }
		
		//The devarion function. This is very alike to JQuery's .remove() function, expect that it only works with IDs instead of both Id and Class, which probably speeds up the program by a bit.
		function remove(ids)
			{
				var elem = document.getElementById(ids); //"Huh!? There's a thing!?"
				
				if(elem) //"Sight line confirmed, aiming!"
					elem.parentNode.removeChild(elem); //"Shooting the thing! BAM BAM BAM BAM"
			}
		
			//Checks if an element exists or not. Meant to be used with the remove function in a loop to be sure that you're not trying to remove nothing from nothing.
			function exists(ids)
			{
				var elem = document.getElementById(ids);
				if(elem == null)
					return false; //"There's nothing there!"
				else
					return true; //"There's something there! Shoot it!"
			}