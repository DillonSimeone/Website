<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c6q1 = $_POST["c6q1"];
		$c6q2 = $_POST["c6q2"];
		$c6q3 = $_POST["c6q3"];
		$c6q4 = $_POST["c6q4"];
		$c6q5 = $_POST["c6q5"];
		$messages = "";
		$error = "";
		
		if($c6q1 == "false" || $c6q1 == "")
		{
			$messages .= "Question 1: WRONG.<br>";
			$error++;
		}
		
		if($c6q2 == "false" || $c6q2 == "")
		{
			$messages .= "Question 2: WRONG.<br>";
			$error++;
		}
		
		if($c6q3 == "false" || $c6q3 == "")
		{
			$messages .= "Question 3: WRONG.<br>";
			$error++;
		}
		
		if($c6q4 == "false" || $c6q4 == "")
		{
			$messages .= "Question 4: WRONG.<br>";
			$error++;
		}
		
		if($c6q5 == "false" || $c6q5 == "")
		{
			$messages .= "Question 5: WRONG.<br>";
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
			$error = $error*2;
			
			$query = "UPDATE `unix101Member` SET `c6`='$error' WHERE Username='$name'";
		
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
	<h1>Chapter Six Quiz</h1>
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
	
		<h3>1. What command tells you how much space is left on the file server?</h3>
		<div class="question">
            <input type="radio" name="c6q1" value="false">A. ^C <br>
			<input type="radio" name="c6q1" value="false">B. zcat <br>
			<input type="radio" name="c6q1" value="true">C. df .  <br>
			<input type="radio" name="c6q1" value="false">D. du -s* <br>
			<input type="radio" name="c6q1" value="false">E. diff <br>
		</div>
		
		<h3>2. Which command compares two files and displays the differences?</h3>
		<div class="question">
			<input type="radio" name="c6q2" value="false">A. file<br>
			<input type="radio" name="c6q2" value="true">B. diff<br>
			<input type="radio" name="c6q2" value="false">C. find<br>
		</div>
		
		<h3>3. What command keeps track of commands you used?</h3>
		<div class="question">
			<input type="radio" name="c6q3" value="false">A. read<br>
			<input type="radio" name="c6q3" value="true">B. history<br>
			<input type="radio" name="c6q3" value="false">C. find<br>
		</div>
		
		<h3>4: What command can you use to find your maximum disk space?</h3>
		<div class="question">
			<input type="radio" name="c6q4" value="true">A. quota<br>
			<input type="radio" name="c6q4" value="false">B. size<br>
			<input type="radio" name="c6q4" value="false">C. total<br>
		</div>
		
		<h3>5: What is used to zip a file?</h3>
		<div class="question">
			<input type="radio" name="c6q5" value="false">A. tar<br>
			<input type="radio" name="c6q5" value="false">B. zip<br>
			<input type="radio" name="c6q5" value="true">C. gzip<br>
		</div>
		
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
	</form>

    </article>
<?php include '../style/footer.php'; ?>