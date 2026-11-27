<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c7q1 = $_POST["c7q1"];
		$c7q2 = $_POST["c7q2"];
		$c7q3 = $_POST["c7q3"];
		$c7q4 = $_POST["c7q4"];
		$c7q5 = $_POST["c7q5"];
		$messages = "";
		$error = "";
		
		if($c7q1 == "false" || $c7q1 == "")
		{
			$messages .= "Question 1: WRONG.<br>";
			$error++;
		}
		
		if($c7q2 == "false" || $c7q2 == "")
		{
			$messages .= "Question 2: WRONG.<br>";
			$error++;
		}
		
		if($c7q3 == "false" || $c7q3 == "")
		{
			$messages .= "Question 3: WRONG.<br>";
			$error++;
		}
		
		if($c7q4 == "false" || $c7q4 == "")
		{
			$messages .= "Question 4: WRONG.<br>";
			$error++;
		}
		
		if($c7q5 == "false" || $c7q5 == "")
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
			
			$query = "UPDATE `unix101Member` SET `c7`='$error' WHERE Username='$name'";
		
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
	<h1>Chapter Eight Quiz</h1>
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
	
		<h3>1. What is an enviroment variable?</h3>
		<div class="question">
            <input type="radio" name="c5q1" value="false">A. settings that customizes the shell <br>
			<input type="radio" name="c5q1" value="false"> B. Different types of shells <br>
			<input type="radio" name="c5q1" value="true">C. a way of passing infromation from the shell, to the program  <br>
		</div>
		
		<h3>2. How do you determine the values of already made variables?</h3>
		<div class="question">
			<input type="radio" name="c5q2" value="false">A. set -less <br>
			<input type="radio" name="c5q2" value="true">B. set | less <br>
			<input type="radio" name="c5q2" value="false">C. less -set<br>
		</div>
		
		<h3>3. how do you set the path for the program to find your file of commands?</h3>
		<div class="question">
			<input type="radio" name="c5q3" value="false">A. set path ./command/bin <br>
			<input type="radio" name="c5q3" value="true">B. set path = ($path = ~/command/bin)<br>
			<input type="radio" name="c5q3" value="false">C. set path = (./command/bin) <br>
		</div>
		
		<h3>4: What does the DISPLAY variable hold?</h3>
		<div class="question">
			<input type="radio" name="c5q4" value="true">A. the name of your computer screen to display X windows<br>
			<input type="radio" name="c5q4" value="false">B. the name of your shell<br>
			<input type="radio" name="c5q4" value="false">C. the name of your graphics driver<br>
		</div>
		
		<h3>5: What command do you use to get the shell to reread a file?</h3>
		<div class="question">
			<input type="radio" name="c5q5" value="false">A. read<br>
			<input type="radio" name="c5q5" value="false">B. open<br>
			<input type="radio" name="c5q5" value="true">C.  source<br>
		</div>
		
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
	</form>

    </article>
<?php include '../style/footer.php'; ?>