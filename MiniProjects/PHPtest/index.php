<!DOCTYPE html>
<html lang="en">
<head>
	<title>Dillon Simeone</title>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
</head> 
	<body>
		<?php
			echo '<div>';
			echo '<h1>TESTING PHP</h1>';
			
			echo '<h2>PHP extenisons:</h2>';
			echo '<ol>';
			foreach (get_loaded_extensions() as $mod){
				if($mod != "")
					echo '<li>' . $mod . '</li>';
			}				
			echo '</ol>';
							
			echo '<h2>PHP verison: ' . phpversion() . '</h2>';
			
			if (extension_loaded('sqlite3')) {
				echo '<h2>Sqlite3 be working</h2>';
				echo print_r(SQLite3::version());
			}
			echo '</div>';
		?>
	</body>
</html>