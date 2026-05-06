<?php
include './style/header.php';
include './style/nav.php';
?>	
<article>
	<h1>Unix Tutorial for users of all levels</h1>
	<p>
		This tutorial website is a complete guide to the Unix and Linux operating system and commonly used commands. 
		There are a total of eight chapters which cover the basics of UNIX / Linux commands ordered by the most simple to the most complex.
		If you are completely new to Unix. Read the article below covering on what exactly is Unix, then try learning the commands in Chapter One.
		If you are just looking for a specific command. Then scan large underlined words in each chapter for the command that you are looking for.
		Enjoy!
	</p>
</article>

<article>
	<h2>Unix Introduction</h2>

	<p>
	UNIX is an operating system which was first developed in the 1960s, and has been under constant development ever since. 
	By operating system, we mean the suite of programs which make the computer work. 
	It is a stable, multi-user, multi-tasking system for servers, desktops and laptops.
	</p>

	<p>
	UNIX systems also have a graphical user interface (GUI) similar to Microsoft Windows which provides an easy to use environment. 
	However, knowledge of UNIX is required for operations which aren't covered by a graphical program, 
	or for when there is no windows interface available, 
	for example, 
	in a telnet session.
	</p>
</article>

<article>
	<h2>Types of UNIX</h2>

	<p>
	There are many different versions of UNIX, although they share common similarities. 
	The most popular varieties of UNIX are Sun Solaris, GNU/Linux, and MacOS X.
	</p>

	<p>
	Here in the School, 
	we use Solaris on our servers and workstations, 
	and Fedora Linux on the servers and desktop PCs.
	</p>

	<h2>The UNIX operating system</h2>

	<p>
	The UNIX operating system is made up of three parts; 
	the kernel, 
	the shell and the programs.
	</p>
	<h2>The kernel</h2>

	<p>
	The kernel of UNIX is the hub of the operating system: 
	it allocates time and memory to programs and handles the filestore and communications in response to system calls.
	</p>

	<p>
	As an illustration of the way that the shell and the kernel work together, 
	suppose a user types rm myfile (which has the effect of removing the file myfile). 
	The shell searches the filestore for the file containing the program rm, 
	and then requests the kernel, 
	through system calls, 
	to execute the program rm on myfile. 
	When the process rm myfile has finished running, 
	the shell then returns the UNIX prompt % to the user, 
	indicating that it is waiting for further commands.
	</p>

	<h2>The shell</h2>

	<p>
	The shell acts as an interface between the user and the kernel. 
	When a user logs in, 
	the login program checks the username and password, 
	and then starts another program called the shell. 
	The shell is a command line interpreter (CLI). 
	It interprets the commands the user types in and arranges for them to be carried out. 
	The commands are themselves programs: 
	when they terminate, 
	+the shell gives the user another prompt (% on our systems).
	</p>

	<p>
	The adept user can customise his/her own shell, 
	and users can use different shells on the same machine. 
	Staff and students in the school have the tcsh shell by default.
	</p>

	<p>
	The tcsh shell has certain features to help the user inputting commands.
	</p>

	<p>
	Filename Completion - By typing part of the name of a command, 
	filename or directory and pressing the [Tab] key, the tcsh shell will complete the rest of the name automatically. 
	If the shell finds more than one name beginning with those letters you have typed, 
	it will beep, 
	prompting you to type a few more letters before pressing the tab key again.
	</p>

	<p>
	History - The shell keeps a list of the commands you have typed in. 
	If you need to repeat a command, 
	use the cursor keys to scroll up and down the list or type history for a list of previous commands.
	</p>

	<h2>Files and processes</h2>

	<p>
	Everything in UNIX is either a file or a process.
	</p>

	<p>
	A process is an executing program identified by a unique PID (process identifier).
	</p>

	<p>
	A file is a collection of data. They are created by users using text editors, running compilers etc.
	</p>

	<p>
	Examples of files:
	</p>

	<ul>
		<li>a document (report, essay etc.)</li>
		<li>the text of a program written in some high-level programming language</li>
		<li>instructions comprehensible directly to the machine and incomprehensible to a casual user, for example, a collection of binary digits (an executable or binary file);</li>
		<li>a directory, containing information about its contents, which may be a mixture of other directories (subdirectories) and ordinary files.</li>
	</ul>

	<h2>The Directory Structure</h2>

	<p>
	All the files are grouped together in the directory structure. 
	The file-system is arranged in a hierarchical structure, 
	like an inverted tree. 
	The top of the hierarchy is traditionally called root (written as a slash / )
	</p>

	<p>
	In the diagram above, 
	we see that the home directory of the undergraduate student "ee51vn" contains two sub-directories (docs and pics) and a file called report.doc.
	</p>

	<p>
	The full path to the file report.doc is <b>"/home/its/ug1/ee51vn/report.doc"</b>
	</p>

	<h2>Starting an UNIX terminal</h2>

	<p>
	To open an UNIX terminal window, click on the "Terminal" icon from Applications/Accessories menus.
	</p>

	<p>
	An UNIX Terminal window will then appear with a % prompt, 
	waiting for you to start entering commands.
	</p>
</article>


							<?php include './style/footer.php'; ?>
							