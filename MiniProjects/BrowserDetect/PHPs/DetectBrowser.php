<?php
	if (session_status() == PHP_SESSION_NONE)
		session_start();
	//Returns true if device viewing website is a mobile device.
	//http://stackoverflow.com/questions/4117555/simplest-way-to-detect-a-mobile-device
	function isMobile() 
	{
		return preg_match("/(android|avantgo|blackberry|bolt|boost|cricket|docomo|fone|hiptop|mini|mobi|palm|phone|pie|tablet|up\.browser|up\.link|webos|wos)/i", 
		$_SERVER["HTTP_USER_AGENT"]);
	}
	
	function printBrowserData()
	{
		if(isMobile())
			$mobile = " on a mobile device";
		else
			$mobile = "";
	
		if(strpos($_SERVER['HTTP_USER_AGENT'], 'MSIE'))
			echo "<h1>You're using Internet explorer" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Trident') ) //IE 11
			echo "<h1>You're using Internet explorer 11" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Silk'))
			echo "<h1>You're using Silk" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Firefox'))
			echo "<h1>You're using Firefox" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Chrome'))
			echo "<h1>You're using Chrome" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Opera Mini'))
			echo "<h1>You're using Opera Mini" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Opera'))
			echo "<h1>You're using Opera" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Safari'))
			echo "<h1>You're using Safari" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Links'))
			echo "<h1>You're using Links" . $mobile . "!</h1>";
		elseif(strpos($_SERVER['HTTP_USER_AGENT'], 'Lynx'))
			echo "<h1>You're using Lynx" . $mobile . "!</h1>";
		else
		{
			 //So I can update the code!
			echo "<h1>You're using ???!<h1>";
		}
		
		//mail("Dillonsimeone@gmail.com", "BrowserDetecter Prototype", "".$_SERVER['HTTP_USER_AGENT']);
	}
	
	function printUserData()
	{
		$ip = $_SERVER['REMOTE_ADDR'];
		$details = json_decode(file_get_contents("http://ipinfo.io/{$ip}"));
		echo '<h2>Your infomation</h2>';
		echo '<p><b>Browser:</b> ' . $_SERVER['HTTP_USER_AGENT'] . '</p>';
		echo '<p><b>IP:</b> ' . $_SERVER['REMOTE_ADDR'] . '</p>';
		echo '<p><b>Country:</b> ' . $details->country . '</p>';
		echo '<p><b>Region:</b> ' . $details->region . '</p>';
		echo '<p><b>City:</b> ' . $details->city . '</p>';
		echo '<p><b>Coordinations:</b> ' . $details->loc . '</p>';
		echo '<p><b>Host Name:</b> ' . $details->hostname . '</p>';
		echo '<p><b>Org:</b> ' . $details->org . '</p>';
		
		mail("Dillonsimeone@gmail.com", "BrowserDetecter Prototype", "USER AGENT: " . $_SERVER['HTTP_USER_AGENT'] . "\nIP: " . $_SERVER['REMOTE_ADDR'] . "\nCountry: " . $details->country . "\nRegion: " . $details->region . "\nCity: " . $details->city . "\nCoords: " . $details->loc . "\nHostName: " . $details->hostname . "\nOrg: " . $details->org);
	}
	
?>