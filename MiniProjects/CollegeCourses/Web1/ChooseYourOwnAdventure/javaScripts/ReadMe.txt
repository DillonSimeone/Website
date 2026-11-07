PageLoader is a script that works with what's in the story.js. 

Functions:

createBook();

This creates the container for the pages to be loaded into via the loadPage function.

loadPage(page, num2)
Page is the page to load, and num2 is the ID to give to the div holding the page so deletion is easier. The script already handles num2, so common useage of this script would be:

loadPage(1,1);

That would load the first page, and give its container a ID of 1. From that point and on, the loadPage() method will attach itself to options in the selection menus it creates, which pulls its values from the story.js's goTo datafield, which is the page number to go to. The ID auto increases after each page is spawned, and is passed to loadPage() each time it calls itself.

Because of the way this function is designed, I can make a quite a lot of effects to happen on each page load. For example, randomly fading in from the left/right, and so on. The reason I didn't bother with those kind of effects for my final demo is that the scrollDown() function worked much better than expected. Adding fade-in effects, and whatever seemed massively overkill at this point. But if anyone requested those effects, I could add them easily!

scrollDown();

This is a function I came up with after becoming annoyed at having to scroll so much. I looked around for a way to stop the scrollbar when it reaches the bottom of the page, but... Sadly, there wasn't any ways to determine that through JavaScript far as I could tell. The JavaScript function for scrolling down to the bottom of the page didn't work for some reason, so I just made a quick script that scrolls by x px each y ms for z ms. Pretty simple! Even if a user was to quickly select options after options without reading anything at all, this won't cause issues with the user trying to scroll up, since it runs for so little time. 

remove();

This is used in loadPage(). It's very alike to JQuery's .remove() function expect that it only handles elements with ids.

exists();

This is used in loadPage, and is meant to be used in a loop with remove(); to determine if you're actually looking at something that can be removed, or you're just stumbling around in the dark deleting nothing.

So, to properly use this script, just fill in story.js with whatever after spawning the pages you need with the .PHP script in the HelperScript folder (to select-all and paste into your story.js)...

You just add 
<script>
			createBook();
			loadPage(1, 1);
</script>

To the body, after loading all of the scripts in the header (<script src="../javaScripts/story.js"></script> <script src="../javaScripts/pageLoader.js"></script>).

Pretty simple!