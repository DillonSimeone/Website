let shapes = [];
let cardSize = 120;
let speed = 1;
let colors = ["#FF5733", "#33FF57", "#3357FF", "#F5A623", "#9B59B6", "#E74C3C"];
let offsetX = 0, offsetY = 0;
let bgImage;

function preload() {
    bgImage = loadImage('./stars.jpg');
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    generateShapes();
}

function generateShapes() {
    shapes = [];
    for (let y = 0; y < height + cardSize; y += cardSize) {
        for (let x = 0; x < width + cardSize; x += cardSize) {
            shapes.push(new ShapeCard(x, y));
        }
    }
}

function draw() {
    background(20);
    speed = map(mouseX, 0, 1080, 0, 10);
    
    translate(-offsetX, -offsetY);
    
    for (let shape of shapes) {
        shape.display();
    }
    
    offsetX += speed;
    offsetY += speed;
    
    // Remove off-screen shapes and add new ones ahead
    shapes = shapes.filter(shape => shape.x + cardSize > offsetX - width && shape.y + cardSize > offsetY - height);
    /*
      About above line...

      Normally running bounding code is really expensive to compute. This is an extreme shortcut to checking what cards are still in the viewport by 
      just looking at their offsetX and offsetY. 
      
      Condition: shape.x + cardSize > offsetX - width

        shape.x + cardSize: right edge of shape
        offsetX - width: position left out of the viewport

        if the right edge of the shape is greater than offsetX - width, it stays.

      Condition: shape.y + cardSize > offsetY - height

        shape.y + cardSize: bottom edge of shape
        offsetY - height: position above the viewport

        if the bottom edge of the shape is grater than offsetY - height, it stays.
    */
    
    for (let y = floor(offsetY / cardSize) * cardSize - cardSize; y < offsetY + height; y += cardSize) {
        for (let x = floor(offsetX / cardSize) * cardSize - cardSize; x < offsetX + width; x += cardSize) {
            if (!shapes.some(shape => shape.x === x && shape.y === y)) {
                shapes.push(new ShapeCard(x, y));
            }
        }
    }
}

class ShapeCard {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = random(cardSize * 0.5, cardSize * 0.7);
        this.color = random(colors);
        this.shapeType = int(random(7));
        this.rotation = random(TWO_PI);
        this.isStarField = random() < 0.2;
    }
    
    display() {
        stroke(0);
        strokeWeight(3);
        fill(50);
        rect(this.x, this.y, cardSize, cardSize, 10);
        
        push();
        translate(this.x + cardSize / 2, this.y + cardSize / 2);
        rotate(this.rotation);
        
        if (this.isStarField) {
            drawingContext.save();
            drawingContext.beginPath();
            this.drawShape();
            drawingContext.clip();
            image(bgImage, -this.size / 2, -this.size / 2, this.size, this.size);
            drawingContext.restore();
        } else {
            fill(this.color);
            noStroke();
            this.drawShape();
        }
        pop();
    }
    
    drawShape() {
        beginShape();
        switch (this.shapeType) {
            case 0:
                ellipse(0, 0, this.size);
                break;
            case 1:
                rectMode(CENTER);
                rect(0, 0, this.size, this.size);
                break;
            case 2:
                triangle(-this.size / 2, this.size / 2, this.size / 2, this.size / 2, 0, -this.size / 2);
                break;
            case 3:
                for (let i = 0; i < 5; i++) {
                    let angle = map(i, 0, 5, 0, TWO_PI);
                    let x = cos(angle) * this.size * 0.4;
                    let y = sin(angle) * this.size * 0.4;
                    vertex(x, y);
                }
                break;
            case 4:
                for (let i = 0; i < 6; i++) {
                    let angle = map(i, 0, 6, 0, TWO_PI);
                    let x = cos(angle) * this.size * 0.4;
                    let y = sin(angle) * this.size * 0.4;
                    vertex(x, y);
                }
                break;
            case 5:
                for (let i = 0; i < 8; i++) {
                    let angle = map(i, 0, 8, 0, TWO_PI);
                    let x = cos(angle) * this.size * 0.4;
                    let y = sin(angle) * this.size * 0.4;
                    vertex(x, y);
                }
                break;
            case 6:
                vertex(-this.size / 2, this.size / 2);
                vertex(0, -this.size / 2);
                vertex(this.size / 2, this.size / 2);
                vertex(0, this.size / 4);
                break;
        }
        endShape(CLOSE);
    }
}
