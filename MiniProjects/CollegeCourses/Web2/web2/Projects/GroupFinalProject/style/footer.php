<footer>
		<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.1.1/jquery.min.js"></script>
        <script>
			window.addEventListener('resize', function(){resizeTitle();}, true);
			var marginTOP = $('nav').height();
			function resizeTitle()
			{
				marginTOP = $('nav').height();
				$('header').css('margin',  (marginTOP + 20) + 'px ' + 'auto ' + '0px ' + 'auto');
				$('#sandbox').css('top',  (marginTOP + 5) + 'px');
			}
			resizeTitle();
		
			var x = 0;
			function repeatOften() 
			{
				x += 1;
				$('header').css('background-position', x + 'px ' + '0');
				requestAnimationFrame(repeatOften);
			}
			requestAnimationFrame(repeatOften);
			
			$(document).keypress(function(e) 
			{
				if(e.which == 49) 
				{
					$('body').css('opacity', '0');
					$('html').css('background-image', 'url(https://i.ytimg.com/vi/oj3tRqAmuCo/maxresdefault.jpg)');
					setTimeout(function()
					{
						$('body').css('opacity', '1');
						$('html').css('background-image', 'none');
					}, 200);
				}
				
				if(e.which == 50) 
				{
					$('body').css('opacity', '0');
					$('html').css('background-image', 'url(http://i2.mirror.co.uk/incoming/article8075004.ece/ALTERNATES/s615b/Harambe.jpg)');
					setTimeout(function()
					{
						$('body').css('opacity', '1');
						$('html').css('background-image', 'none');
					}, 200);
				}
				
				if(e.which == 51) 
				{
					$('body').css('opacity', '0');
					$('html').css('background-image', 'url(https://s-media-cache-ak0.pinimg.com/originals/37/cf/94/37cf945c96e323126ade9fe51a55496b.gif)');
					setTimeout(function()
					{
						$('body').css('opacity', '1');
						$('html').css('background-image', 'none');
					}, 650);
				}
				
				if(e.which == 52) 
				{
					$('body').css('opacity', '0');
					$('html').css('background-image', 'url(http://33.media.tumblr.com/26413145c4e522e68ca8167bc99c655c/tumblr_nijihfsFaR1rmajhlo1_500.gif)');
					setTimeout(function()
					{
						$('body').css('opacity', '1');
						$('html').css('background-image', 'none');
					}, 1000);
				}
			});

			requestAnimationFrame(repeatOften);
			
            
			
			var open = false;
			function openSandbox()
			{
				if(open)
					closeSandbox();
				else
				{
					$("#sandbox").css('left', "0px");
					$("#sandbox").css('width', "395px");
					$("#sandbox").css('height', "100%");
					$('#sandbox').css('opacity', '1');
					
					
					$('article').css('margin',   '30px auto 30px 400px');
					$('footer').css('margin',   '30px auto 30px 400px');
					
					$('article').css('width', '75%');
					$('footer').css('width',   '75%');
					open = true;
				}
			}

			function closeSandbox() 
			{
				document.getElementById("sandbox").style.left = "-395px";
				document.getElementById("sandbox").style.height = "0%";
				$('#sandbox').css('opacity', '0');
				
			
				$('article').css('margin',   '30px auto');
				$('footer').css('margin',   '30px auto');
				
				$('article').css('width',   '80%');
				$('footer').css('width',   '80%');
				open = false;
			}
			
			
        </script>
</footer>
</HTML>