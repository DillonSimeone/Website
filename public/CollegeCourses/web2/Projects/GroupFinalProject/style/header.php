<?php 
	session_start();
	$BASE_URL = "https://people.rit.edu/dys8701/Practical/web2/Projects/GroupFinalProject/";
?>
<!DOCTYPE html>
<HTML lang="en">
<head>
  <meta charset="utf-8">
  <meta name="author" content="Dillon Simeone">
  <meta name="description" content="Web2 Group Project.">
  <title>UNIX Surivial</title>
  <link rel="icon" href="<?php echo $BASE_URL . 'image/icons/favicon.ico' ?>" type="image/gif" sizes="16x16">
  <link rel="stylesheet" href="<?php echo $BASE_URL . 'style/style.css' ?>">
</head>
<header>
    <a href="<?php echo $BASE_URL . 'index.php' ?>">
	<figure>
		<img src ="<?php echo $BASE_URL . 'image/pngs/logo.png' ?>" alt="Unix101 Logo">
	</figure>
	</a>
</header>
<!-- This bypasses the HTTP loading on HTTPS issue. -->
<iframe src="<?php echo $BASE_URL . "resource/HTML5Terminal.html" ?>" id="sandbox" height="395" width="395"></iframe>