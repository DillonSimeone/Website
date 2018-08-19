	</body>
	<footer>
		<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.1.1/jquery.min.js"></script>
        <script>
			window.addEventListener('resize', function(){resizeTitle();}, true);
			var marginTOP = $('nav').height();
			function resizeTitle()
			{
				marginTOP = $('nav').height();
				$('header').css('margin',  marginTOP + 'px ' + 'auto ' + '0px ' + 'auto');
			}
			
			/*
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
					$
					setTimeout(function()
					{
						$('body').css('opacity', '1');
					}, 200);
					
				}
			});

			requestAnimationFrame(repeatOften);
			
            function doomCounter()
			{
				var items = $('#dillon li').length + $('#david li').length + $('#alex li').length + $('#jose li').length + $('#unallocated li').length;
				console.log("Total items: " + items);
		
				var finished = $('#dillon s').length + $('#david s').length + $('#alex s').length + $('#jose s').length + $('#unallocated s').length;
				console.log("Total finished items: " + finished);
		
				$('#progressBar').val(finished);
				document.getElementById("progressBar").max = items;
			}
			doomCounter();
			
			function taskCounter()
			{
				var items = $('#dillon li').length;
				var finished = $('#dillon s'). length;
				$('#dillonc').text(finished);
				$('#dillonuc').text(items - finished);
				
				items = $('#david li').length;
				finished = $('#david s'). length;
				$('#davidc').text(finished);
				$('#daviduc').text(items - finished);
				
				items = $('#jose li').length;
				finished = $('#jose s').length;
				$('#josec').text(finished);
				$('#joseuc').text(items - finished);
				
				items = $('#alex li').length;
				finished = $('#alex s').length;
				$('#alexc').text(finished);
				$('#alexuc').text(items - finished);
			}
			taskCounter();
			
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
			*/
        </script>
	</footer>
</html> 