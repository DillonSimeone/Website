<?php
include './style/header.php';
include './style/nav.php';
?>
    <article>
        <h1>About</h1>
        <h2> UNIX101 </h2>
	<p>
		UNIX101 is a collaboration formed with the goal to teach users to understand and master UNIX concepts and commands. To do this, we provide chapters covering
		various concepts and commonly used commands. We also further reinforce our lessons with quizzes and a unix sandbox. Anyone can use this website regardless of their
		experience with unix, this is a place for beginners to learn, and for advanced to recall. 
	</p>

	<h2> The Creators</h2>
	<div id="gods">
		<figure>
			<img src="<?php echo $BASE_URL . 'image/pngs/dillon.png' ?>" alt="Dillon, the overlord">
			<figcaption>
				<p>Dillon, the amazing coder.</p>
			</figcaption>
		</figure>
		
		<figure>
			<img src="https://scontent.xx.fbcdn.net/t31.0-8/14589794_1302000259812960_6297407947437462119_o.jpg" alt="Alex, the straving artist.">
			<figcaption>
				<p>Alex, the straving artist.</p>
			</figcaption>
		</figure>
		
		<figure >
			<img src="<?php echo $BASE_URL . 'image/jpg/david.jpg' ?>" alt="David, the figurehead.">
			<figcaption>
				<p>David, the figurehead.</p>
			</figcaption>
		</figure>
		
		<figure>
			<img src="https://i.ytimg.com/vi/YK4RDWDwuLQ/hqdefault.jpg" alt="Jose, the pirater.">
			<figcaption>
				<p>Jose, the pirater.</p>
			</figcaption>
		</figure>
		
		<figure style="opacity: 0.3;">
			<img src="https://scontent.xx.fbcdn.net/v/t1.0-9/13267767_10154269648207922_1632770309053753882_n.jpg?oh=b92976632a115f21c7c5c1ae6c0537fa&oe=58C118DF" alt="Charlie, Abandoned pirate.">
			<figcaption>
				<p>Charlie, Abandoned pirate.</p>
			</figcaption>
		</figure>
	</div>
	
	<div>
		<p> Dillon Simeone: The Coder. Dillon programs the scripts, man the databases, and ensure that the website works on any devices. </p>
		<p> David Mauriello: The Presenter. David reviews the content and website to ensure that they're readable, ensures the design fits with the intended perspective.</p>
		<p> Jose Lopez: The Source. Jose searches the internet to bring content that best teaches the commands and concepts of unix.</p>
		<p> Alex Talbert: The Artist. Alex creates all of the images and logos that helps make this website informative and unique.</p>
		<p> Charlie Hurley: The Forgetten. Rest in peace.</p>
	</div>
    </article>
	
	<article>
	<div id="overlord">
			<h1>Evil Overlord's <s>note to minions:</s> Records</h1>
			<img src="http://images.gameskinny.com/gameskinny/70028207ee89a1164d02618dd35261a5.jpg" alt="Overlord">
		</div>
		
	<p>
		<s>
			If you want to take on a unallocated job,
			let Dillon know so he can add the job to your list,
			so no one else will end up doing the same work.
		</s>
	</p>
	
	<p>
		<s>
			If you finish your work, 
			let Dillon to know so he can remove the job from the list.
		</s>
	</p>
	
	<p>
		<s>
			The list is for everyone in the group to work on when they can, and keep track of our progress.
		</s>
	</p>
	
	<p>
		This is a record of what work everyone in the group did.
	</p>
	
	<div id = "doomsday">
		Progress to Doomsday: <progress id="progressBar"></progress>
	</div>
	
	<h2>Group members:</h2>
	<ul>
	<li> <b>Dillon</b> (Overlord) </li>
	<li> <b>David</b> (Figurehead) </li>
	<li> <b>Jose</b> (Pirate) </li>
	<li> <b>Alex</b> (Straving artist) </li>
	</ul>
	
	<h1>Things to do:</h1>

	<h2>Dillon</h2>
		<div>Uncompleted Tasks: <p id="dillonuc"></p></div>
		<div>Completed Tasks: <p id="dillonc"></p></div>
	<ol id="dillon">
		<li><s>Fixed Nav Bar </s></li>
		<li><s>Make .PHP page for FAQ </s></li>
		<li><s>Make .PHP page for About </s></li>
		<li><s>Make .PHP pages for Account, settings, mastered chapters, etc </s></li>
		<li><s>Make .PHP pages for Quizzes </s></li>
		<li><s>Make .PHP pages for Chapters </s></li>
		<li><s>Implement Task Lists for everyone</s></li>
		<li><s>Improve Stylings</s></li>
		<li><s>Make website more mobile friendly</s></li>
		<li><s>Membership login</s></li>
		<li><s>Member login database</s></li>
		<li><s>.PHP script for determining what to display under the account button. (Sign up/Login if not logged in, else, log out, settings, etc.)</s></li>
		<li><s>Add slide-in Unix code sandbox via JavaScript</s></li>
		<li><s>Comment database and add comments to chapters pages</s></li>
		<li><s>Add Jumpscares</s></li>
		<li><s>Link all Credits to <a href="http://www.ee.surrey.ac.uk/Teaching/Unix/">website</a>(Why was this wasn't done in the first place...?)</s></li>
		<li><s>Make forms for quizzes via .PHP</s></li>
		<li><s>Favoicon</s></li>
		<li><s>Make summary tables at end of each chapters</s></li>
		<li><s>Clean up CSS and HTML</s></li>
		<li><s>Add an easter egg</s></li>
		<li><s>Evilly think up more jobs to do</s></li>
	</ol>

	<h2>David</h2>
		<div>Uncompleted Tasks: <p id="daviduc"></p></div>
		<div>Completed Tasks: <p id="davidc"></p></div>
	
	<ol id="david">
		<li><s>Credit all resources taken from the unix tutorial <a href="http://www.ee.surrey.ac.uk/Teaching/Unix/">website</a></s></li>
		<li><s>Add more content to 'Unix Tutorial for users of all levels' on <a href="https://people.rit.edu/dys8701/groupProjects/Unix101/index.php">main page</a> (Introduction, what is this website for?)</s></li>
		<li><s>Come up with basic styling</s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'about.php' ?>">About</a> page</s></li>
		<li><s>Format Jose's Quizzes. (What went so wrong on Jose's side...!?)</s></li>
		<li><s>Format Jose's Contents. (What went so wrong on Jose's side...!?)</s></li>
		<li><s>Make Quizzes 6-8</s></li>
		<li>Quality Check</li>	
	</ol>
	
	<h2>Alex</h2>
		<div>Uncompleted Tasks:<p id="alexuc"></p></div>
		<div>Completed Tasks:<p id="alexc"></p></div>
		
	<ol id="alex">
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterOne.php' ?>">Chapter One</a></li>
		<li><s>Logo</s></li>	
	</ol>

	<h2>Jose</h2>
		<div>Uncompleted Tasks: <p id="joseuc"></p></div>
		<div>Completed Tasks: <p id="josec"></p></div>
		
	<ol id="jose">
		<li><s>Credit all resources taken from the unix tutorial <a href="http://www.ee.surrey.ac.uk/Teaching/Unix/">website</a></s></li>
		<li><s>Make Quizzes 1-5</s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'FAQ.php' ?>">FAQ</a> page</s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101Quiz.php' ?>">Quiz</a> page</s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101.php'?>">Chapters</a> page</s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterOne.php' ?>">chapter One</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterTwo.php' ?>">chapter Two</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterThree.php' ?>">chapter Three</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterFour.php' ?>">chapter Four</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterFive.php' ?>">chapter Five</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterSix.php' ?>">chapter Six</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterSeven.php' ?>">chapter Seven</a></s></li>
		<li><s>Add more Content to <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterEight.php' ?>">chapter Eight</a></s></li>
	</ol>
	
	<h2>Unallocated</h2>	
		<ol id="unallocated">
		</ol>
		
	<h2>Cancelled</h2>
	<ol>
		<li>Replace Header Background with <a href="http://thecodeplayer.com/walkthrough/matrix-rain-animation-html5-canvas-javascript">Martix JavaScript/Canvas.</a> (When resized, the falling letters becomes super pixelized.)</li>
		<li>Donation Button (Pointless.)</li>
		<li>Search Bar (Website is not big enough to bother with that.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterOne.php' ?>">chapter One</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterTwo.php' ?>">chapter Two</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterThree.php' ?>">chapter Three</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterFour.php' ?>">chapter Four</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterFive.php' ?>">chapter Five</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterSix.php' ?>">chapter Six</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterSeven.php' ?>">chapter Seven</a> (No one could think of anything.)</li>
		<li>Make better graphic assets for <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterEight.php' ?>">chapter Eight</a> (No one could think of anything.)</li>
		<li>Code up a randomizer for the random quiz (Out of time!)</li>
	</ol>


	<p>
    PHP tests:
	<br>
	$_SERVER['DOCUMENT_ROOT']: <?php echo $_SERVER['DOCUMENT_ROOT'] ?>
	<br>
	$_SERVER['PHP_SELF']: <?php echo $_SERVER['PHP_SELF'] ?>
	<br>
	</p>
	<div class = "jumpscare1"></div>
</article>
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.1.1/jquery.min.js"></script>
<script>
			function doomCounter()
			{
				var items = $('#dillon li').length + $('#david li').length + $('#alex li').length + $('#jose li').length + $('#unallocated li').length;
				console.log("Total items: " + items);
		
				var finished = $('#dillon s').length + $('#david s').length + $('#alex s').length + $('#jose s').length + $('#unallocated s').length;
				console.log("Total finished items: " + finished);
		
				$('#progressBar').val(finished);
				document.getElementById("progressBar").max = items;
			}
			doomCounter();
			
			function taskCounter()
			{
				var items = $('#dillon li').length;
				var finished = $('#dillon s'). length;
				$('#dillonc').text(finished);
				$('#dillonuc').text(items - finished);
				
				items = $('#david li').length;
				finished = $('#david s'). length;
				$('#davidc').text(finished);
				$('#daviduc').text(items - finished);
				
				items = $('#jose li').length;
				finished = $('#jose s').length;
				$('#josec').text(finished);
				$('#joseuc').text(items - finished);
				
				items = $('#alex li').length;
				finished = $('#alex s').length;
				$('#alexc').text(finished);
				$('#alexuc').text(items - finished);
			}
			taskCounter();
</script>

<?php include './style/footer.php'; ?>