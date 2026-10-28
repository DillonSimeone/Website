<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 2;
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
	<h1>Chapter 2</h1>

	
	<h2>Copying Files</h2>
	<h3>cp (copy)</h3>

	<p>"cp file1 file2" is the command which makes a copy of file1 in the current working directory and calls it file2<sup>1</sup>.
	What we are going to do now, is to take a file stored in an open access area of the file system, and use the cp command to copy it to your unixstuff directory.
	First, use the cd command to go to your unixstuff directory.</p>

	<div class="boxed">cd ~/unixstuff</div>

	<p>Then at the UNIX prompt, type the following.</p>

	<div class="boxed">cp example.txt list1.txt .</div>

	<p><span class = "bold">Note: </span>Don't forget the dot . at the very end. Remember, in UNIX, the dot means the current directory<sup>1</sup>.
	The above command means copy the file science.txt to the current directory, keeping the name the same.</p>

	<p><span class = "bold">Note: </span>The directory /vol/examples/tutorial/ is an area to which everyone in the school has read and copy access. 
	If you are from outside the University, you can grab a copy of the file here. 
	Use 'File/Save As..' from the menu bar to save it into your unixstuff directory<sup>1</sup>.</p>

	<h2>Moving files</h2>
	<h3>mv (move)</h3>

	<p>"mv file1 file2" moves (or renames) file1 to file2.
	To move a file from one place to another, use the mv command. This has the effect of moving rather than copying the file, 
	so you end up with only one file rather than two<sup>1</sup>.
	It can also be used to rename a file, by moving the file to the same directory, but giving it a different name.</p>

	<p>We are now going to move the file science.bak to your backup directory.
	First, change directories to your unixstuff directory (Do you remember how?). Then, inside the unixstuff directory, type the following.</p>

	<div class="boxed">mv example.txt www/.</div>

	<p>Type ls and ls backups to see if it has worked.</p>

	<h2>Removing files and directories</h2>
	<h3>rm (remove), rmdir (remove directory)</h3>

	<p>To delete (remove) a file, use the rm command. As an example, we are going to create a copy of the science.txt file then delete it<sup>1</sup>.
	Inside your unixstuff directory, type the following.</p>

	<div class="boxed">cp science.txt tempfile.txt<br/>ls<br/>rm tempfile.txt<br/>ls</div>

	<p>You can use the rmdir command to remove a directory (make sure it is empty first). 
	Try to remove the backups directory. You will not be able to because UNIX will not let you remove a non-empty directory<sup>1</sup>.</p>
	
	<div class="boxed">rm and rmdir</div>

	<h2>Displaying the contents of a file on the screen</h2>
	<h3>clear (clear screen)</h3>

	<p>Before you start the next section, you may like to clear the terminal window of the previous commands so the output of the following commands can be clearly understood<sup>1</sup>
	At the prompt, type the following.</p>

	<div class="boxed">clear</div>

	<p>This will clear all text and leave you with the % prompt at the top of the window.</p>

	<h3>cat (concatenate)</h3>

	<p>The command cat can be used to display the contents of a file on the screen<sup>1</sup>. Type the following.</p>

	<div class="boxed">cat example.txt</div>

	<p>As you can see, the file is longer than than the size of the window, so it scrolls past the border. making it unreadable.</p>

	<div class="boxed">cat example.txt</div>

	<h3>less</h3>

	<p>The command less writes the contents of a file onto the screen a page at a time<sup>1</sup>. Type the following.</p>

	<div class="boxed">less example.txt</div>

	<p>Press the Space-bar key if you want to see another page, and type "q" if you want to quit reading. As you can see, less is used in preference to cat for long files<sup>1</sup>.</p>

	<div class="boxed">less example.txt</div>

	<h3>head</h3>

	<p>The head command writes the first ten lines of a file to the screen<sup>1</sup>.
	First clear the screen then type the following.</p>

	<div class="boxed">head example.txt</div>

	<p>Then type the following.</p>

	<div class="boxed">head -5 science.txt</div>

	<p>What did the -5 do to the head command?</p>

	<h3>tail</h3>

	<p>The tail command writes the last ten lines of a file to the screen<sup>1</sup>.
	Clear the screen and type the following.</p>

	<div class="boxed">tail example.txt</div>

	<p>How can you view the last 15 lines of the file?</p>

	<div class="boxed">tail example.txt</div>

	<h2>Searching the contents of a file</h2>
	<h3>Simple searching using less</h3>

	<p>Using less, you can search though a text file for a keyword<sup>1</sup>. For example, to search through science.txt for the word 'science', type the following.</p>

	<div class="boxed">less example.txt</div>
	
	<p>then, still in less, type a forward slash [/] followed by the word to search.</p>

	<div class="boxed">/science</div>

	<div class="boxed">less example.txt /example</div>

	<p>As you can see, less finds and highlights the keyword. Type [n] to search for the next occurrence of the word.</p>

	<h3>grep </h3>

	<p>grep (don't ask why it's called grep) is one of many standard UNIX utilities. It searches files for specified words or patterns<sup>1</sup>. 
	First clear the screen, then type the following.</p>

	<div class="boxed">grep example example.txt</div>

	<p>As you can see, grep has printed out each line containg the word science.
	Or has it?
	Try typing the following.</p>

	<div class="boxed">grep Example example.txt</div>

	<p>The grep command is case sensitive<sup>1</sup>; it distinguishes between Science and science.
	To ignore upper/lower case distinctions, use the -i option, i.e. type the following.</p>

	<div class="boxed">grep -i Example example.txt</div>

	<p>To search for a phrase or pattern, you must enclose it in single quotes (the apostrophe symbol '). For example, to search for spinning top, type the following.</p>

	<div class="boxed">grep -i 'example' example.txt</div>

	<p>Some of the other options of grep are:<br/>
        -v display those lines that do NOT match<br/>
        -n precede each matching line with the line number<br/> 
        -c print only the total count of matched lines</p>

	<p>Try some of them and see the different results. Don't forget, you can use more than one option at a time<sup>1</sup>. For example, the number of lines without the words science or Science is the following.</p>

	<div class="boxed">grep -ivc example example.txt</div>

	<h3>wc (word count)</h3>

	<p>A handy little utility is the wc command, short for word count<sup>1</sup>. 
	To do a word count on science.txt, type the following.</p>

	<div class="boxed">wc -w science.txt</div>

	<p>To find out how many lines the file has, type the following.</p>

	<div class="boxed">wc -l science.txt</div>

	<h1>Chapter Two Summary</h1>
	<table>

		<tr>
			<th>Command</th>
			<th>Meaning</th>
		</tr>

		<tr>
			<td>cp file1 file2</td>   
			<td>Copy file1 and call it file2</td>
		</tr>

		<tr>
			<td>mv file1 file2</td> 
			<td>Move or rename file1 to file2</td>
		</tr>

		<tr>
			<td>rm file</td>
			<td>Remove a file</td>
		</tr>
		
		<tr>
			<td>rmdir directory</td>
			<td>Remove a directory</td>
		</tr>
		
		<tr>
			<td>cat file</td>
			<td>Display a file</td>
		</tr>
		
		<tr>
			<td>less file</td>
			<td>Display page one page at a time</td>
		</tr>
		
		<tr>
			<td>head file</td>
			<td>Display the first few lines of a file</td>
		</tr>
		
		<tr>
			<td>tail file</td>
			<td>Display the last few lines of a file</td>
		</tr>
		
		<tr>
			<td>grep 'keyword' file</td>
			<td>Search a file for keywords</td>
		</tr>
		
		<tr>
			<td>wc file</td>
			<td>Count number of lines/words/characters in file</td>
		</tr>
		
	</table>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix2.html">UNIX Tutorial Two</a></li>
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