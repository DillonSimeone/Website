<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c4q1 = $_POST["c4q1"];
		$c4q2 = $_POST["c4q2"];
		$c4q3 = $_POST["c4q3"];
		$c4q4 = $_POST["c4q4"];
		$c4q5 = $_POST["c4q5"];
		$c4q6 = $_POST["c4q6"];
		$c4q7 = $_POST["c4q7"];
		$c4q8 = $_POST["c4q8"];
		$c4q9 = $_POST["c4q9"];
		$c4q10 = $_POST["c4q10"];
		$messages = "";
		$error = "";
		
		if($c4q1 == "false" || $c4q1 == "" || $c4q1 != "less")
		{
			if($c4q1 == "more")
			{}
			else
			{
				$messages .= "Question 1: WRONG.<br>";
				$error++;
			}
		}
		
		if($c4q2 == "false" || $c4q2 == "" || $c4q2 != "who")
		{
			$messages .= "Question 2: WRONG.<br>";
			$error++;
		}
		
		if($c4q3 == "false" || $c4q3 == "" || $c4q3 != "su")
		{
			if($c4q3 == "/var/logs/")
			{}
			else
			{
				$messages .= "Question 3: WRONG.<br>";
				$error++;
			}
		}
		
		if($c4q4 == "false" || $c4q4 == "" || $c4q4 != "passwd")
		{
			$messages .= "Question 4: WRONG.<br>";
			$error++;
		}
		
		if($c4q5 == "false" || $c4q5 == "" || $c4q5 != "up arrow")
		{
			if($c4q5 == "Up arrow" || $c4q5 == "fc" || $c4q5 == "history")
			{}
			else
			{
				$messages .= "Question 5: WRONG.<br>";
				$error++;
			}
		}
		
		if($c4q6 == "false" || $c4q6 == "" || $c4q6 != "sudo")
		{
			$messages .= "Question 6: WRONG.<br>";
			$error++;
		}
		
		if($c4q7 == "false" || $c4q7 == "" || $c4q7 != "wc")
		{
			$messages .= "Question 7: WRONG.<br>";
			$error++;
		}
		
		if($c4q8 == "false" || $c4q8 == ""|| $c4q8 != "lpr")
		{
			$messages .= "Question 8: WRONG.<br>";
			$error++;
		}
		
		if($c4q9 == "false" || $c4q9 == "" || $c4q9 != "lpq")
		{
			$messages .= "Question 9: WRONG.<br>";
			$error++;
		}
		
		if($c4q10 == "false" || $c4q10 == "" || $c4q10 != "rmdir")
		{
			$messages .= "Question 10: WRONG.<br>";
			$error++;
		}
		
		if($messages == null || "")
		{
			$messages .= "Chapter Mastered!";
		}
		
		if($_SESSION["loggedin"] == "true")
		{
			$db_host = "localhost";  
			$db_user = "dys8701";    
			$db_pass = "fr1end";   
			$db_name = "dys8701";
			$link = mysqli_connect( $db_host, $db_user, $db_pass, $db_name );
			$name = $_SESSION["username"];
			
			$query = "UPDATE `unix101Member` SET `c4`='$error' WHERE Username='$name'";
		
			mysqli_query( $link, $query );
				if(mysqli_affected_rows($link) == 0)
				{
					$messages .= "failed to update your stats!";
				}
				else
					$messages .= "Successfully saved your stats!";
		}
	}
?>
    <article>
	<h1>Chapter Four Quiz</h1>
	<div style="text-align: center;">
		<?php
			echo $messages;
			
			if($_SESSION["loggedin"] != "true")
					{
						echo "<p>Save your quiz stats by signing up or signing in!</p>";
					}
					else
					{
						echo "<p>" . $_SESSION["username"] . ", your stats will be saved! Click on Mastery in the account drop-down menu to view your stats!</p>";
					}
		?>
	</div>
	
    <form 	action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>" 
			method="post" 
			name="orderForm"
			class="quiz">
	
		<h3>1: What command allows you to open and view a file one page at a time?</h3>
		<div class="question">
            <input type="text" name="c4q1" value="">
		</div>
		
		<h3>2: Which command(s) show users that are logged in?</h3>
		<div class="question">
			<input type="text" name="c4q2" value="">
		</div>
		
		<h3>3: What is the command to switch to the root user account?</h3>
		<div class="question">
			<input type="text" name="c4q3" value="">
		</div>
		
		<h3>4: What is the command to change your password?</h3>
		<div class="question">
			<input type="text" name="c4q4" value="">
		</div>
		
		<h3>5: What command is used to display your previous commands?</h3>
		<div class="question">
			<input type="text" name="c4q5" value="">
		</div>
		
		<h3>6: What is the command to run a program with elevated permissions?</h3>
		<div class="question">
		    <input type="text" name="c4q6" value="">
		</div>
		
		<h3>7: What is the command is used to count the total number of lines, words and character in a file?</h3>
		<div class="question">
			<input type="text" name="c4q7" value="">
		</div>
		
		<h3>8: What command is used to add printing jobs to the queue?</h3>
		<div class="question">
			<input type="text" name="c4q8" value=""> 
		</div>
		
		<h3>9: What command displays your current username?</h3>
		<div class="question">
			<input type="text" name="c4q9" value="">
		</div>
		
		<h3>10: What command is used to remove the directory?</h3>
		<div class="question">
			<input type="text" name="c4q10" value="">
		</div>
		
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
	</form>
    
    <h3>Source</h3>
    
    <ol>
        <li><a href="http://www.proprofs.com/quiz-school/story.php?title=Basic-Linux-Commands" target="_blank">Proprofs Quiz Maker</a></li>
    </ol>

    </article>
<?php include '../style/footer.php'; ?>