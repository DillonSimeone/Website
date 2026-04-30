<!DOCTYPE html>
<html>
	<head>
	<meta charset="UTF-8">
	<title>Detecting Your Browser!</title>
	<link rel="stylesheet" href="./Styles/styles.css">
	<?php include './PHPs/DetectBrowser.php';?>
	<?php include './PHPs/TimesVisited.php';?>
	<style>
		h2
		{
			font-size: 1.5em;
			text-align: center;
		}
		#data
		{
			width: 60%;
			margin: auto;
			outline: 1px dashed black;
			padding: 10px;
		}
		#visits
		{
			width: 60%;
			margin: auto;
		}
		
		#visits p
		{
			text-align: center;
		}
		
		#visits img
		{
			display: block;
			margin: 10px auto 10px auto;
			width:  40%;
			border: 5px solid orange;
			outline: 5px solid red;
		}

	</style>
	</head>
	<body>
		<?php printBrowserData(); ?>
		<div id="data">
			<?php printUserData(); ?>
		</div>
		<?php timesVisited(); ?>
	</body>
</html> 