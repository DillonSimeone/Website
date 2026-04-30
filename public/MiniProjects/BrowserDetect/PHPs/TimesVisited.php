<?php
	function timesVisited()
	{
		if (session_status() == PHP_SESSION_NONE)
			session_start();
		
		if (!isset($_SESSION['views'])) 
			$_SESSION['views'] = 0;
		
		$_SESSION['views'] = $_SESSION['views']+1;
		
		$container = '<div id = "visits">';
		
		if($_SESSION['views'] == 1)
			$container . "<h1>This is your first time visiting this page in your browser session!</h1>";
		elseif($_SESSION['views'] > 10)
		{
			$container .= "<h1>Good lord, you really like this page. You've refreshed this page more than 10 times.</h1>";
			$container .= '<p style ="text-align = center;">As thanks for your views, here\'s a Trump pepe meme!</p>';
			$container .= '<img src="./media/trumpepe.jpg">';
		}
		else
			$container .= "<h1>You've came here " . $_SESSION['views'] . " times in your browser session so far!";
		
		$container .= "</div>";
		echo $container;
	}
?>