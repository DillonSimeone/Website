<?php
include '../style/header.php';
include '../style/nav.php';
?>
    <article>
        <?php
			if($_SESSION["loggedin"] == "true")
					{
						session_unset();
						session_destroy(); 
						echo "<meta http-equiv='refresh' content='0'>";
					}
					else
					{
						echo "<h1>Logged out successfully</h1>";
					}
		?>
    </article>
<?php include '../style/footer.php'; ?>