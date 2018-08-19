<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c1q1 = $_POST["c1q1"];
		$c1q2 = $_POST["c1q2"];
		$c1q3 = $_POST["c1q3"];
		$c1q4 = $_POST["c1q4"];
		$c1q5 = $_POST["c1q5"];
		$c1q6 = $_POST["c1q6"];
		$c1q7 = $_POST["c1q7"];
		$c1q8 = $_POST["c1q8"];
		$c1q9 = $_POST["c1q9"];
		$c1q10 = $_POST["c1q10"];
		$messages = "";
		$error = "";
		
		if($c1q1 == "false" || $c1q1 == "")
		{
			$messages .= "Question 1: WRONG.<br>";
			$error++;
		}
		
		if($c1q2 == "false" || $c1q2 == "")
		{
			$messages .= "Question 2: WRONG.<br>";
			$error++;
		}
		
		if($c1q3 == "false" || $c1q3 == "")
		{
			$messages .= "Question 3: WRONG.<br>";
			$error++;
		}
		
		if($c1q4 == "false" || $c1q4 == "")
		{
			$messages .= "Question 4: WRONG.<br>";
			$error++;
		}
		
		if($c1q5 == "false" || $c1q5 == "")
		{
			$messages .= "Question 5: WRONG.<br>";
			$error++;
		}
		
		if($c1q6 == "false" || $c1q6 == "")
		{
			$messages .= "Question 6: WRONG.<br>";
			$error++;
		}
		
		if($c1q7 == "false" || $c1q7 == "")
		{
			$messages .= "Question 7: WRONG.<br>";
			$error++;
		}
		
		if($c1q8 == "false" || $c1q8 == "")
		{
			$messages .= "Question 8: WRONG.<br>";
			$error++;
		}
		
		if($c1q9 == "false" || $c1q9 == "")
		{
			$messages .= "Question 9: WRONG.<br>";
			$error++;
		}
		
		if($c1q10 == "false" || $c1q10 == "")
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
			
			$query = "UPDATE `unix101Member` SET `c1`='$error' WHERE Username='$name'";
		
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
	<h1>Chapter One Quiz</h1>
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
	
		<h3>1. How do you get help about the command cp?</h3>
		<div class="question">
            <input type="radio" name="c1q1" value="false">A. Help cp <br>
			<input type="radio" name="c1q1" value="true">B. Man cp <br>
			<input type="radio" name="c1q1" value="false">C. Cp ? <br>
		</div>
		
		<h3>2. How do you display a listing of file details such as date, size, and access permissions?</h3>
		<div class="question">
			<input type="radio" name="c1q2" value="false">A. list all <br>
			<input type="radio" name="c1q2" value="false">B. Ls -full <br>
			<input type="radio" name="c1q2" value="true">C. Ls -l <br>
		</div>
		
		<h3>3. How do you rename a file from new to old?</h3>
		<div class="question">
			<input type="radio" name="c1q3" value="true">A. Mv new old  <br>
			<input type="radio" name="c1q3" value="false">B. Cp new old <br>
			<input type="radio" name="c1q3" value="false">C. Rn new old <br>
		</div>
		
		<h3>4: How do you display the contents of a file myfile.txt?</h3>
		<div class="question">
			<input type="radio" name="c1q4" value="false">A. Type myfile.txt<br>
			<input type="radio" name="c1q4" value="false">B. List myfile.txt<br>
			<input type="radio" name="c1q4" value="true">C. Less myfile.txt<br>
			<input type="radio" name="c1q4" value="false">D. Cat myfile.txt<br>
		</div>
		
		<h3>5: How do you create a new directory called flower?</h3>
		<div class="question">
			<input type="radio" name="c1q5" value="true">A. Newdir flower<br>
			<input type="radio" name="c1q5" value="false">B. Mkdir flower<br>
			<input type="radio" name="c1q5" value="false">C. Crdir flower<br>
		</div>
		
		<h3>6: What is the command to search all files in your current directory for the word plasmodium?</h3>
		<div class="question">
		    <input type="radio" name="c1q6" value="true">A. Grep plasmodium *<br>
			<input type="radio" name="c1q6" value="false">B. Find plasmodium -all<br>
			<input type="radio" name="c1q6" value="false">C. Lookup plasmodium *<br>
		</div>
		
		<h3>7: How do you print the first 15 lines of all files ending by .txt?</h3>
		<div class="question">
			<input type="radio" name="c1q7" value="false">A. Print 15 .txt<br>
			<input type="radio" name="c1q7" value="false">B. Cat *.txt -length=15<br>
			<input type="radio" name="c1q7" value="true">C. Head -15 *.txt<br>
		</div>
		
		<h3>8: Change the current directory to /usr/local/bin.</h3>
		<div class="question">
			<input type="radio" name="c1q8" value="false">A. mv /usr/local/bin<br>
			<input type="radio" name="c1q8" value="true">B. cd /usr/local/bin<br>
			<input type="radio" name="c1q8" value="false">C. setdir /usr/localbin<br>
		</div>
		
		<h3>9: Count the files you own in all your directories.</h3>
		<div class="question">
			<input type="radio" name="c1q9" value="true">A. ls -lR | grep myusername | wc -l<br>
			<input type="radio" name="c1q9" value="false">B. ls -a | cnt *<br>
			<input type="radio" name="c1q9" value="false">C. ls -n ~myusername<br>
		</div>
		
		<h3>10: Make a copy of file &quot;upper&quot; in the directory two levels up.</h3>
		<div class="question">
			<input type="radio" name="c1q10" value="false">A. jump -2 upper<br>
			<input type="radio" name="c1q10" value="true">B. cp upper ../..<br>
			<input type="radio" name="c1q10" value="false">C. cp upper -2/<br>
		</div>
		
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
	</form>
    
    <h3>Source</h3>
    
    <ol>
        <li><a href="http://www.proprofs.com/quiz-school/quizshow.php?title=basic-unix-command-line-quiz&amp;q=8&amp;next=y">ProProfs Quiz Maker</a></li>
        <li><a href="http://www.ch.embnet.org/CoursEMBnet/Exercises/Quiz/quix1.html">Unix Quiz</a></li>
    </ol>

    </article>
<?php include '../style/footer.php'; ?>