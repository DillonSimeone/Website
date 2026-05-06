<!DOCTYPE html>
<HTML lang="en">
<head>
    <meta charset="utf-8">
    <title>Homework 8</title>
    <meta name="description" content="A homework!.">
    <meta name="author" content="Dillon Simeone">
    <link rel="stylesheet" href="./style/style.css">
    <?php
	if(!empty( $_POST))
	{
		$password = $message = "";
		$username = cleanInput($_POST["username"]);
		$password = cleanInput($_POST["password"]);
		$password = salt($password);
		
		
		if($username == "" || $username == null)
		{
			$message .= "Name not typed in!" . "<br/>";
		}
		
		if($password == "" || $password == null || $password == "a760d2ed982959ac5128da0710296a252344a34b")
		{
			$message .= "Password not typed in!" . "<br/>";
		}
		
		if($message == "" || $message == null)
		{
			$db_host = "localhost";  
			$db_user = "dys8701";    
			$db_pass = "fr1end";   
			$db_name = "dys8701";
			$link = mysqli_connect( $db_host, $db_user, $db_pass, $db_name );
			
			if ( !$link ) 
			{
				$message .= "Connect failed: " . mysqli_connect_error();
				exit();
			}
			else
			{
				$query = "SELECT `Username`, `Password` FROM `Members` WHERE Username = '$username' AND Password = '$password'";
				if(mysqli_num_rows(mysqli_query( $link, $query )) == 0)
				{
					$message .= "Log-in failed!";
				}
				else
				{
					$message .= "Welcome, o great $username! You've logged in!";
				}
			}
		}
	}	// end of post submit
	
	function cleanInput($data)
	{
		$data = trim($data);
		$data = stripslashes($data);
		$data = htmlspecialchars($data);
		return $data;
	}
	
	function salt($pw)
	{
		$salt = "Suchsaltiness.Allofthosefavors,andyouchoosesalt.Sosalty.";
		return sha1($salt.$pw);
	}
	
	?>
</head>
<body>
	<form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>">
        <div id="message">
			<?php
				echo $message . "<br/>";
				//echo "Username: " . $username . "<br/>"; //For Debugging
				//echo "Password: " . $password . "<br/>"; //For Debugging
			?>
        </div>
        <h1>Log-in</h1>
        <div class="form">
            <div class="question">
                <label for="name">Username: </label>
                <input type="text" size="25" name="username" value="<?php echo $username;?>">
            </div>
            <div class="question">
                <label for="hairColor">Password: </label>
                <input type="text" size="20" name="password" value="">
            </div>
			<div class="buttons">
				<input type="submit" value="Submit"> <input type="reset">
			</div>
		</div>
    </form>
</body>
</HTML>