var slideOut = false;
		
		function createNotebook()
		{
			//Creating button to slide out Notebook with.
			let elem = document.createElement("nav");
			let elem2 = document.createElement("input");
			elem2.value = "Notebook";
			elem2.type = "button";
			elem2.onclick = function()
							{
								if(slideOut = false)
								{
									console.log("Not out");
									//Slides Notebook out.
								}
								else
								{
									console.log("Is out.");
									//Slides Notebook in.
								}
							};
			elem.appendChild(elem2);
			document.body.insertBefore(elem, form);
			
			//Creating Notebook.
			elem = document.createElement("div");
			elem.id = "notebook";
			elem2 = document.createElement('h1');
			let text = document.createTextNode('NOTEBOOK');
			elem2.appendChild(text);
			elem.appendChild(elem2);
			
			
			//Creating 11 clue textfields.
			let div = document.createElement('div');
			div.id = "textfields";
			for(let i = 1; i < 12; i++)
			{
				elem2 = document.createElement('input');
				elem2.type = "text";
				elem2.placeholder = "Clue " + i;
				div.appendChild(elem2);
			}
			elem.appendChild(div);
			
			//Creating tick boxes
			div = document.createElement('div');
			div.id = "tickBoxes";
			for(let i = 1; i < 12; i++)
			{
				elem2 = document.createElement('img');
				elem2.src = "./media/emptyCheckBox.png"
				elem2.onclick = function()
				{
					if(this.src != "./media/emptyCheckBox.png")
						this.src = "./media/emptyCheckBox.png"
					else
						this.src = "./media/checkedCheckBox.png"
						
						console.log("WORKING");
				}
				div.appendChild(elem2);
			}
			elem.appendChild(div);
			document.body.insertBefore(elem, form);
			
		}
		//createNotebook()