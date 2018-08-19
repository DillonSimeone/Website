		var open = false;
		var speed = 10; //Change this value to affect how quickly the notebook opens/closes.
		var x = 0;
		var localSupport = false;
		var cookieExists = false;
		
		//Credit: https://www.w3schools.com/html/html5_webstorage.asp
		function checkLocalStorage()
		{
			try //IE gets very upset if you're trying to use localStorage offline.
			{
				if (typeof(Storage) !== "undefined") 
				{
					// Code for localStorage/sessionStorage.
					localSupport = true;
					if(localStorage.getItem("Visited") != null)
					{
						//localStorage.setItem("Visited", "yes");
						reset = prompt("Do you want to reset? y/n");
						if(reset == "y")
							localStorage.clear();
					}
				} 
				else 
				{
					// Sorry! No Web Storage support..
					localSupport = false;
				}
			}catch(error){localSupport = false;}
			finally
			{
				if(localSupport == false)
					checkCookie(); //Checks if cookie exists...
			}
			
		}
		checkLocalStorage();
		
		//Credit: https://www.w3schools.com/js/js_cookies.asp
		function checkCookie() 
		{
			var visited = getCookie("visited");
			if (visited != "") 
			{
				console.log("Welcome again !");
				cookieExists = true; //Cookie already exists. Pull data from the cookie!
			} 
			else 
			{
				console.log("Weclome!");
				setCookie("visited", "Very yes." , 365);
				cookieExists = false; //Need to add data to the cookie.
			}
		} 
		
		//Credit: https://www.w3schools.com/js/js_cookies.asp
		function setCookie(cname, cvalue, exdays) 
		{
			var d = new Date();
			d.setTime(d.getTime() + (exdays*24*60*60*1000));
			var expires = "expires="+ d.toUTCString();
			document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
		}
		
		//Credit: https://www.w3schools.com/js/js_cookies.asp
		function getCookie(cname) 
		{
			var name = cname + "=";
			var decodedCookie = decodeURIComponent(document.cookie);
			var ca = decodedCookie.split(';');
			for(var i = 0; i <ca.length; i++) {
				var c = ca[i];
				while (c.charAt(0) == ' ') {
					c = c.substring(1);
				}
				if (c.indexOf(name) == 0) {
					return c.substring(name.length, c.length);
				}
			}
			return "";
		}
		
		function createNotebook()
		{
			//Creating fixed button that'll slide the notebook in/out from the left side of the screen.
			var nav = document.createElement("nav");
			var button = document.createElement("input");
			button.type = "button";
			button.value = "Notebook";
			button.onclick = function() //This was a hassle!
							{
								if(open == true)
								{
									closeNotebook();
									open = false;
								}
								else
								{
									openNotebook();
									open = true;
								}
							}
			nav.appendChild(button);
			document.body.appendChild(nav); //Since the nav element is fixed, it don't really matter what order the element is inserted in. Personally, I would insert the element before everything else.
			
			//Finally creating the notebook now.
			var notebook = document.createElement("div");
			notebook.id = "notebook"; 
			var title = document.createElement("h1");
			var text = document.createTextNode("The amazing Notebook!");
			title.appendChild(text);
			notebook.appendChild(title);
			
			//Adding textfields for clues to the notebook.
			//If cookie.asdas and localStorage.asdas doesn't exists... Else, ask user if it's okay to load up their notes.
			var textfield = document.createElement("div");
			textfield.id = "textfield";
			for(var i = 1; i < 12; i++)
			{
				text = document.createElement("input");
				text.type = "text";
				text.placeholder = "Clue " + i;
				text.onkeyup = function()
									{
										//Save to cookie/localeStorage when keys is released.
										if(localSupport)
										{
											//Save to Local
											localStorage.setItem(this.placeholder, this.value);
										}
										else
										{
											//Save to Cookie.
											setCookie(this.placeholder, this.value, 666);
										}	
									}
				//If cookie/Locale exists...
				if(localSupport) //The value for this is set to true if localStorage can be used.
				{
					//Check LocalStorage data.
					text.value = localStorage.getItem(text.placeholder);
				}
				else
				{
					//Check cookie.
					text.value = getCookie(text.placeholder);
				}
				textfield.appendChild(text);
			}
			notebook.appendChild(textfield);
			
			//Adding check boxes to the notebook.
			var boxes = document.createElement("div");
			boxes.id = "boxes";
			for(var i = 1; i < 9; i++)
			{
				var box = document.createElement("img");
				box.src = "./media/emptyCheckBox.png";
				box.name = "Box " + i;
				box.alt = "Unchecked Box"
				box.onclick = function()
								{
									if(this.alt == "Checked Box" )
									{
										this.src = "./media/emptyCheckBox.png"
										this.alt = "Unchecked Box";
										//Save to cookie/locale
										if(localSupport)
										{
											//Save to Local
											localStorage.setItem(this.name, "./media/emptyCheckBox.png");
										}
										else
										{
											//Save to Cookie.
											setCookie(this.name, "./media/emptyCheckBox.png");
										}
									}
									else
									{
										this.src = "./media/checkedCheckBox.png";
										this.alt = "Checked Box";
										if(localSupport)
										{
											//Save to Local
											localStorage.setItem(this.name, "./media/checkedCheckBox.png");
										}
										else
										{
											//Save to Cookie.
											setCookie(this.name, "./media/checkedCheckBox.png", 666);
										}
										//Save to cookie/locale
									}
								}
				if(localSupport) //The value for this is set to true if localStorage can be used.
				{
					//Check LocalStorage data.
					if(localStorage.getItem(box.name) != null)
						box.src = localStorage.getItem(box.name);
					
					if(localStorage.getItem(box.name) == "./media/checkedCheckBox.png")
						box.alt="Checked Box";
				}
				else
				{
					//Check cookie.
					if(getCookie(box.name) != null)
						box.src = getCookie(box.name);
					
					if(getCookie(box.name) == "./media/checkedCheckBox.png")
						box.alt="Checked Box";
				}
				boxes.appendChild(box);
			}
			notebook.appendChild(boxes);
			
			//Making notes section
			var notes = document.createElement("textarea");
			try
			{
				notes.type = "textarea";
			}catch(error){}
			
			notes.placeholder = "Document your thoughts here."
			notes.id = "notes";
			notes.onkeyup = function()
							{
								//Save to cookie/localeStorage when keys is released.
								if(localSupport)
								{
									//Save to Local
									localStorage.setItem(this.placeholder, this.value);
								}
								else
								{
									//Save to Cookie.
									setCookie(this.placeholder, this.value, 666);
								}	
							}
			if(localSupport) //The value for this is set to true if localStorage can be used.
				{
					//Check LocalStorage data.
					notes.value = localStorage.getItem(notes.placeholder);
				}
				else
				{
					//Check cookie.
					notes.value = getCookie(notes.placeholder);
				}
			notebook.appendChild(notes);
			
			document.body.appendChild(notebook);
		}
		createNotebook();
		
		//Closes the notebook!
		function closeNotebook() 
		{
			x += speed;
			document.getElementById("notebook").style.marginLeft = '-' + x + 'px';
			
			if(x > 300 || x < 0)
				x = 0;
				
			if(x != 300)
				try
				{
					requestAnimationFrame(closeNotebook);
				}catch(error)
				{
					closeNotebook();
				}
		}
		closeNotebook();
		
		//Opens the notebook!
		function openNotebook() 
		{
			x -= speed;
			document.getElementById("notebook").style.marginLeft = '-' + x + 'px';
			
			if(x > 300 || x < 0)
				x = 0;
				
			if(x != 0)
				try
				{
				requestAnimationFrame(openNotebook);
				}catch(error)
				{
					openNotebook();
				}
		}