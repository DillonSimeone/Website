<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 8;
	$errors = "";
	$db_host = "localhost";  
	$db_user = "dys8701";    
	$db_pass = "fr1end";   
	$db_name = "dys8701";
	$link = mysqli_connect( $db_host, $db_user, $db_pass, $db_name ); 
  
	if( !empty( $_POST))
	{
		if($_SESSION["loggedin"] == "true")
			$name = "<h3>" . cleanInput($_SESSION["username"]) . "</h3>";
		else
			$name = "<h3>A random lurker!</h3>";
		
		$comment = $name . "<p>" . cleanInput($_POST["comment"]) . "</p>";
		
		if($comment == "")
		{
			$errors .= "Comment not typed in!<br/>";
		}
		
		if($errors == null || $errors == "")
			
		{
			$userInput = "INSERT INTO `unix101Comment`(`chapter`, `comment`) VALUES ('$chapter','$comment')";
			if(mysqli_query( $link, $userInput ))
			{
				echo "New record created successfully";
			}
			else
			{
				echo "Error: " . $userInput . "<br>" . mysqli_error($link);
			}
		}
		
	}	// end if post submit
	
	function cleanInput($data)
	{
		$data = trim($data);
		$data = stripslashes($data);
		$data = htmlspecialchars($data);
		return $data;
	}
?>
<article>
	<h1>Chapter 8</h1>

	<h2>UNIX Variables</h2>

	<p>Variables are a way of passing information from the shell to programs when you run them. Programs look "in the environment" 
	for particular variables and if they are found will use the values stored. Some are set by the system, others by you, 
	yet others by the shell, or any program that loads another program<sup>1</sup>.</p>

	<p>Standard UNIX variables are split into two categories, environment variables and shell variables. 
	In broad terms, shell variables apply only to the current instance of the shell and are used to set short-term working conditions; 
	environment variables have a farther reaching significance, and those set at login are valid for the duration of the session. 
	By convention, environment variables have UPPER CASE and shell variables have lower case names<sup>1</sup>.</p>

	<h2>Environment Variables</h2>

	<p>An example of an environment variable is the OSTYPE variable. 
	The value of this is the current operating system you are using. Type the following.</p>

	<div class="boxed">echo $OSTYPE</div>

	<p>More examples of environment variables are:</p>

	<p>
		USER (your login name)<br/>
        HOME (the path name of your home directory)<br/>
        HOST (the name of the computer you are using)<br/>
        ARCH (the architecture of the computers processor)<br/>
        DISPLAY (the name of the computer screen to display X windows)<br/>
        PRINTER (the default printer to send print jobs)<br/>
        PATH (the directories the shell should search to find a command)
	</p>

	<h3>Finding out the current values of these variables.</h3>

	<p>ENVIRONMENT variables are set using the setenv command, displayed using the printenv or env commands, and unset using the unsetenv command<sup>1</sup>.</p>

	<p>To show all values of these variables, type the following.</p>

	<div class="boxed">printenv | less</div>

	<h2>Shell Variables</h2>

	<p>An example of a shell variable is the history variable<sup>1</sup>. 
	The value of this is how many shell commands to save, allow the user to scroll back through all the commands 
	they have previously entered. Type the following.</p>

	<div class="boxed">echo $history</div>

	<p>More examples of shell variables are:</p>

	<p>
		cwd (your current working directory)
        home (the path name of your home directory)
        path (the directories the shell should search to find a command)
        prompt (the text string used to prompt for interactive commands shell your login shell).
	</p>


	<h3>Finding out the current values of these variables.</h3>

	<p>SHELL variables are both set and displayed using the set command. They can be unset by using the unset command<sup>1</sup>.</p>

	<p>To show all values of these variables, type the following.</p>

	<div class="boxed">set | less</div>

	<h3>So what is the difference between PATH and path?</h3>

	<p>In general, environment and shell variables that have the same name (apart from the case) are distinct and independent, 
	except for possibly having the same initial values. There are, however, exceptions<sup>1</sup>.</p>

	<p>Each time the shell variables home, user and term are changed, 
	the corresponding environment variables HOME, USER and TERM receive the same values. 
	However, altering the environment variables has no effect on the corresponding shell variables<sup>1</sup>.</p>

	<p>PATH and path specify directories to search for commands and programs. 
	Both variables always represent the same directory list, and altering either automatically causes the other to be changed.</p>

	<h2>Using and setting variables</h2>

	<p>Each time you login to a UNIX host, the system looks in your home directory for initialisation files. 
	Information in these files is used to set up your working environment. 
	The C and TC shells uses two files called .login and .cshrc (note that both file names begin with a dot)<sup>1</sup>.</p>

	<p>At login the C shell first reads .cshrc followed by .login.</p>

	<p>.login is to set conditions which will apply to the whole session and to perform actions that are relevant only at login.</p>

	<p>.cshrc is used to set conditions and perform actions specific to the shell and to each invocation of it.</p>

	<p>The guidelines are to set ENVIRONMENT variables in the .login file and SHELL variables in the .cshrc file.</p>

	<p>
		<span class = "bold">WARNING: </span>
		NEVER put commands that run graphical displays (e.g. a web browser) in your .cshrc or .login file.
	</p>

	<h2>Setting shell variables in the .cshrc file</h2>

	<p>For example, to change the number of shell commands saved in the history list, 
	you need to set the shell variable history. It is set to 100 by default, but you can increase this if you wish<sup>1</sup>.</p>

	<div class="boxed">set history = 200</div>

	<p>Check this has worked by typing the following.</p>

	<div class="boxed">echo $history</div>

	<p>However, this has only set the variable for the lifetime of the current shell. 
	If you open a new xterm window, it will only have the default history value set. 
	To PERMANENTLY set the value of history, you will need to add the set command to the .cshrc file<sup>1</sup>.</p>

	<p>First open the .cshrc file in a text editor. An easy, user-friendly editor to use is nedit.</p>

	<div class="boxed">nedit ~/.cshrc</div>

	<p>Add the following line AFTER the list of other commands.</p>

	<p>set history = 200</p>

	<p>Save the file and force the shell to reread its .cshrc file buy using the shell source command<sup>1</sup>.</p>

	<div class="boxed">source .cshrc</div>

	<p>Check this has worked by typing the following.</p>

	<div class="boxed">echo $history</div>

	<h2>Setting the path</h2>

	<p>When you type a command, your path (or PATH) variable defines in which directories the shell will look to find the 
	command you typed. If the system returns a message saying "command: Command not found", this indicates that either the 
	command doesn't exist at all on the system or it is simply not in your path<sup>1</sup>.</p>

	<p>For example, to run units, you either need to directly specify the units path 
	(~/units174/bin/units), or you need to have the directory ~/units174/bin in your path.</p>

	<p>You can add it to the end of your existing path (the $path represents this) by issuing the command:</p>

	<div class="boxed">set path = ($path ~/units174/bin)</div>

	<p>Test that this worked by trying to run units in any directory other that where units is actually located.</p>

	<div class="boxed">cd<br/>units</div>

	<p>To add this path PERMANENTLY, add the following line to your .cshrc AFTER the list of other commands.</p>

	<div class="boxed">set path = ($path ~/units174/bin)</div>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix8.html">UNIX Tutorial Eight</a></li>
	</ol>
	
</article>

<article>
		<h1>Comments</h1>
		<form 	action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>" 
					method="post" 
					name="orderForm"
					class="comments">

            <div class="question">
				<textarea name="comment" rows="4" cols="50" required></textarea>
            </div>
			
		<div class="buttons">
			<input type="submit" value="Submit"> <input type="reset">
		</div>
		
		</form>
		<div>
			<?php 
				if ( !$link ) 
				{
					echo( "Connect failed: " . mysqli_connect_error());
					exit();
				}
				$query = "SELECT `comment` FROM `unix101Comment` WHERE `chapter`=" . $chapter;
				$result = mysqli_query( $link, $query );
				
				$num_rows = mysqli_affected_rows( $link );
				if ( $result && $num_rows > 0 ) 
				{
					while ( $row = mysqli_fetch_assoc( $result ) ) 
					{
						$display .= '<div class="comment">';
						foreach ( $row as $index => $field ) 
						{ 
							$display .= $field;
						}
						$display .= "</div>";
					}
					
					echo $display;
				}
				
			?>
		</div>
	</article>
	
<?php include '../style/footer.php'; ?>