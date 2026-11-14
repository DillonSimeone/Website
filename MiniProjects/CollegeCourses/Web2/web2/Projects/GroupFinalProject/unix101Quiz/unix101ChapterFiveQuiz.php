<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c5q1 = $_POST["c5q1"];
		$c5q2 = $_POST["c5q2"];
		$c5q3 = $_POST["c5q3"];
		$c5q4 = $_POST["c5q4"];
		$c5q5 = $_POST["c5q5"];
		$c5q6 = $_POST["c5q6"];
		$c5q7 = $_POST["c5q7"];
		$c5q8 = $_POST["c5q8"];
		$c5q9 = $_POST["c5q9"];
		$c5q10 = $_POST["c5q10"];
		$messages = "";
		$error = "";
		
		if($c5q1 == "false" || $c5q1 == "")
		{
			$messages .= "Question 1: WRONG.<br>";
			$error++;
		}
		
		if($c5q2 == "false" || $c5q2 == "")
		{
			$messages .= "Question 2: WRONG.<br>";
			$error++;
		}
		
		if($c5q3 == "false" || $c5q3 == "")
		{
			$messages .= "Question 3: WRONG.<br>";
			$error++;
		}
		
		if($c5q4 == "false" || $c5q4 == "")
		{
			$messages .= "Question 4: WRONG.<br>";
			$error++;
		}
		
		if($c5q5 == "false" || $c5q5 == "")
		{
			$messages .= "Question 5: WRONG.<br>";
			$error++;
		}
		
		if($c5q6 == "false" || $c5q6 == "")
		{
			$messages .= "Question 6: WRONG.<br>";
			$error++;
		}
		
		if($c5q7 == "false" || $c5q7 == "")
		{
			$messages .= "Question 7: WRONG.<br>";
			$error++;
		}
		
		if($c5q8 == "false" || $c5q8 == "")
		{
			$messages .= "Question 8: WRONG.<br>";
			$error++;
		}
		
		if($c5q9 == "false" || $c5q9 == "")
		{
			$messages .= "Question 9: WRONG.<br>";
			$error++;
		}
		
		if($c5q10 == "false" || $c5q10 == "")
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
			
			$query = "UPDATE `unix101Member` SET `c5`='$error' WHERE Username='$name'";
		
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
	<h1>Chapter Five Quiz</h1>
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
	
		<h3>1. Which command allows you to end a program running in the background?</h3>
		<div class="question">
            <input type="radio" name="c5q1" value="false">A. ^C <br>
			<input type="radio" name="c5q1" value="false">B. Sleep 100 <br>
			<input type="radio" name="c5q1" value="true">C. kill %jobnumber <br>
			<input type="radio" name="c5q1" value="false">D. ps <br>
			<input type="radio" name="c5q1" value="false">E. Cdr <br>
		</div>
		
		<h3>2. Regarding changing file permissions, what does &#39;a&#39; mean?</h3>
		<div class="question">
			<input type="radio" name="c5q2" value="false">A. anyone<br>
			<input type="radio" name="c5q2" value="true">B. all<br>
			<input type="radio" name="c5q2" value="false">C. user<br>
		</div>
		
		<h3>3. If a file permission read &quot;-rwxrw-r-&quot;, what permission does the owner of the file NOT have?</h3>
		<div class="question">
			<input type="radio" name="c5q3" value="false">A. read<br>
			<input type="radio" name="c5q3" value="true">B. execute<br>
			<input type="radio" name="c5q3" value="false">C. write<br>
		</div>
		
		<h3>4: Q4: Each permission is a binary number. What number is Write?</h3>
		<div class="question">
			<input type="radio" name="c5q4" value="true">A. 1<br>
			<input type="radio" name="c5q4" value="false">B. 2<br>
			<input type="radio" name="c5q4" value="false">C. 4<br>
		</div>
		
		<h3>5: What command is used to modify permissions?</h3>
		<div class="question">
			<input type="radio" name="c5q5" value="false">A. tar<br>
			<input type="radio" name="c5q5" value="false">B. man<br>
			<input type="radio" name="c5q5" value="true">C. chmod<br>
		</div>
		
		<h3>6: What numbers would I want to type out that gives me (the owner) read, write, and excute and everyone else, just read and write?</h3>
		<div class="question">
		    <input type="radio" name="c5q6" value="true">A. 733<br>
			<input type="radio" name="c5q6" value="false">B. 644<br>
			<input type="radio" name="c5q6" value="false">C. 755<br>
		</div>
		
		<h3>7: What command do you use to examine a list of jobs?</h3>
		<div class="question">
			<input type="radio" name="c5q7" value="false">A. Clr<br>
			<input type="radio" name="c5q7" value="false">B. rm<br>
			<input type="radio" name="c5q7" value="false">C. Cd<br>
			<input type="radio" name="c5q7" value="true">D. jobs<br>
			<input type="radio" name="c5q7" value="false">E. kill<br>
		</div>
		
		<h3>8: ps can be used to help you find what?</h3>
		<div class="question">
			<input type="radio" name="c5q8" value="false">A. What directory you&#39;re in<br>
			<input type="radio" name="c5q8" value="false">B. List of jobs<br>
			<input type="radio" name="c5q8" value="true">C. status of processes<br>
			<input type="radio" name="c5q8" value="false">D. ping seconds<br>
		</div>
		
		<h3>9: What command lets you end a program in the foreground?</h3>
		<div class="question">
			<input type="radio" name="c5q9" value="true">A. ^C<br>
			<input type="radio" name="c5q9" value="false">B. Kill<br>
			<input type="radio" name="c5q9" value="false">C. chmod<br>
			<input type="radio" name="c5q9" value="false">D. rmdir<br>
			<input type="radio" name="c5q9" value="false">E. pwd<br>
		</div>
		
		<h3>10: When you change the permissions of a file to &#39;755&#39; what permissions are you giving to your group?</h3>
		<div class="question">
			<input type="radio" name="c5q10" value="false">A. Write and Execute<br>
			<input type="radio" name="c5q10" value="true">B. Read and Execute<br>
			<input type="radio" name="c5q10" value="false">C. Read and Write<br>
		</div>
		
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
	</form>

    </article>
<?php include '../style/footer.php'; ?>