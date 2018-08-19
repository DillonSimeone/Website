<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c3q1 = $_POST["c3q1"];
		$c3q2 = $_POST["c3q2"];
		$c3q3 = $_POST["c3q3"];
		$c3q4 = $_POST["c3q4"];
		$c3q5 = $_POST["c3q5"];
		$c3q6 = $_POST["c3q6"];
		$c3q7 = $_POST["c3q7"];
		$c3q8 = $_POST["c3q8"];
		$c3q9 = $_POST["c3q9"];
		$c3q10 = $_POST["c3q10"];
		$messages = "";
		$error = "";
		
		if($c3q1 == "false" || $c3q1 == "" || $c3q1 != "rm")
		{
			$messages .= "Question 1: WRONG.<br>";
			$error++;
		}
		
		if($c3q2 == "false" || $c3q2 == "" || $c3q2 != "cd ..")
		{
			$messages .= "Question 2: WRONG.<br>";
			$error++;
		}
		
		if($c3q3 == "false" || $c3q3 == "" || $c3q3 != "/var/logs")
		{
			if($c3q3 == "/var/logs/")
			{}
			else
			{
				$messages .= "Question 3: WRONG.<br>";
				$error++;
			}
		}
		
		if($c3q4 == "false" || $c3q4 == "" || $c3q4 != "ifconfig -a ")
		{
			$messages .= "Question 4: WRONG.<br>";
			$error++;
		}
		
		if($c3q5 == "false" || $c3q5 == "" || $c3q5 != "kill")
		{
			if($c3q5 == "kill -g")
			{}
			else
			{
				$messages .= "Question 5: WRONG.<br>";
				$error++;
			}
			
		}
		
		if($c3q6 == "false" || $c3q6 == "" || $c3q6 != "df")
		{
			if($c3q6 == "du")
			{}
			else
			{
				$messages .= "Question 6: WRONG.<br>";
				$error++;
			}
		}
		
		if($c3q7 == "false" || $c3q7 == "" || $c3q7 != "df")
		{
			if($c3q7 == "df -h" || $c3q7 == "df -k")
			{}
			else
			{
				$messages .= "Question 7: WRONG.<br>";
				$error++;
			}
		}
		
		if($c3q8 == "false" || $c3q8 == ""|| $c3q8 != "uptime")
		{
			if($c3q8 == "w")
			$messages .= "Question 8: WRONG.<br>";
			$error++;
		}
		
		if($c3q9 == "false" || $c3q9 == "" || $c3q9 != "whoami")
		{
			$messages .= "Question 9: WRONG.<br>";
			$error++;
		}
		
		if($c3q10 == "false" || $c3q10 == "" || $c3q10 != "top")
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
			
			$query = "UPDATE `unix101Member` SET `c3`='$error' WHERE Username='$name'";
		
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
	<h1>Chapter Three Quiz</h1>
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
	
		<h3>1: What is the command to delete a file?</h3>
		<div class="question">
            <input type="text" name="c3q1" value="">
		</div>
		
		<h3>2: What do you type in to move to the parent directory?</h3>
		<div class="question">
			<input type="text" name="c3q2" value="">
		</div>
		
		<h3>3: What is the default directory path for system log files?</h3>
		<div class="question">
			<input type="text" name="c3q3" value="">
		</div>
		
		<h3>4: What command is used to get the ip address of all interfaces on a server?</h3>
		<div class="question">
			<input type="text" name="c3q4" value="">
		</div>
		
		<h3>5: What command and parameter (or switch) will force a program to quit (even one running in the background)?</h3>
		<div class="question">
			<input type="text" name="c3q5" value="">
		</div>
		
		<h3>6: What command is used to change ownership of a file?</h3>
		<div class="question">
		    <input type="text" name="c3q6" value="">
		</div>
		
		<h3>7: What command(s) shows you disk partitions and percentage of disk space used?</h3>
		<div class="question">
			<input type="text" name="c3q7" value="">
		</div>
		
		<h3>8: What command shows you how long it has been since the server was rebooted?</h3>
		<div class="question">
			<input type="text" name="c3q8" value=""> 
		</div>
		
		<h3>9: What command displays your current username?</h3>
		<div class="question">
			<input type="text" name="c3q9" value="">
		</div>
		
		<h3>10: What command shows you CPU and memory utilization for running processes?</h3>
		<div class="question">
			<input type="text" name="c3q10" value="">
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