<?php
	include '../style/header.php';
	include '../style/nav.php';
	
	$chapter = 7;
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
	<h1>Chapter 7</h1>

	<h2>Compiling UNIX software packages</h2>

	<p>We have many public domain and commercial software packages installed on our systems, which are 
	available to all users. However, students are allowed to download and install small software packages 
	in their own home directory, software usually only useful to them personally<sup>1</sup>.
	There are a number of steps needed to install the software.</p>

	<p>Locate and download the source code (which is usually compressed)<br/>
        Unpack the source code<br/>
        Compile the code<br/>
        Install the resulting executable<br/>
        Set paths to the installation directory.</p>

	<p>Of the above steps, probably the most difficult is the compilation stage<sup>1</sup>.</p>

	<h3>Compiling Source Code</h3>

	<p>All high-level language code must be converted into a form the computer understands. For example, 
	C language source code is converted into a lower-level language called assembly language. 
	The assembly language code made by the previous stage is then converted into object code which are 
	fragments of code which the computer understands directly. The final stage in compiling a program 
	involves linking the object code to code libraries which contain certain built-in functions. 
	This final stage produces an executable program<sup>1</sup>.</p>

	<p>To do all these steps by hand is complicated and beyond the capability of the ordinary user. 
	A number of utilities and tools have been developed for programmers and end-users to simplify these steps.</p>

	<h3>make and the Makefile</h3>

	<p>The make command allows programmers to manage large programs or groups of programs. It aids in developing 
	large programs by keeping track of which portions of the entire program have been changed, compiling only those parts of the program 
	which have changed since the last compile<sup>1</sup>.
	The make program gets its set of compile rules from a text file called Makefile which resides in the same directory as the source files. 
	It contains information on how to compile the software, e.g. the optimisation level, whether to include debugging info in the executable. 
	It also contains information on where to install the finished compiled binaries (executables), manual pages, data files, dependent library files, 
	configuration files, etc<sup>1</sup>.</p>
	<p>Some packages require you to edit the Makefile by hand to set the final installation directory and any other parameters. 
	However, many packages are now being distributed with the GNU configure utility.</p>

	<h3>configure</h3>

	<p>As the number of UNIX variants increased, it became harder to write programs which could run on all variants. 
	Developers frequently did not have access to every system, and the characteristics of some systems changed from version to version. 
	The GNU configure and build system simplifies the building of programs distributed as source code. All programs are built using a simple, standardised, two step process. 
	The program builder need not install any special tools in order to build the program<sup>1</sup>.</p>

	<p>The configure shell script attempts to guess correct values for various system-dependent variables used 
	during compilation. It uses those values to create a Makefile in each directory of the package<sup>1</sup>.</p>

	<p>The simplest way to compile a package is to do the following:</p>

	<ol>
		<li>cd to the directory containing the package's source code.</li>
		<li>Type ./configure to configure the package for your system.</li>
		<li>Type make to compile the package.</li>
		<li>Optionally, type make check to run any self-tests that come with the package.</li>
		<li>Type make install to install the programs and any data files and documentation.</li>
		<li>Optionally, type make clean to remove the program binaries and object files from the source code directory.</li>
	</ol>

	<p>The configure utility supports a wide variety of options. 
	You can usually use the --help option to get a list of interesting options for a particular configure script<sup>1</sup>.
	The only generic options you are likely to use are the --prefix and --exec-prefix options. 
	These options are used to specify the installation directories.
	The directory named by the --prefix option will hold machine independent files such as documentation, data and configuration files.
	The directory named by the --exec-prefix option, (which is normally a subdirectory of the --prefix directory), will hold machine dependent files such as executables<sup>1</sup>.</p>

	<h2>Downloading source code</h2>

	<p>For this example, we will download a piece of free software that converts between different units of measurements.</p>

	<div class="boxed">mkdir download</div>

	<p><a href = "http://www.ee.surrey.ac.uk/Teaching/Unix/units-1.74.tar.gz">Download the software here</a> and save it to your new download directory.</p>

	<h2>Extracting the source code</h2>

	<p>Go into your download directory and list the contents.</p>

	<div class="boxed">cd download<br/>ls -l</div>

	<p>As you can see, the filename ends in tar.gz. The tar command turns several files and directories into one single tar file. 
	This is then compressed using the gzip command (to create a tar.gz file)<sup>1</sup>.</p>

	<p>First unzip the file using the gunzip command. This will create a .tar file.</p>

	<div class="boxed">cd download<br/>ls -l</div>

	<div class="boxed">gunzip units-1.74.tar.gz</div>

	<p>Then extract the contents of the tar file.</p>

	<div class="boxed">tar -xvf units-1.74.tar</div>

	<p>Again, list the contents of the download directory, then go to the units-1.74 sub-directory.</p>

	<div class="boxed">cd units-1.74</div>

	<h2>Configuring and creating the Makefile</h2>   

	<p>The first thing to do is carefully read the README and INSTALL text files (use the less command). 
	These contain important information on how to compile and run the software.</p>

	<p>The units package uses the GNU configure system to compile the source code. We will need to specify the installation directory, 
	since the default will be the main system area which you will not have write permissions for. 
	We need to create an install directory in your home directory<sup>1</sup>.</p>

	<div class="boxed">mkdir ~/units174</div>

	<p>Then run the configure utility setting the installation path to this.</p>

	<div class="boxed">./configure --prefix=$HOME/units174</div>

	<p>
		<span class = "boxed" style="margin-left: 0px">Note:</span>
			The $HOME variable is an example of an environment variable. 
			The value of $HOME is the path to your home directory. Just type <br/>
			<br/>% echo $HOME<br/>
			<br/>to show the contents of this variable. We will learn more about environment variables in a later chapter.
	</p>

	<p>If configure has run correctly, it will have created a Makefile with all necessary options. 
	You can view the Makefile if you wish (use the less command), but do not edit the contents of this<sup>1</sup>.</p>

	<h2>Building the package</h2>

	<p>Now you can go ahead and build the package by running the make command.</p>

	<div class="boxed">make</div>

	<p>After a minute or two (depending on the speed of the computer), the executables will be created. 
	You can check to see everything compiled successfully by typing the following.</p>

	<div class="boxed">make check</div>

	<p>If everything is okay, you can now install the package.</p>

	<div class="boxed">make install</div>

	<p>This will install the files into the ~/units174 directory you created earlier.</p>

	<h2>Running the software</h2>

	<p>You are now ready to run the software (assuming everything worked).</p>

	<div class="boxed">cd ~/units174</div>

	<p>If you list the contents of the units directory, you will see a number of subdirectories<sup>1</sup>.</p>

	<table>

		<tr>
			<td>bin</td>   
			<td>The binary executable</td>
		</tr>

		<tr>
			<td>info</td> 
			<td>GNU info formatted documentation</td>
		</tr>

		<tr>
			<td>man</td>
			<td>Man pages</td>
		</tr>    

		<tr>
			<td>share</td>
			<td>Shared data files</td>
		</tr>

	</table>

	<p>To run the program, change to the bin directory and type the following.</p>

	<div class="boxed">./units</div>

	<p>As an example, convert 6 feet to metres.</p>

	<div class="boxed">You have: 6 feet<br/>You want: metres</div>

	<div class="boxed">* 1.8288</div>

	<p>If you get the answer 1.8288, congratulations, it worked.
	To view what units it can convert between, view the data file in the share directory (the list is quite comprehensive).
	To read the full documentation, change into the info directory and type the following.</p>

	<div class="boxed">info --file=units.info</div>

	<h2>Stripping unnecessary code</h2>

	<p>When a piece of software is being developed, it is useful for the programmer to include debugging information into the resulting executable.
	This way, if there are problems encountered when running the executable, the programmer can load the executable into a debugging software package and track down any software bugs<sup>1</sup>.</p>

	<p>This is useful for the programmer, but unnecessary for the user. We can assume that the package, once finished and available for download has already been tested and debugged. 
	However, when we compiled the software above, debugging information was still compiled into the final executable. Since it is unlikey that we are going to need this debugging information, 
	we can strip it out of the final executable. One of the advantages of this is a much smaller executable, which should run slightly faster<sup>1</sup>.</p>

	<p>What we are going to do is look at the before and after size of the binary file. 
	First change into the bin directory of the units installation directory<sup>1</sup>.</p>

	<div class="boxed">cd ~/units174/bin<br/>ls -l</div>

	<p>As you can see, the file is over 100 kbytes in size. You can get more information on the type of file by using the file command.</p>

	<div class="boxed">file units</div>

	<div class="boxed">units: ELF 32-bit LSB executable, Intel 80386, version 1, dynamically linked (uses shared libs), not stripped.</div>

	<p>To strip all the debug and line numbering information out of the binary file, use the strip command<sup>1</sup>.</p>

	<div class="boxed">strip units<br/>ls -l</div>

	<p>As you can see, the file is now 36 kbytes - a third of its original size. Two thirds of the binary file was debug code!!!
	Check the file information again.</p>

	<div class="boxed">file units</div>

	<div class="boxed">units: ELF 32-bit LSB executable, Intel 80386, version 1, dynamically linked (uses shared libs), stripped.</div>

	<p>Sometimes you can use the make command to install pre-stripped copies of all the binary files when you install the package. 
	Instead of typing make install, simply type make install-strip<sup>1</sup>.</p>
	
	<br/>
	<h2> Sources </h2>
	<ol>
		<li><a href="http://www.ee.surrey.ac.uk/Teaching/Unix/unix7.html">UNIX Tutorial Seven</a></li>
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