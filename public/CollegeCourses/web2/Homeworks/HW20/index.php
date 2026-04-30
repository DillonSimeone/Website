<?php





function buttons($data)
{	
	$setVal = 3;
	$array = array(
	'1' => "Donald Trump", 
	'2' => "Hillary Clinton", 
	'3' => "Gray Johnson", 
	'4' => "Jill Stein", 
	'5' => "Other"
);
	
	foreach ($data as $index => $label) 
	{
		$check = "";
		if($data  == $setVal)
			$check = 'checked="checked"';
		
		echo '<input type="radio" name="radiogroup" value="'.$index.'". " " . '.$check.'>' . '<label>' . $label . '</label>' . '<br>';
	}
}
?>
<!DOCTYPE html>
<HTML lang="en">
	<head>
		<meta charset="utf-8">
		<title>Homework 8</title>
		<meta name="description" content="A homework!.">
		<meta name="author" content="Dillon Simeone">
		<link rel="stylesheet" href="style.css">
	</head>
	<body>
		<div>
			<?php
			$array = array(
	'1' => "Donald Trump", 
	'2' => "Hillary Clinton", 
	'3' => "Gray Johnson", 
	'4' => "Jill Stein", 
	'5' => "Other"
);
			buttons($array); ?>
		</div>
	</body>
</HTML>
