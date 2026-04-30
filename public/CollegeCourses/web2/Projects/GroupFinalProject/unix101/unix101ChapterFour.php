<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 4;
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
	<h1>Chapter 4</h1>

	<h2>Wildcards </h2>
	<h3>The * wildcard</h3>

	<p>The character * is called a wildcard, and will match against none or more character(s) in a file 
	(or directory) name<sup>1</sup>. For example, in your unixstuff directory, type the following.</p>

	<div class="boxed">ls list*</div>

	<p>This will list all files in the current directory starting with 'list'.
	Try typing the following.</p>

	<div class="boxed">ls *list</div>

	<p>This will list all files in the current directory ending with list </p>

	<h3>The ? wildcard</h3>

	<p>The character ? will match exactly one character.<br/>
	So ?ouse will match files like house and mouse, but not grouse.<br/>
	Try typing the following.</p>

	<div class="boxed">ls ?list</div>

	<h2>Filename conventions</h2>

	<p>We should note here that a directory is merely a special type of file. So the rules and conventions for naming 
	files apply also to directories<sup>1</sup>.
	In naming files, characters with special meanings such as / * & % , should be avoided. Also, avoid using spaces within names. 
	The safest way to name a file is to use only alphanumeric characters, that is, letters and numbers, together with _ (underscore) 
	and . (dot).</p>

	<table>

		<tr>
			<th>Good filenames</th>
			<th>Bad filenames</th>
		</tr>

		<tr>
			<td>project.txt</td>   
			<td>project</td>
		</tr>

		<tr>
			<td>my_big_program.c</td> 
			<td>my big program.c</td>
		</tr>

		<tr>
			<td>fred_dave.doc</td>
			<td>fred & dave.doc</td>
		</tr>        

	</table>

	<p>File names conventionally start with a lower-case letter, and may end with a dot followed by a group of letters 
	indicating the contents of the file<sup>1</sup>. For example, all files consisting of C code may be named with the ending .c, 
	for example, prog1.c . Then in order to list all files containing C code in your home directory, you need only 
	type ls *.c in that directory.</p>

	<h2>Getting Help</h2>
	<h3>On-line Manuals</h3>

	<p>There are on-line manuals which gives information about most commands.
	The manual pages tell you which options a particular command can take,
	and how each option modifies the behaviour of the command.
	Type man command to read the manual page for a particular command <sup>1</sup>.
	For example, to find out more about the wc (word count) command, type the following.</p>

	<div class="boxed">man wc</div>

	<p>Alternatively</p>

	<div class="boxed">whatis wc</div>

	<p>This gives a one-line description of the command, but omits any information about options etc<sup>1</sup>.</p>

	<h3>Apropos</h3>

	<p>When you are not sure of the exact name of a command....</p>
	
	<div class="boxed">apropos keyword</div>

	<p>This will give you the commands with keyword in their manual page header<sup>1</sup>. For example, try typing the following.</p>

	<div class="boxed">apropos copy</div>

	<h1>Chapter Four Summary</h1>
	<table>

		<tr>
			<th>Command</th>
			<th>Meaning</th>
		</tr>
		
		<tr>
			<th>*</th>
			<th>Match any numbers of characters</th>
		</tr>
		
		<tr>
			<th>?</th>
			<th>Match One character</th>
		</tr>
		
		<tr>
			<th>man command</th>
			<th>Read the online manual page for a comamnd</th>
		</tr>
		
		<tr>
			<th>whatis command</th>
			<th>Brief description of a command</th>
		</tr>
		
		<tr>
			<th>apropos keyword</th>
			<th>Match commands with keyword in their man pages</th>
		</tr>
		
	</table>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix4.html">UNIX Tutorial Four</a></li>
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