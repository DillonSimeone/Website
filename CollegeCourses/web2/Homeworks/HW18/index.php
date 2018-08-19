<!DOCTYPE html>
<HTML lang="en">
<head>
    <meta charset="utf-8">
    <title>Homework 18</title>
    <meta name="description" content="A homework!.">
    <meta name="author" content="Dillon Simeone">
    <link rel="stylesheet" href="./style/style.css">
    <?php
	if( !empty( $_POST))
	{
		
		$name = cleanInput($_POST["name"]);
		$hair = cleanInput($_POST["hair"]);
		$address = cleanInput($_POST["address"]);
		$zipcode = cleanInput($_POST["zipcode"]);
		$state = cleanInput($_POST["state"]);
		$email = cleanInput($_POST["email"]);
		$monstername = cleanInput($_POST["monstername"]);

		if($name == "")
		{
			$errors .= "Name not typed in!<br/>";
		}
		
		if($hair == "")
		{
			$errors .= "Hair color not typed in!<br/>";
		}
		
		if($address == "")
		{
			$errors .= "Address not typed in!<br/>";
		}
		
		if($zipcode == "")
		{
			$errors .= "Zipcode not typed in!<br/>";
		}
		else if(strlen($zipcode) != 5)
		{
			$errors .= "Zipcodes must be 5 numbers!<br/>";
		}
		
		else if(preg_match('/^[0-9]+$/', $zipcode) == false)
		{
			$errors .= "Zipcodes is numbers only!<br/>";
		}
		
		if($state == "")
		{
			$errors .= "State not typed in!<br/>";
		}
		else if(strlen($state) != 2)
		{
			$errors .= "State must be 2 letters!<br/>";
		}
		else if(preg_match('/^[a-zA-Z]+$/', $state) == false)
		{
			$errors .= "State must be letters!<br/>";
		}
		
		$color = $_POST["color"];
		if($color == null)
		{
			$errors .= "Color buttons not selected!<br/>";
		}
		
		$size = $_POST["size"];
		if($size == null)
		{
			$errors .= "Size buttons not selected!<br/>";
		}
		
		$shape = $_POST["shape"];
		if($shape == null)
		{
			$errors .= "Shape buttons not selected!<br/>";
		}
		
		$status = $_POST["status"];
		if($status == -1)
		{
			$errors .= "Status not selected!<br/>";
		}
		
		if($monstername == "")
		{
			$errors .= "Monster Name not typed in!<br/>";
		}
		
		if($errors == null || $errors == "")
		{	
			$formData = "";
			foreach ($_POST as $key => $value) 
			{
				$formData .= $key.": ".$value."\n";
			}
			
			mail("dillonsimeone@gmail.com", "Homework16 ".$name, "".$formData);
		}
	}	// end if post submit
	
	function cleanInput($data)
	{
		$data = trim($data);
		$data = stripslashes($data);
		$data = htmlspecialchars($data);
		return $data;
	}
	?>
</head>
<body>
    <header>
    </header>
	<form 	action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>" 
			method="post" 
			name="orderForm">
        <div id="mistakes">
			<?php
				echo $errors;
			?>
        </div>
        <div id="userInfo">
            <h1>Your shipping Address: </h1>
            <div class="form">
                <div class="question">
                    <label for="name">Full Name: </label>
                    <input type="text" size="25" id="name" name="name" value="<?php echo $name;?>">
                </div>
                
                <div class="question">
                    <label for="hairColor">Hair color: </label>
                    <input type="text" size="20" name="hair" value="<?php echo $hair;?>">
                </div>
                
                <div class="question">
                    <label for="streetAddress">Street Address: </label>
                    <input type="text" size="30" name ="address" value="<?php echo $address;?>">
                </div>
                
                <div class="question">
                    <label for="zipCode">Five-digit Zip Code: </label>
                    <input type="text" size="5" name="zipcode" value="<?php echo $zipcode;?>">
                </div>
                
                <div class="question">
                    <label for="state">State: </label>
                    <input type="text" size="2" name ="state" value="<?php echo $state;?>">
                </div>
                
                <div class="question">
                    <label for="email">Email: </label>
                    <input type="email" size="25" name="email" value="<?php echo $email;?>">
                </div>
                
                <div class="question">
                    <input type="checkbox" name="mailingList">
					<b>Plase add my address to the mailing list!</b>
                </div>
                
                <div class="question">
                    <input type="checkbox" name="emailingList">
					<b>Plase add my email address to the spam list!</b>
                </div>
                
            </div>
        </div>
        <div id="widgetInfo">
            <h1>The new monster you want to order: </h1>
            <div class="form">
                <div class="radioQuestion1">
                    <label>Monster Color:</label>
                    
                    <div class="radio">
                        <input type="radio" name="color" value="red" <?php if($color == "red") { echo 'checked="checked"';} ?>><b>Red</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="color" value="blue" <?php if($color == "blue") { echo 'checked="checked"';} ?>><b>Blue</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="color" value="everything" <?php if($color == "everything") { echo 'checked="checked"';} ?>><b class="rainbowText">EverythingAtOnce!</b>
                    </div>
                </div>
                <div class="radioQuestion2">
                    <label>Monster Size:</label>
                    
                    <div class="radio">
                        <input type="radio" name="size" value="small" <?php if($size == "small") { echo 'checked="checked"';} ?>>
						<b>Small</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="size" value ="medium" <?php if($size == "medium") { echo 'checked="checked"';} ?>>
						<b>Medium</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="size" value="large" <?php if($size == "large") { echo 'checked="checked"';} ?>>
						<b>Large</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="size" value="massive" <?php if($size == "massive") { echo 'checked="checked"';} ?>>
						<b class="rainbowText">MASSIVE, as in larger than the universe!</b>
                    </div>
                </div>
                <div class="radioQuestion3" >
                    <label>Monster Shape:</label>
                    
                    <div class="radio">
                        <input type="radio" name="shape" value="sphere" <?php if($shape == "sphere") { echo 'checked="checked"';} ?>>
						<b>Sphere</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="shape" value="cube" <?php if($shape == "cube") { echo 'checked="checked"';} ?>>
						<b>Cube</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="shape" value="star" <?php if($shape == "star") { echo 'checked="checked"';} ?>>
						<b>Star</b>
                    </div>
                    
                    <div class="radio">
                        <input type="radio" name="shape" value="notEuclidean" <?php if($shape == "notEuclidean") { echo 'checked="checked"';} ?>>
						<b class="rainbowText">Non-euclidean!</b>
                    </div>
                </div>
            </div>
            <div class="question">
                <label>Monster status of life: </label>
                <select name ="status">
					<option value="-1" <?php if ($status == '-1') { ?>selected="true" <?php }; ?>>Select One</option>
                    <option value="1" <?php if ($status == '1') { ?>selected="true" <?php }; ?>>Non-living</option>
                    <option value="2" <?php if ($status == '2') { ?>selected="true" <?php }; ?>>Living</option>
                    <option value="3" <?php if ($status == '3') { ?>selected="true" <?php }; ?> class="rainbowText">Both!</option>
                </select>
            </div>
            <div class="question">
                <label>Your new Monster's name: </label>
                
				<input type="text" size="25" name="monstername" value="<?php echo $monstername;?> "/>
				<div class="buttons">
					<input type="submit" value="Submit"> <input type="reset">
				</div>
			</div>
		</div>
    </form>
</body>
</HTML>