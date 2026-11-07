PROJECT 2 READ-ME.TXT

Project 2 URL: https://people.rit.edu/dys8701/projects/clientprogramming/project2/

Author: 
	Dillon Simeone

About Project 2:
	I made a nightmarish website. When I heard that a website from hell instead of a website from heaven was allowed, I knew right away what I wanted to do.
	
	It was quite challenging for me to do EVERYTHING wrong for the website... The only thing I did right was to ensure that the website would work perfectly. There's only one error being thrown, and that's actually coming from this page: http://www.ist.rit.edu/api/contactForm/, not my website. 
	
	I couldn't completely disregard the coding standards, and so, everything is indented pretty well. I've seen some indenting jobs out there that I still have nightmares about to this day. Everything else, however, I tried to be creative as possible with.
	
	For confirming that I have all AJAX calls and is parsing them correctly, I recommand skimming through my scripts instead of forcing yourself to read the website. I've made comments that should make it clear what AJAX calls is for what, and what those calls are returning, and where the infomation is being pushed to on the website.
	
	Warning:
		If you're wearing earphones, remove them. I *think* it's loud. I don't know, I'm deaf.
		In the first half of the website, the colors changes really quickly. Completely randomized.
		The website is PURE cancer. There is literally nothing good about the website aside from how bad it is.
	
	Project 2 Functions:
	
		On page load, you land into the center of the website due to the complete lack of a spinner. Having a spinner would improve the website instead of making the website worse!
	
		The 'about' texts start randomly changing based on your cursor postion after five seconds, along with a few other annoying effects.
		
		The colored boxes are clickable, in the top-half of the current website. Click them! If you can't handle the nightmare due to the dialog windows shaking too much to close them, pressing ESC will close the dialog window.
		
		Note the tables just before the INTEREST AREA, recoil in horror at how they're cramped into tiny scrollable divs!
		
		Hover over the Faculty pictures in the tabs for some fun pop-up divs! Don't mind the watching eyes, and note how I also abused the scrollbars there. 
		
		Click on the Faculty pictures to bring up more infomation on them.
		
		Click on the Staff tab, note how the styles doesn't match up with the Faculty tab.
		
		Click on the Staff pictures to bring up more infomation on them.
		
		Right-click anywhere on the website to get a surpise.
		

Project 2 Notes:
		There's a quite lot going on aside from the AJAX calls.
		
		AJAX Calls:
			Note:
				On the week of 4/10/2017, I was unable to get five of the ajax calls to work as expected. I got lost in the JSON structure. I plan to attempt to find my way around the JSON maze once again on 4/14/2017 after sleeping. Maybe this isn't for a human to parse by hand...Pointless as reading machine code... Maybe I SHOULD find a JSON GUI that'll let me parse those JSON files easily, like the GUI-maker in Visual Studio. Hmm.
			
				Update:
					I found an excellent GUI that made it much easier for me to read the JSON files: http://jsonmate.com/
				
					I'm happily recommanding JsonMate to everyone I know! It greatly cut down on the amount of console.log() I needed in my code to figure out if I'm reading the JSON files correctly.
		
			Unfinished AJAX calls:
				
		
			Finished AJAX calls:
				about,
				people,
				Degrees,
				Minors,
				employment,
				resources,
				research,
				news,
				footer,
				courses
		
		Plugins:
			1. JQuery UI: https://jqueryui.com/
			2. Lettering: http://letteringjs.com/
			3. FartScroll: http://theonion.github.io/fartscroll.js/
			4. Raptorize: http://zurb.com/playground/jquery-raptorize
			5. Vide: http://vodkabears.github.io/vide/
			6. JqEye: https://github.com/jfmdev/jqEye
		
		Plugins Remarks:
			The Lettering plugin is quite amazing if you know how to use JQuery's selectors to select each nth child, even more so if you use selectors like this: p:nth-child(3n+2)
			
			I added the FartScroll plugin and enabled it without a thought. I'm deaf.
			
			The Raptorize near killed me! That plugin is amazing! I had to update it myself, which is why the sounds is a bit... Broken among with a few other things. Each time the dinosaur appears, it creates a new dinosaur element and play the dash animation. I could fix that, but that would be improving the website, not worsening the website!
			
			Vide is pretty cool, in how it sets up everything. It takes the video whatever, and make a div under everything and play the video in that div. It seems to be a bit faster than me making a div element, then shoveling in a video player and fiddling with the Z-index until the video's playing behind all other elements instead of in front of them.
			
			JqEyes! Eyes, because, why not! EYES EYES EYES EYES
			
		Nightmare FUNctions:
			facMore/degMore/minMore:
				Makes elements clickable, and pulls infomation from the people/degree/miniors JSON file for the pop-up dialog. Also forces full screen, and scrolls the user up to the top! The facMore function is shockily effective due to how it makes names to appear all over the screen if you hover over the pictures in the tab. Annoying enough to cause me to refresh the website page right away!
			
			Rainbow:
				This function is really really frigging annoying! I kept it disabled for my testings of the website. That's how annoying it is! I made this function to take full advantage of the Lettering plugin.
				
			The other functions are pretty much what they say on the tin, IE; scrollUp, getRandomColor, etc... The only noticeworthy one among those functions is toggleFullScreen. I discovered that bit of script in the deep web when a website tried to lock my browser up. It was fun dissecting that website.
			
Why should I get an A:
	This website is pure cancer. I don't even want to look at it at all, when I do, I feel like flipping over my table! After this project is graded, I'm purging the project with extreme prejudice!
	
	I believe I've successed in creating a website, straight from hell.
				
			
				