<?php
include '../style/header.php';
include '../style/nav.php';
?>
    <article>
        <?php
			if(!empty( $_POST))
			{
				$password = $message = "";
				$username = cleanInput($_POST["username"]);
				$email = cleanInput($_POST["email"]);
				$password = cleanInput($_POST["password"]);
				$password2 = cleanInput($_POST["password2"]);
				$password = salt($password);
				$password2 = salt($password2);
		
				if($username == "" || $username == null)
				{
					$message .= "Name not typed in!" . "<br/>";
				}
		
				if($password == "" || $password == null || $password == "a760d2ed982959ac5128da0710296a252344a34b")
				{
					$message .= "Password not typed in!" . "<br/>";
				}
				
				if($password != $password2)
				{
					$message .= "Passwords does not match!" . "<br/>";
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
					}
					else
					{
						$query = "INSERT INTO `unix101Member`(`UserID`,`Username`, `Password`, `EmailAddress`) VALUES (null, '$username', '$password', '$email')";
						mysqli_query( $link, $query );
						if(mysqli_affected_rows($link) == 0)
						{
							$message .= "Sign-up failed!";
						}
						else
						{
							$_SESSION["loggedin"] = "true";
							$_SESSION["username"] = $username;
							mail($email, "Unix101 ", "Welcome to Unix101, " . $username);
							echo "<meta http-equiv='refresh' content='0'>";
						}
						
					}
				}
			}
	
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
			
			if($_SESSION["loggedin"] == "true")
				{
					echo '<h1>' . "You've successfully signed up, " . $_SESSION["username"] . '<h1>';	
				} 
	?>
	<div id="message" style="text-align: center;">
			<?php
				echo $message . "<br/>";
				//echo "Username: " . $username . "<br/>"; //For Debugging
				//echo "Password: " . $password . "<br/>"; //For Debugging
			?>
    </div>
	<h1 <?php if($_SESSION["loggedin"] == "true"){echo 'style="display:none"';} ?>>Sign-up</h1>
	<form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>" <?php if($_SESSION["loggedin"] == "true"){echo 'style="display:none"';} ?>>
        
        
        <div class="form">
            <div class="question">
                <label>Username: </label>
                <input type="text" size="25" name="username" value="<?php echo $username;?>">
            </div>
			<div class="question">
                <label>Email: </label>
                <input type="email" size="25" name="email" value="<?php echo $email;?>">
            </div>
            <div class="question">
                <label>Password: </label>
                <input type="password" size="25" name="password" value="">
            </div>
			<div class="question">
                <label>Password again: </label>
                <input type="password" size="25" name="password2" value="">
            </div>
			<div class="buttons">
				<input type="submit" value="Submit"> <input type="reset">
			</div>
		</div>
    </form>
    </article>
<?php include '../style/footer.php'; ?>