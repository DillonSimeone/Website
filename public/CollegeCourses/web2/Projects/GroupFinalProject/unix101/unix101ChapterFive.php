<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 5;
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
	<h1>Chapter 5</h1>

	<h2>File system security (access rights)</h2>

	<p>In your unixstuff directory, type the following.</p>

	<div class="boxed">ls -l (l for long listing!)</div>

	<p>You will see that you now get lots of details about the contents of your directory<sup>1</sup>.</p>

	<p>Each file (and directory) has associated access rights, which may be found by typing ls -l. 
	Also, ls -lg gives additional information as to which group owns the file<sup>1</sup> (beng95 in the following example).</p>

	<p><span class = "bold">"-rwxrw-r-- 1 ee51ab beng95 2450 Sept29 11:52 file1" </span></p>

	<p>In the left-hand column is a 10 symbol string consisting of the symbols d, r, w, x, -, and, occasionally, s or S. If d is present, 
	it will be at the left hand end of the string, and indicates a directory: otherwise - will be the starting symbol of the string.
	The 9 remaining symbols indicate the permissions, or access rights, and are taken as three groups of 3<sup>1</sup>.</p>

	<p>The left group of 3 gives the file permissions for the user that owns the file (or directory) (ee51ab in the above example);<br/>
	the middle group gives the permissions for the group of people to whom the file (or directory) belongs (eebeng95 in the above example);<br/>
	the rightmost group gives the permissions for all others<sup>1</sup>.</p>

	<h3>Access rights on files.</h3>

	<p>
		r (or -), indicates read permission (or otherwise), that is, the presence or absence of permission to read and copy the file <br/>
		w (or -), indicates write permission (or otherwise), that is, the permission (or otherwise) to change a file <br/>
		x (or -), indicates execution permission (or otherwise), that is, the permission to execute a file, where appropriate<sup>1</sup>.
	</p>

	<h3>Access rights on directories.</h3>

	<p>"r allows users to list files in the directory; <br/>
	w means that users may delete files from the directory or move files into it; <br/>
	x means the right to access files in the directory. This implies that you may read files 
	in the directory provided you have read permission on the individual files<sup>1</sup>.</p>

	<p>So, in order to read a file, you must have execute permission on the directory containing 
	that file<sup>1</sup>, and hence on any directory containing that directory as a subdirectory, and so on, 
	up the tree.</p>

	<h3>Some examples</h3>

	<div class="boxed">-rwxrwxrwx</div>
	<p>fa file that everyone can read, write and execute (and delete)"<sup>1</sup>.</p>
	
	<div class="boxed">-rw-------</div>
	<p>a file that only the owner can read and write - no-one else can read or write and no-one has execution rights (e.g. your mailbox file)" <sup>1</sup>.</p>

	<h2>Changing access rights</h2>
	<h3>chmod (changing a file mode)</h3>

	<p>Only the owner of a file can use chmod to change the permissions of a file. 
	The options of chmod are as follows.</p>

	<table>

		<tr>
			<th>Symbol</th>
			<th>Meaning</th>
		</tr>

		<tr>
			<td>u</td>   
			<td>user</td>
		</tr>

		<tr>
			<td>g</td> 
			<td>group</td>
		</tr>

		<tr>
			<td>o</td>
			<td>other</td>
		</tr>

		<tr>
			<td>a</td>
			<td>all</td>            
		</tr>

		<tr>
			<td>r</td>
			<td>read</td>
		</tr>

		<tr>
			<td>w</td> 
			<td>"write (and delete)" (Source: UNIX Tutorial Five).</td>
		</tr>

		<tr>
			<td>x</td>
			<td>"execute (and access directory)" (Source: UNIX Tutorial Five).</td>
		</tr>

		<tr>
			<td>+</td>
			<td>"add permission" (Source: UNIX Tutorial Five).</td>
		</tr>

		<tr>
			<td>-</td>
			<td>"take away permission" (Source: UNIX Tutorial Five).</td>
		</tr>

	</table>

	<p>For example, to remove read write and execute permissions on the file biglist for the group and others, type the following.</p>

	<div class="boxed">chmod go-rwx biglist</div>

	<p>This will leave the other permissions unaffected” (Source: UNIX Tutorial Five)
	To give read and write permissions on the file biglist to all<sup>1</sup>.</p>

	<div class="boxed">chmod a+rw biglist</div>     

	<h2>Processes and Jobs</h2>

	<p>A process is an executing program identified by a unique PID (process identifier)<sup>1</sup>. 
	To see information about your processes, with their associated PID and status, type the following.</p>

	<div class="boxed">ps</div>

	<p>A process may be in the foreground, in the background, or be suspended. 
	In general the shell does not return the UNIX prompt until the current process has finished executing<sup>1</sup>.
	Some processes take a long time to run and hold up the terminal. Backgrounding a long process has the effect that the 
	UNIX prompt is returned immediately, and other tasks can be carried out while the original process continues executing.</p>

	<h3>Running background processes</h3>

	<p>To background a process, type an & at the end of the command line. For example, the command sleep waits a given number of seconds before continuing. Type the following.</p>

	<div class="boxed">sleep 10</div>

	<p>This will wait 10 seconds before returning the command prompt %. Until the command prompt is returned, you can do nothing except wait<sup>1</sup>.
	To run sleep in the background, type the following.</p>

	<div class="boxed">sleep 10 &</div>

	<div class = "boxed">[1] 6259</div>

	<p>The & runs the job in the background and returns the prompt straight away, allowing you do run other programs 
	while waiting for that one to finish<sup>1</sup>.
	The first line in the above example is typed in by the user; the next line, indicating job number and PID, is returned by the machine. 
	The user is be notified of a job number (numbered from 1) enclosed in square brackets, together with a PID and is notified when a background 
	process is finished. Backgrounding is useful for jobs which will take a long time to complete<sup>1</sup>.</p>

	<h3>Backgrounding a current foreground process</h3>

	<p>At the prompt, type the following.</p>
	
	<div class="boxed">sleep 1000</div>

	<p>You can suspend the process running in the foreground by typing ^Z, i.e.hold down the [Ctrl] key and type [z]<sup>1</sup>. Then to put it in the background, type the following.</p>

	<div class="boxed">bg</div>

	<p><span class = "bold">Note: </span>do not background programs that require user interaction e.g. vi</p>

	<h2>Listing suspended and background processes</h2>

	<p>When a process is running, backgrounded or suspended, it will be entered onto a list along with a job number<sup>1</sup>.  
	To examine this list, type the following.</p>

	<div class="boxed">jobs</div>

	<p>"An example of a job list could be" (Source: UNIX Tutorial Five).</p>

	<div class = "boxed">[1] Suspended sleep 1000<br/>
                      [2] Running netscape<br/>
                      [3] Running matlab</div>

	<p>To restart (foreground) a suspended processes, type the following.</p>

	<div class="boxed">fg %jobnumber</div>

	<p>For example, to restart sleep 1000, type the following.</p>

	<div class="boxed">fg %1</div>

	<p>Typing fg with no job number foregrounds the last suspended process<sup>1</sup>.</p>

	<h2>Killing a process</h2>
	<h3>kill (terminate or signal a process)</h3>

	<p>It is sometimes necessary to kill a process (for example, when an executing program is in an infinite loop)<sup>1</sup>>.
	To kill a job running in the foreground, type ^C (control c)<sup>1</sup>. For example, run the following.</p>

	<div class="boxed">sleep 100 <br/>^C</div>

	<p>To kill a suspended or background process, type the following.</p>

	<div class="boxed">kill %jobnumber</div>

	<p>For example, run the following.</p>

	<div class="boxed">sleep 100 & <br/> jobs</div>

	<p>If it is job number 4, type the following.</p>

	<div class="boxed">kill %4</div>

	<p>To check whether this has worked, examine the job list again to see if the process has been removed. </p>

	<h3>ps (process status)</h3>

	<p>Alternatively, processes can be killed by finding their process numbers (PIDs) and using kill PID_number<sup>1</sup>.</p>

	<div class="boxed">sleep 1000 & <br/> ps</div>

	<div class = "boxed">
		PID TT S TIME COMMAND<br/>
        20077 pts/5 S 0:05 sleep 1000<br/>
        21563 pts/5 T 0:00 netscape<br/>
        21873 pts/5 S 0:25 nedit</div>

	<p>To kill off the process sleep 1000, type the following.</p>

	<div class="boxed">kill 20077</div>

	<p>and then type ps again to see if it has been removed from the list.
	If a process refuses to be killed, uses the -9 option, i.e. type the following<sup>1</sup>.</p>

	<div class="boxed">kill -9 20077</div>

	<p><span class = "bold">Note: </span>It is not possible to kill off other users' processes!!!</p>

	<h1>Capter Five Summary</h1>
	<table>
	
		<tr>
			<th>Command</th>
			<th>Meaning</th>
		</tr>
		
		<tr>
			<td>ls -lag</td>
			<td>List access rights for all files</td>
		</tr>
		
		<tr>
			<td>chmod [options] file</td>
			<td>Change access rights for named file</td>
		</tr>
		
		<tr>
			<td>command &</td>
			<td>Run command in background</td>
		</tr>
		
		<tr>
			<td>^C</td>
			<td>Kill the job running in the foreground</td>
		</tr>
		
		<tr>
			<td>^Z</td>
			<td>Suspend the job running in the foreground</td>
		</tr>
		
		<tr>
			<td>bg</td>
			<td>Background the suspended job</td>
		</tr>
		
		<tr>
			<td>jobs</td>
			<td>List current jobs</td>
		</tr>
		
		<tr>
			<td>fg %1</td>
			<td>Foreground job number 1</td>
		</tr>
		
		<tr>
			<td>kill %1</td>
			<td>Kill job number 1</td>
		</tr>
		
		<tr>
			<td>ps</td>
			<td>List current processes</td>
		</tr>
		
		<tr>
			<td>kill 26152</td>
			<td>Kill process number 26152</td>
		</tr>
		
	</table>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix5.html">UNIX Tutorial Five</a></li>
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