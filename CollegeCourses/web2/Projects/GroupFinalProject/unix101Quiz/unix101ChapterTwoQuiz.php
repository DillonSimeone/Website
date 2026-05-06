<?php
include '../style/header.php';
include '../style/nav.php';

if( !empty( $_POST))
	{
		$c2q1 = $_POST["c2q1"];
		$c2q2 = $_POST["c2q2"];
		$c2q3 = $_POST["c2q3"];
		$c2q4 = $_POST["c2q4"];
		$c2q5 = $_POST["c2q5"];
		$c2q6 = $_POST["c2q6"];
		$c2q7 = $_POST["c2q7"];
		$c2q8 = $_POST["c2q8"];
		$c2q9 = $_POST["c2q9"];
		$c2q10 = $_POST["c2q10"];
		$messages = "";
		$error = "";
		
		if($c2q1 == "false" || $c2q1 == "")
		{
			$messages .= "Question 1. WRONG.<br>";
			$error++;
		}
		
		if($c2q2 == "false" || $c2q2 == "")
		{
			$messages .= "Question 2. WRONG.<br>";
			$error++;
		}
		
		if($c2q3 == "false" || $c2q3 == "")
		{
			$messages .= "Question 3. WRONG.<br>";
			$error++;
		}
		
		if($c2q4 == "false" || $c2q4 == "")
		{
			$messages .= "Question 4. WRONG.<br>";
			$error++;
		}
		
		if($c2q5 == "false" || $c2q5 == "")
		{
			$messages .= "Question 5. WRONG.<br>";
			$error++;
		}
		
		if($c2q6 == "false" || $c2q6 == "")
		{
			$messages .= "Question 6. WRONG.<br>";
			$error++;
		}
		
		if($c2q7 == "false" || $c2q7 == "")
		{
			$messages .= "Question 7. WRONG.<br>";
			$error++;
		}
		
		if($c2q8 == "false" || $c2q8 == "")
		{
			$messages .= "Question 8. WRONG.<br>";
			$error++;
		}
		
		if($c2q9 == "false" || $c2q9 == "")
		{
			$messages .= "Question 9. WRONG.<br>";
			$error++;
		}
		
		if($c2q10 == "false" || $c2q10 == "")
		{
			$messages .= "Question 10. WRONG.<br>";
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
			
			$query = "UPDATE `unix101Member` SET `c2`='$error' WHERE Username='$name'";
		
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
	<h1>Chapter Two Quiz</h1>
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
	
		<h3>1: What command, followed by the directory name is used to access that specific directory?</h3>
		<div class="question">
            <input type="radio" name="c2q1" value="false">A: Cp <br>
			<input type="radio" name="c2q1" value="true">B: Cd <br>
			<input type="radio" name="c2q1" value="false">C: Access <br>
			<input type="radio" name="c2q1" value="false">D: Acs <br>
			<input type="radio" name="c2q1" value="false">E: Cdr <br>
		</div>
		
		<h3>2: How do you change the access permission (add group read/write) to all the files in the current directory containing the word &quot;cali&quot; in their names?</h3>
		<div class="question">
			<input type="radio" name="c2q2" value="true">A: chmod g+rw *cali*<br>
			<input type="radio" name="c2q2" value="false">B: setperm r+w *cali*<br>
			<input type="radio" name="c2q2" value="false">C: chmod 0060 *cali*<br>
		</div>
		
		<h3>3: What is the command to find the differences in the lines containing &quot;1999&quot; between the files orig:txt and copy:txt, and add the result to file result:1999
</h3>
		<div class="question">
			<input type="radio" name="c2q3" value="false">A: diff orig.txt -d copy:txt | grep 1999 &gt; result:1999<br>
			<input type="radio" name="c2q3" value="true">B: diff orig.txt copy:txt | grep 1999 &gt;&gt; result:1999<br>
			<input type="radio" name="c2q3" value="false">C: grep 1999 *.txt &gt;&gt; result:1999<br>
		</div>
		
		<h3>4: How do you tell the server to use your local display (197:42:197:67) for X-windows?
</h3>
		<div class="question">
			<input type="radio" name="c2q4" value="false">A. set display local<br>
			<input type="radio" name="c2q4" value="true">B. setenv DISPLAY 192.42.197.67:0.0<br>
			<input type="radio" name="c2q4" value="false">C. setdsp x 192.42.197.67<br>
		</div>
		
		<h3>5: How do you uncompress and untar an archive called &quot;lot_of_thing.tar.Z&quot;</h3>
		<div class="question">
			<input type="radio" name="c2q5" value="false">A. tar lot_of_thing.tar.Z | decomp<br>
			<input type="radio" name="c2q5" value="true">B. zcat lot_of_thing.tar.Z | tar xvf -<br>
			<input type="radio" name="c2q5" value="false">C. tar xvf lot_of_thing.tar.Z<br>
		</div>
		
		<h3>6: Create a new file &quot;new.txt&quot; that is a concatenation of &quot;file1.txt&quot; and &quot;file2.txt&quot;.</h3>
		<div class="question">
		    <input type="radio" name="c2q6" value="true">A. cat file1.txt file2.txt &gt; new.txt<br>
			<input type="radio" name="c2q6" value="false">B. make new.txt=file1.txt+file2.txt<br>
			<input type="radio" name="c2q6" value="false">C. tail file1.txt | head file2.txt &gt; new.txt<br>
		</div>
		
		<h3>7: What command is used to clear up the command prompt window?</h3>
		<div class="question">
			<input type="radio" name="c2q7" value="false">A. Clr<br>
			<input type="radio" name="c2q7" value="false">B. Clrwin<br>
			<input type="radio" name="c2q7" value="false">C. Cd<br>
			<input type="radio" name="c2q7" value="true">D. Clear<br>
			<input type="radio" name="c2q7" value="false">E. Clearit<br>
		</div>
		
		<h3>8: How would you show a list of files and directories that are inside the current directory.</h3>
		<div class="question">
			<input type="radio" name="c2q8" value="false">A. List<br>
			<input type="radio" name="c2q8" value="false">B. Listfiles<br>
			<input type="radio" name="c2q8" value="true">C. Ls<br>
			<input type="radio" name="c2q8" value="false">D. Lst<br>
			<input type="radio" name="c2q8" value="false">E. Listout<br>
		</div>
		
		<h3>9: What command shows the directory you are in?</h3>
		<div class="question">
			<input type="radio" name="c2q9" value="true">A. Pwd<br>
			<input type="radio" name="c2q9" value="false">B. Dir<br>
			<input type="radio" name="c2q9" value="false">C. Directory<br>
			<input type="radio" name="c2q9" value="false">D. Showdir<br>
			<input type="radio" name="c2q9" value="false">E. Dirpwd<br>
		</div>
		
		<h3>10: What command allows you to logout of the system?</h3>
		<div class="question">
			<input type="radio" name="c2q10" value="false">A. Lgt<br>
			<input type="radio" name="c2q10" value="true">B. Logout<br>
			<input type="radio" name="c2q10" value="false">C. Logot<br>
			<input type="radio" name="c2q10" value="false">D. Out <br>
			<input type="radio" name="c2q10" value="false">E. Lout<br>

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