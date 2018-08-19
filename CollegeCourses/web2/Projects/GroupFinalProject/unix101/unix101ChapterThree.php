<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 3;
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
	<h1>Chapter 3</h1>

	<h2>Redirection</h2>

	<p>Most processes initiated by UNIX commands write to the standard output (that is, they write to the terminal screen), 
	and many take their input from the standard input (that is, they read it from the keyboard). 
	There is also the standard error, where processes write their error messages, by default, to the terminal screen<sup>1</sup>.
	We have already seen one use of the cat command to write the contents of a file to the screen<sup>2</sup>.
	Now type cat without specifing a file to read.</p>

	<div class="boxed">cat</div>

	<p>Then type a few words on the keyboard and press the [Return] key"<sup>2</sup>
	Finally hold the [Ctrl] key down and press [d] (written as ^D for short) to end the input<sup>2</sup>.
	What has happened?
	If you run the cat command without specifing a file to read, it reads the standard input (the keyboard), and on receiving the 'end of file' (^D), 
	copies it to the standard output (the screen)<sup>2</sup>.
	In UNIX, we can redirect both the input and the output of commands.</p>

	<h2>Redirecting the Output</h2>

	<p>We use the > symbol to redirect the output of a command<sup>2</sup>. For example, to create a file called list1 containing a list of fruit, type the following.</p>

	<div class="boxed">cat > list1</div>

	<p>Then type in the names of some fruit. Press [Return] after each one<sup>2</sup>.</p>

	<div class="boxed">pear<br/>
                       banana<br/>
                       apple<br/>
                       ^D {this means press [Ctrl] and [d] to stop}</div>

	<p>What happens is the cat command reads the standard input (the keyboard) and the > redirects the output, 
	which normally goes to the screen, into a file called list1.
	To read the contents of the file, type the following.</p>

	<div class="boxed">cat list1</div>

	<h2>Appending to a file</h2>

	<p>The form >> appends standard output to a file<sup>2</sup>. So to add more items to the file list1, type the following.</p>

	<div class="boxed">cat >> list1</div>

	<p>Then type in the names of more fruit<sup>2</sup>.</p>

	<div class="boxed">peach<br/>
                       grape<br/>
                       orange<br/>
                       ^D (Control D to stop)</div>

	<p>To read the contents of the file, type the following.</p>

	<div class="boxed">cat list1</div>

	<p>You should now have two files. One contains six fruit, the other contains four fruit.
	We will now use the cat command to join (concatenate) list1 and list2 into a new file called biglist. Type the following.</p>

	<div class="boxed">cat list1 list2 > biglist</div>

	<p>What this is doing is reading the contents of list1 and list2 in turn, then outputing the text to the file biglist<sup>2</sup>.
	To read the contents of the new file, type the following.</p>

	<div class="boxed">cat biglist</div>

	<h2>Redirecting the Input</h2>

	<p>We use the &lt; symbol to redirect the input of a comman<sup>2</sup>.
	The command sort alphabetically or numerically sorts a list. Type the following.</p>

	<div class="boxed">sort</div>
	
	<p>Then type in the names of some animals. Press [Return] after each one.</p>

	<div class="boxed">dog<br/>
                       cat<br/>
                       bird<br/>
                       ape<br/>
                       ^D (Control d to stop)</div>

	<p>The output will be: [apes, bird, cat, dog]
	Using &lt; you can redirect the input to come from a file rather than the keyboard. For example, to sort the list of fruit, type the following.</p>

	<div class="boxed">sort &lt; biglist</div>

	<p>and the sorted list will be output to the screen.
	To output the sorted list to a file, type the following</p>

	<div class="boxed">sort &lt; biglist > slist</div>

	<p>Use cat to read the contents of the file list<sup>2</sup></p>

	<h2>Pipes</h2>

	<p>To see who is on the system with you, type the following.</p>

	<div class="boxed">who</div>

	<p>One method to get a sorted list of names is to type the following.</p>

	<div class="boxed">who > names.txt<br/>sort &lt; names.txt</div>

	<p>This is a bit slow and you have to remember to remove the temporary file called names when you have finished. 
	What you really want to do is connect the output of the who command directly to the input of the sort command. 
	This is exactly what pipes do. The symbol for a pipe is the vertical bar<sup>2</sup>.</p>

	<p>For example, when you type the following.</p>

	<div class="boxed">who | sort</div>

	<p>This will give the same result as above, but quicker and cleaner
	The full pathname will look something like this -<br>/home/its/ug1/ee51v</p>

	<p>"To find out how many users are logged on, type the following.</p>

	<div class="boxed">who | wc -l</div>
	
	<h1>Chapter Three Summary</h1>
	<table>

		<tr>
			<th>Command</th>
			<th>Meaning</th>
		</tr>

		<tr>
			<td>command > file</td>   
			<td>Redirect standard output to a file</td>
		</tr>

		<tr>
			<td>command >> file</td> 
			<td>Append standard output to a file</td>
		</tr>

		<tr>
			<td>command file</td>
			<td>Redirect standard input from a file</td>
		</tr>
		
		<tr>
			<td>command1 | command2</td>
			<td>Pipe the output of command1 to the input of command2</td>
		</tr>
		
		<tr>
			<td>cat file1 file2 > file0</td>
			<td>Concatenate file 1 and file2 to file0</td>
		</tr>
		
		<tr>
			<td>sort</td>
			<td>Sort data</td>
		</tr>
		
		<tr>
			<td>who</td>
			<td>List users currently logged in</td>
		</tr>
		
	</table>

	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix1.html">UNIX Tutorial One</a></li>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix3.html">UNIX Tutorial Three</a></li>
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