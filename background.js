//Color settings. See randomColor function in randomColors.js 
const min = 20
const max = 80

//Mobile browsers likes to resize website pages when their URL bars hides when the user moves down, and reappears when the user moves up. Very annoying.
window.mobilecheck = function () {
    var check = false;
    (function (a) {
        if (
            /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i
                .test(a) ||
            /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i
                .test(a.substr(0, 4))) check = true;
    })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
};

//Since when you rotate your mobile device by 90 degree, the height becomes the width and the width becomes the height. Check for that to trigger a resize instead of any resizing, so the URL address resizing the website page don't affect anything.
const initalHeight = window.innerHeight;
const initalWidth = window.innerWidth;
let backgroundHoverEventCounter = 0;

//This makes it so nothing happens until user is done resizing (In the redraw function below).
let resize;

function redraw() { //Used in the HTML. `<body onresize="redraw();">`
    if (!mobilecheck()) {
        clearTimeout(resize);
        resize = setTimeout(
            function () {
                draw();
            }, 500
        );
    } else {
        /*
        let text = ("Mobile Device detected.");
        text += ("<br>Inital width and height: " + initalWidth + " " + initalHeight);
        text +=("<br>Current width and height: " + window.innerWidth + " " + window.innerHeight);
        document.querySelector('p').innerHTML = text;
        */
        //Mobile support here. This checks for when the user turns the mobile sideway.
        if ((window.innerHeight === initalWidth) && (window.innerWidth === initalHeight)) {
            clearTimeout(resize);
            resize = setTimeout(
                function () {
                    draw();
                    initalWidth = window.innerWidth;
                    initalHeight = window.innerHeight;
                }, 500
            );
        }
    }
};

let cells;
let divisor = 10; //This affects the amount of cells that's spawned. Bigger the number is, more cells that appears. Cells have a heavy impact on performace. Need to cook dinner? Set this to 1000!
function draw() {
    const container = document.querySelector('.trianglify');
    if (window.innerHeight > window
        .innerWidth) //This ensures the smallest value of either height/width is used. Performace reasons.
        cells = Math.ceil(window.innerHeight / divisor);
    else
        cells = Math.ceil(window.innerWidth / divisor);

    //Generates the colorful background for the website.
    const pattern = Trianglify({
        width: window.innerWidth,
        height: window.innerHeight,
        cell_size: cells,
        variance: 1,
        stroke_width: 0
    }).svg(); // Render as SVG.

    //Circle used to check what polys are being backgroundHoverEventCountered over.
    const circleElement = document.createElement("div");
    circleElement.className = "circle";

    //Clears out old stuff.
    container.innerHTML = "";
    container.insertBefore(pattern, container.firstChild);
    container.appendChild(circleElement);

    //For mouse movement events.
    const circle = document.querySelector('.circle');

    //Makes an array of all of the polys from Pattern, disregerding everything else.
    const polyArray = [].slice.call(pattern.children);

    // [OPTIMIZATION] Cache polygon centers once per DRAW
    const polyPoints = polyArray.map(function (poly) {
        poly.classList.add('poly', 'fade');
        const rect = poly.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    });

    /*
    This below, is JavaScript witchery at its finest! Put simply, what I did was to store a reference to the anonymous event listener (document.fn) 
    created below in the document, so I can destroy the anonymous event listener once it's outdated, and start up a new event listener that will work 
    with the current values after a resize. If I don't do this...Amount of eventListeners going off on mousemove = (times resized browser).
    */
    document.removeEventListener('mousemove', document.fn);

    let ticking = false;
    let frameCount = 0;
    const polyActiveStates = new Array(polyPoints.length).fill(false);

    document.addEventListener('mousemove', document.fn = function fn(e) {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                // [OPTIMIZATION] Run polygon checks only every 2nd frame (Halves CPU impact)
                frameCount++;
                if (frameCount % 2 !== 0) {
                    ticking = false;
                    return;
                }

                const radius = circle.clientWidth / 2;
                const center = { x: e.clientX, y: e.clientY };

                // Moves the circle
                circle.style.transform = `translate(${center.x - radius}px, ${center.y - radius}px)`;

                // [OPTIMIZATION] Only mutate DOM if state actually changed
                for (let i = 0, len = polyPoints.length; i < len; i++) {
                    const isInCircle = detectPointInCircle(polyPoints[i], radius, center);

                    if (isInCircle && !polyActiveStates[i]) {
                        polyArray[i].classList.remove('fade');
                        polyActiveStates[i] = true;
                    } else if (!isInCircle && polyActiveStates[i]) {
                        polyArray[i].classList.add('fade');
                        polyActiveStates[i] = false;
                    }
                }
                ticking = false;
            });
            ticking = true;
        }
    }); //End Event Listener magic
};

//Checks if polygons are under circle. Credits to Claudio on Codepen for figuring out the math bits: https://codepen.io/claudiocalautti/pen/VLzWrz
function detectPointInCircle(point, radius, center) {
    const xp = point.x;
    const yp = point.y;
    const xc = center.x;
    const yc = center.y;
    const d = radius * radius;
    return Math.pow(xp - xc, 2) + Math.pow(yp - yc, 2) <= d;
};
