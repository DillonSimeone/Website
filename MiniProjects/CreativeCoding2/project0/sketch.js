let shapes = [];
let cardSize = 120;
let speed = 1;
let colors = ["#FF5733", "#33FF57", "#3357FF", "#F5A623", "#9B59B6", "#E74C3C"];
let offsetX = 0,
    offsetY = 0;
let bgImage;
let centralShapeSize = 4.0;

let starOffsetX = 0;
let starOffsetY = 0;
let glowColors = ["#FF4500", "#FF1493", "#FFD700", "#00FF00", "#00FFFF", "#1E90FF"];

function drawCentralShape() {
    push();
    translate(width / 2 + offsetX, height / 2 + offsetY);

    // Dynamic glow effect
    drawingContext.shadowBlur = 40;
    drawingContext.shadowColor = random(glowColors);

    // Clip shape for star movement
    drawingContext.save();
    drawingContext.beginPath();
    drawSteepFastShape();
    drawingContext.clip();

    // Moving star effect inside the shape
    starOffsetX = sin(frameCount * 0.01) * 20;
    starOffsetY = cos(frameCount * 0.01) * 20;
    image(bgImage, (-100 + starOffsetX) * centralShapeSize * 2, (-100 + starOffsetY) * centralShapeSize * 2, 200 * centralShapeSize * 2, 200 * centralShapeSize * 2);
    drawingContext.restore();

    // Outline
    stroke(random(glowColors));
    strokeWeight(5);
    noFill();
    drawSteepFastShape();

    pop();
}


function drawSteepFastShape() {
    beginShape();
    vertex(-70 * centralShapeSize, 80 * centralShapeSize);
    vertex(0, -100 * centralShapeSize);
    vertex(70 * centralShapeSize, 80 * centralShapeSize);
    vertex(0, 40 * centralShapeSize);
    endShape(CLOSE);
}

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

    speed = map(mouseX, 0, 1080, 1, 10);

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

    Normally running bounding code is really expensive to compute. This is an extreme shortcut to checking what cards are still in the viewport by just looking at 
    their offsetX and offsetY. It works really well too because elements in the array list don't get shifted around as each elements are evaluated on one-by-one basis 
    as you would with normal bounding code. 
    
    With filter, the entire list is processed, and a new list is created in one smooth step. 
      
        Condition: shape.x + cardSize > offsetX - width

            shape.x + cardSize: right edge of shape
            offsetX - width: position left out of the viewport

            if the right edge of the shape is greater than offsetX - width, it stays.

        Condition: shape.y + cardSize > offsetY - height

            shape.y + cardSize: bottom edge of shape
            offsetY - height: position above the viewport

            if the bottom edge of the shape is grater than offsetY - height, it stays.

    Normal bounding code would look something like this below:

            function isWithinViewport(shape) {
            return (
                shape.x + cardSize >= offsetX && // Right edge of shape is within viewport
                shape.y + cardSize >= offsetY && // Bottom edge of shape is within viewport
                shape.x <= offsetX + width && // Left edge of shape is within viewport
                shape.y <= offsetY + height // Top edge of shape is within viewport
            );
            }
            
            for (let i = shapes.length - 1; i >= 0; i--) {
                if (!isWithinViewport(shapes[i])) {
                    shapes.splice(i, 1);
                }
            }
            ```
    */

    for (let y = floor(offsetY / cardSize) * cardSize - cardSize; y < offsetY + height; y += cardSize) {
        for (let x = floor(offsetX / cardSize) * cardSize - cardSize; x < offsetX + width; x += cardSize) {
            if (!shapes.some(shape => shape.x === x && shape.y === y)) {
                shapes.push(new ShapeCard(x, y));
            }
        }
    }
    drawCentralShape();
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