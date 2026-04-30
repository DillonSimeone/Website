<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 6;
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
	<h1>Chapter 6</h1>

	<h2>Other useful UNIX commands</h2>
	<h3>quota</h3>

	<p>All students are allocated a certain amount of disk space on the file system for their personal files,
	usually about 100Mb. If you go over your quota, you are given 7 days to remove excess files<sup>1</sup>.
	To check your current quota and how much of it you have used, type the following.</p>

	<div class="boxed">quota -v</div>

	<h3>df</h3>

	<p>The df command reports on the space left on the file system<sup>1</sup>. For example, to find out how much space is left on the fileserver, 
	type the following.</p>

	<div class="boxed">df .</div>

	<h3>du</h3>

	<p>The du command outputs the number of kilobyes used by each subdirectory<sup>1</sup>. Useful if you have gone over quota and you want to find out which 
	directory has the most files. In your home-directory, type the following.</p>

	<div class="boxed">du -s *</div>

	<p>The -s flag will display only a summary (total size) and the * means all files and directories<sup>1</sup>.</p>

	<h3>gzip</h3>

	<p>This reduces the size of a file, thus freeing valuable disk space<sup>1</sup>. 
	For example, type the following.</p>
	
	<div class="boxed">ls -l science.txt</div>

	<p>Also, note the size of the file using ls -l. Then to compress science.txt, type the following.</p>

	<div class="boxed">gzip science.txt</div>

	<p>This will compress the file and place it in a file called science.txt.gz.
	To see the change in size, type ls -l again.
	To expand the file, use the gunzip command<sup>1</sup>.</p>

	<div class="boxed">gunzip science.txt.gz</div>

	<h3>zcat</h3>

	<p>zcat will read gzipped files without needing to uncompress them first<sup>1</sup>.</p>

	<div class="boxed">zcat science.txt.gz</div>

	<p>If the text scrolls too fast for you, pipe the output though less.</p>

	<div class="boxed">zcat science.txt.gz | less</div>

	<h3>file</h3>

	<p>file classifies the named files according to the type of data they contain, 
	for example ascii (text), pictures, compressed data, etc<sup>1</sup>. 
	To report on all files in your home directory, type the following.</p>

	<div class="boxed">file *</div>

	<h3>diff</h3>

	<p>This command compares the contents of two files and displays the differences<sup>1</sup>. 
	Suppose you have a file called file1 and you edit some part of it and save it as file2. 
	To see the differences type the following.</p>

	<div class="boxed">diff file1 file2</div>

	<p>Lines beginning with a &lt; denotes file1, while lines beginning with a > denotes file2<sup>1</sup>.</p>

	<h3>find</h3>

	<p>This searches through the directories for files and directories with a given name, date, 
	size, or any other attribute you care to specify. It is a simple command but with many options 
	- you can read the manual by typing 'man find'<sup>1</sup>.
	To search for all fies with the extention .txt, starting at the current directory (.) 
	and working through all sub-directories, then printing the name of the file to the screen, type the following.</p>

	<div class="boxed">find . -name "*.txt" -print</div>

	<p>To find files over 1Mb in size, and display the result as a long listing, type the following.</p>

	<div class="boxed">find . -size +1M -ls</div>

	<h3>history</h3>

	<p>The C shell keeps an ordered list of all the commands that you have entered<sup>1</sup>. 
	Each command is given a number according to the order it was entered.</p>

	<div class="boxed">history (show command history list)</div>

	<p>If you are using the C shell, you can use the exclamation character (!) to recall commands easily<sup>1</sup>.</p>

	<div class="boxed">!! (recall last command)</div>
	<div class="boxed">!-3 (recall third most recent command)</div>
	<div class="boxed">!5 (recall 5th command in list)</div>
	<div class="boxed">!grep (recall last command starting with grep)</div>

	<p>You can increase the size of the history buffer<sup>1</sup> by typing the following.</p>

	<div class="boxed">set history=100</div>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix6.html">UNIX Tutorial Six</a></li>
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