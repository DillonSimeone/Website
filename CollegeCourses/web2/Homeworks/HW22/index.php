<?php
$errors = "";
$db_host = "localhost";  
$db_user = "dys8701";    
$db_pass = "fr1end";   
$db_name = "dys8701";
$link = mysqli_connect( $db_host, $db_user, $db_pass, $db_name ); 
?>
<!DOCTYPE html>
<HTML lang="en">
	<head>
		<meta charset="utf-8">
		<title>Homework 22 (Black Database magic)</title>
		<meta name="description" content="A homework!.">
		<meta name="author" content="Dillon Simeone">
		<link rel="stylesheet" href="style.css">
		
	<?php
	if( !empty( $_POST))
	{
		$name = cleanInput($_POST["name"]);
		$comment = cleanInput($_POST["comment"]);

		if($name == "")
		{
			$errors .= "Name not typed in!<br/>";
		}
		
		if($comment == "")
		{
			$errors .= "Comment not typed in!<br/>";
		}
		
		if($errors == null || $errors == "")
			
		{
			$userInput = "INSERT INTO `dys8701`.`comments` (`id`, `name`, `comment`) VALUES (NULL,'$name', '$comment')";
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
	</head>
	<body>
		<div>
			<?php 
				if ( !$link ) 
				{
					echo( "Connect failed: " . mysqli_connect_error());
					exit();
				}
				
				$query = "SELECT id, name, comment FROM comments";
				$result = mysqli_query( $link, $query );
				
				$num_rows = mysqli_affected_rows( $link );
				if ( $result && $num_rows > 0 ) 
				{
					$display = "<table> <tr><th>ID</th><th>Name</th><th>Comment</th></tr>";
					while ( $row = mysqli_fetch_assoc( $result ) ) 
					{
						$display .= "<tr>";
						foreach ( $row as $index => $field ) 
						{ 
							$display .= "<td>" . $field . "</td>";
						}
						$display .= "</tr>";
					}
					$display .= "</table>";
					echo $display;
				}
				
			?>
		</div>
		<div>
			<form 	action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>" 
					method="post" 
					name="orderForm">
					
				<div id="mistakes">
					<?php echo $errors; ?>
				</div>
	
                <div class="question">
                    <label for="name">Name: </label>
                    <input type="text" size="25" name="name" value="<?php echo $name;?>">
                </div>
                
                <div class="question">
                    <label for="comment">Comment: </label>
                    <input type="text" size="20" name="comment" value="<?php echo $comment;?>">
                </div>
				<input type="submit" value="Submit"> <input type="reset">
			</form>
		</div>
	</body>
</HTML>
