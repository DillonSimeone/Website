<?php
	$ramBytes = memory_get_usage();
	$devInfo = '<p id = "devInfo">';
	$devInfo .= '<h1>DEV INFO</h1>';
	$devInfo .= '<br>Script used ' . $ramBytes . ' Bytes of RAM to run.';
	$devInfo .= '<br>Script used ' . ($ramBytes * 1e-6) . ' Megabytes of RAM to run.';
	$devInfo .= '<br>Max memory allocatable for this script: ' . ini_get('memory_limit') . 'B';
	$devInfo .= '<br>PHP verison: ' . phpversion();
	$devInfo .= '</p>';
	echo $devInfo;
?>