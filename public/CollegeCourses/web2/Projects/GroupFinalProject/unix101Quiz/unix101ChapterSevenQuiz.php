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
	<h1>Chapter Seven Quiz</h1>
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
	
		<h3>1. What&#39;s the first thing you do when you download source files?</h3>
		<div class="question">
            <input type="radio" name="c7q1" value="false">A. Execute it <br>
			<input type="radio" name="c7q1" value="false"> B. Install it <br>
			<input type="radio" name="c7q1" value="true">C. read the README.txt  <br>
			<input type="radio" name="c7q1" value="false">D. move it to the proper directory <br>
		</div>
		
		<h3>2. What command do you use to build packages?</h3>
		<div class="question">
			<input type="radio" name="c7q2" value="false">A. pack<br>
			<input type="radio" name="c7q2" value="true">B. make<br>
			<input type="radio" name="c7q2" value="false">C. gzip<br>
		</div>
		
		<h3>3. How do you remove code out of the binary file?</h3>
		<div class="question">
			<input type="radio" name="c7q3" value="false">A. rm<br>
			<input type="radio" name="c7q3" value="true">B. strip<br>
			<input type="radio" name="c7q3" value="false">C. chmod<br>
		</div>
		
		<h3>4: All high leveled code has to converted to code the computer understands, what is the name of this code?</h3>
		<div class="question">
			<input type="radio" name="c7q4" value="true">A. assembly<br>
			<input type="radio" name="c7q4" value="false">B. basic<br>
			<input type="radio" name="c7q4" value="false">C. python<br>
		</div>
		
		<h3>5: What is the proper order of commands used to extract source code?</h3>
		<div class="question">
			<input type="radio" name="c7q5" value="false">A. cd download tar -xvf code.gz.tar gunzip code.gz cd code<br>
			<input type="radio" name="c7q5" value="false">B. gunzip code.tar.gz cd download tar -xvf code.tar cd code<br>
			<input type="radio" name="c7q5" value="true">C.  cd download gunzip code.tar.gz tar -xvf code.tar cd code<br>
		</div>
		
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
	</form>

    </article>
<?php include '../style/footer.php'; ?>