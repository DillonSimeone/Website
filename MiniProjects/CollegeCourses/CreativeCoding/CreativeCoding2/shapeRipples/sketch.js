function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
}

function randomColor(){
  let mapped = map(mouseY, 0, window.height, 0, 255)
  return (color(mapped, 100, 100))
}


function setup() {
  createCanvas(windowWidth, windowHeight)
  colorMode(HSB)
}

let r=0;
let speed=5

function draw() {
  //noLoop();
  let speed = mouseX/10
  
  let bgColor= randomColor()
  background(bgColor)
  
  fill(mouseY, 65, 91)
  // hypo square
  let hypo = sqrt(pow(height,2) +pow(width,2))

  let sConst = (sqrt(2)+mouseY/100) //Affects how circles behave (normally +1 instead of mouseY/100)
  
  let rV = r*sConst //Affects the shapes of circles
  let R = (hypo - rV)/ sConst
  
  circle(r,r,2*r);
  circle(width-R,height-R,2*R)

  if(mouseX > window.innerWidth/2)
    r+=speed;
  else
    r+=speed*-1
    
  
  if(r>(width/2)) //Shrinks and enlarges the two circles as they move around
    {
     r=r%(width/2)
      r=R
      R=r
    }
}
