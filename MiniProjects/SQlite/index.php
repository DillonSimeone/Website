<!DOCTYPE html>
<html lang="en">
<head>
	<title>Dillon Simeone</title>
	<link href="./Styles/style.css" rel="stylesheet">
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
</head> 
	<body>
		<?php
			echo '<div>';
			echo '<h1>TESTING PHP</h1>';
			
		
			if (function_exists('sqlite_open')) {
			   echo '<h2>Sqlite PHP extension loaded</h2>';
			}	
			else{
				echo '<h2>What is this SQlite you speak of?</h2>';
			}
			
			echo '<h2>PHP verison: ' . phpversion() . '</h2>';
			echo '</div>'
		?>
	</body>
</html>