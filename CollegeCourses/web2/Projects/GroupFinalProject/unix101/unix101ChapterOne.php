<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 1;
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
	<h1>Chapter 1</h1>

	<h2>Listing File and Directories</h2>
	<h3>ls (list)</h3>

	<p>To find out what is in your home directory, type ”ls".
	The ls command (lowercase L and lowercase S) lists the contents of your current working directory<sup>1</sup>.</p>
	
	<div class="boxed">ls</div>
	<figure>
		<img src="<?php echo $BASE_URL . 'image/unix/chapter1/ls.gif' ?>" alt="Command example">
	</figure>

	<p>ls does not, in fact, cause all the files in your home directory to be listed, but only those ones whose name does not begin with a dot (.) Files beginning with a dot (.) are 
	known as hidden files and usually contain important program configuration information. They are hidden because you should not change them unless you are very familiar with UNIX!!!
	To list all files in your home directory including those whose names begin with a dot, type "ls -a"
	As you can see, ls -a lists files that are normally hidden<sup>1</sup>.</p>
	
	<div class="boxed">ls -a</div>
	<figure> 	
		<img src="<?php echo $BASE_URL . 'image/unix/chapter1/ls_a.gif' ?>" alt="Command example">
	</figure>

	<h2>Making Directories</h2>
	<h3>mkdir (make directory)</h3>

	<p>We will now make a subdirectory in your home directory to hold the files you will be creating and using in the course of this tutorial. 
	To make a subdirectory called unixstuff in your current working directory type the following<sup>1</sup>.</p>

	<div class="boxed">mkdir unixstuff</div>

	<p>"To see the directory you have just created, type the following.</p>

	<div class="boxed">ls</div>
	
	<h2>Changing to a different directory</h2>
	<h3>cd(change directory)</h3>

	<p>“The command cd directory means change the current working directory to 'directory'. 
	The current working directory may be thought of as the directory you are in, i.e. your current position in the file-system tree<sup>1</sup>.
	To change to the directory you have just made, type the following.</p>
	
	<div class="boxed">cd unixstuff</div>
	
	<h2>The directories . and ..</h2>
	<h3>the current directory (.)</h3>

	<p>In UNIX, the period key (.) represents the current directory, so typing "cd ." will not move you.</p>

	<div class="boxed">cd .</div>

	<p>This may not seem very useful at first, but using "." as the name of the current directory will save a lot of typing, as we shall see later in the tutorial<sup>1</sup>.</p>

	<p><span class = "bold">NOTE:</span> There is a space between cd and the dot.</p>

	<h3>the parent directory ".."</h3>
	<p>Typing two periods ".." means the parent of the current directory. This will take you one directory up the hierarchy, back to your home directory<sup>1</sup>. Try it now.</p>

	<div class="boxed">cd ..</div>

	<p><span class = "bold">Note:</span> Typing cd with no argument always returns you to your home directory. This is very useful if you are lost in the file system<sup>1</sup>.</p>

	<h2>Pathnames</h2>
	<h3>pwd (print working directory)</h3>

	<p>Pathnames enable you to work out where you are in relation to the whole file-system<sup>1</sup>.
	For example, to find out the absolute pathname of your home-directory, type cd to get back to your home-directory and then type the following.</p>

	<div class="boxed">pwd</div>
	<figure>
		<img src="http://www.ee.surrey.ac.uk/Teaching/Unix/media/unix-tree.png" alt="Command example">
	</figure>

	<p>The full pathname will look something like this: <br/>/home/folder/anotherfolder/folderthatyouarein</p>
	
	<h1>Chapter One Summary</h1>
	<table>

		<tr>
			<th>Command</th>
			<th>Meaning</th>
		</tr>

		<tr>
			<td>ls</td>   
			<td>List Files and Directories</td>
		</tr>

		<tr>
			<td>ls -a</td> 
			<td>List All Files and Directories</td>
		</tr>

		<tr>
			<td>mkdir</td>
			<td>Make a directory</td>
		</tr>
		
		<tr>
			<td>cd Directory</td>
			<td>Change to named Directory</td>
		</tr>
		
		<tr>
			<td>cd</td>
			<td>Change to home directory</td>
		</tr>
		
		<tr>
			<td>cd ~</td>
			<td>Change to home directory</td>
		</tr>
		
		<tr>
			<td>cd ..</td>
			<td>Change to parent diectory</td>
		</tr>
		
		<tr>
			<td>pwd</td>
			<td>Display the path of the current directory</td>
		</tr>

	</table>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix1.html">UNIX Tutorial One</a></li>
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