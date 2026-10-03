Here, you can see how my codes grew from a random idea to something that can easily handle choose your own adventure books of any sizes! 

Prototype 1 was quite the mess and hard to read. This was my first pass at the idea. The best thing that came out of this one was the deletion and check functions, which I used in my prototype 2,3, and 4 without changing a single line of code. I came up with those two functions by studying .remove(). In a way, you can say that I made my own .remove() function that only works with IDs! I could set it up to work with classes by checking for . or # in the args, but that would bog down the program a bit.

I came up with the idea of using an array instead of if(page = 1), if(page = 2) and so on in Prototype 2.

I quickly found a better way of reading the array, which led to Prototype 3. What I came up with could quickly be readjusted to handle any new datafields in the page objects within the array... And those datafields can be optimal. See HelperScripts for how I quickly created the datafields and filled them with infomation from the books. 

In prototype 4, I found an even better way to create the array and account for the page numbers. It was at that point, I considered the logic side of my work done. 

The basic idea is to create page objects then print them to the screen within an element, kinda like how real books are like in real life!

The slideIn is a slide-in window prototype for the notebook in the final demo. I already had a working slide-in from one of my old projects, however, it was written in JQuery. I had to transtale it to plain JavaScript before moving it over to my main program. It also have cookies/localstorage in it.

PlotYourOwnAdventureRoughDraft is me figuring out how to import my JavaScripts from .JS files and use them. I'm, however, happy to say that it was easy as <Script src=""></Script> and done. No sweat at all. I still prototyped it anyway because well, prototyping is cool and is a good habit!