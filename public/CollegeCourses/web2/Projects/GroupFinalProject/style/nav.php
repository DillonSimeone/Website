<nav>
        <div class = "dropdown">
            <a class = "button">Unix Chapters</a>
            <div class = "dropdown-content">
				<a href="<?php echo $BASE_URL . 'unix101/unix101.php' ?>">About Chapters</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterOne.php' ?>">Chapter One</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterTwo.php' ?>">Chapter Two</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterThree.php' ?>">Chapter Three</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterFour.php' ?>">Chapter Four</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterFive.php' ?>">Chapter Five</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterSix.php' ?>">Chapter Six</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterSeven.php' ?>">Chapter Seven</a>
                <a href="<?php echo $BASE_URL . 'unix101/unix101ChapterEight.php' ?>">Chapter Eight</a>
            </div>
        </div>
        
        <div class="dropdown">
            <a class = "button">Quiz</a>
            <div class = "dropdown-content">
					<a href="<?php echo $BASE_URL.'unix101Quiz/unix101Quiz.php' ?>">About Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterOneQuiz.php' ?>">Chapter One Quiz</a> 
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterTwoQuiz.php' ?>">Chapter Two Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterThreeQuiz.php' ?>">Chapter Three Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterFourQuiz.php' ?>">Chapter Four  Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterFiveQuiz.php' ?>">Chapter Five Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterSixQuiz.php' ?>">Chapter Six Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterSevenQuiz.php' ?>">Chapter Seven Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101ChapterEightQuiz.php' ?>">Chapter Eight Quiz</a>
                    <a href="<?php echo $BASE_URL . 'unix101Quiz/unix101RandomQuiz.php' ?>" style="display: none;">Random Quiz</a>
            </div>
        </div>
		
        <div class="dropdown">
            <a class = "button"> Account</a>
            <div class = "dropdown-content">
				<?php
					if($_SESSION["loggedin"] == "true")
					{
						echo $_SESSION["username"];
						echo "<a href=" . $BASE_URL . 'account/masteredChapters.php' . ">Mastered Chapters</a>";
						echo "<a href=" . $BASE_URL . 'account/logout.php' . ">Log out</a>";
						//echo "<a href=" . $BASE_URL . 'account/setting.php' . ">Settings</a>";
					}
					else
					{
						echo "<a href=" . $BASE_URL . 'account/signup.php' . ">Sign up</a>";
						echo "<a href=" . $BASE_URL.'account/signin.php' . ">Sign in</a>";
					}
				?> 
            </div>
        </div>
		
        <a class = "button" onclick="openSandbox()">Sandbox</a>
		
		<a class = "button" href="<?php echo $BASE_URL.'FAQ.php' ?>">FAQ</a>
		
        <a class = "button" href="<?php echo $BASE_URL . 'about.php' ?>">About</a>
		<!--
		<form method="get" action="http://www.google.com/search">
		<input type="text"   name="q" size="15" maxlength="255" value="" placeholder=" Search Website"/>
		</form>
		-->
    </nav>