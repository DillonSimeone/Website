<?php
include '../style/header.php';
include '../style/nav.php';

$db_host = "localhost";  
$db_user = "dys8701";    
$db_pass = "fr1end";   
$db_name = "dys8701";
$name = $_SESSION["username"];

$link = mysqli_connect( $db_host, $db_user, $db_pass, $db_name );

$query = "SELECT c1, c2, c3, c4, c5, c6, c7, c8 FROM `unix101Member` WHERE Username='$name'";
		
$result = mysqli_query( $link, $query );
$num_rows = mysqli_affected_rows( $link );

if ( $result && $num_rows > 0 ) 
	{
		$i = 0;
		while ( $row = mysqli_fetch_assoc( $result ) ) 
		{
			foreach ( $row as $index => $field ) 
			{ 
				$mastery[$i] = $field;
				$overallMastery += $field;
				$i++;
			}
		}
	}

if(mysqli_affected_rows($link) == 0)
{
	$messages .= "failed to update your stats!";
}
?>
    <article>
        <h1>Mastery</h1>
		
        <p>
           <?php 
			echo "Welcome, " . $_SESSION["username"]; 
		   ?>
		   
		<div id="stats">
		<div class = "Mastery">
			Chapter One Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[0]); ?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Two Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[1])?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Three Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[2])?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Four Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[3])?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Five Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[4])?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Six Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[5])?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Seven Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[6])?>"/>
		</div>
		
		<div class = "Mastery">
			Chapter Eight Mastery: <progress class="MasteryBar" max = "10" value ="<?php echo (10 - $mastery[7])?>"/>
		</div>
		
		<div class = "Mastery">
			Overall Mastery: <progress class="MasteryBar" max = "80" value ="<?php echo (80 - $overallMastery)?>"/>
		</div>
		
		
		</div>
		
        </p>
    </article>
<?php include '../style/footer.php'; ?>