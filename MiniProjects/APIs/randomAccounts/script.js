let canvases = [], //For blood splatter animations.
    changeTimer = 0,
    renderLoop = true //Controls the render loop

const accounts = document.querySelector('.accounts'),
    inputs = document.querySelectorAll('input'),
    data = {
        page: 1,
        results: 10,
        seed: "asd"
    },
    pictureSettings = {
        "size": 150, //Size of the canvas elements with the images in them.
        "quality": "medium" //Three options: large, medium, thumbnail. Default: thumbnail
    },
    splatterSetting = {
        "color": `red`, //Color for each circles
        "shades": 150, //Possible ranges of shades
        "amount": pictureSettings.size / 2, //Amount of circles to spawn to make a splatter
        "angle": 5, //Spacing between circles. Bigger this is, the further the circles will travel from eachother.
        "angleXdelta": pictureSettings.size / 10, //How far the circles can travel on the x-axis
        "angleYdelta": pictureSettings.size / 10, //How far the circles can travel on the y-axis
        "randomness": 15, // How far the circles could travel on either axis. (Example: angleXdelta * randomness)
        "size": 5 + Math.random() * 3, //Circles starts at this then start shrinking to zero.
        "sizeDelta": 10, //The max size
        "life": 200 + Math.random() * 50 // How long it takes to animate the circles. Automically set to 0 if size < 0.
    }

function updateState() {
    let seed = document.querySelector("#seed")/** ,
        pictureSize = document.querySelector("#pictureSize"),
        pictureQuality = document.querySelector("#quality"),
        colorSplatter = document.querySelector("#colorSplatter"),
        selectedColorSplatter = colorSplatter.options[colorSplatter.selectedIndex].text,
        shades = document.querySelector("#shades"),
        amount = document.querySelector("#amount"),
        angle = document.querySelector("#angle"),
        angleXdelta = document.querySelector("#angleXdelta"),
        angleYdelta = document.querySelector("#angleYdelta"),
        randomness = document.querySelector("#randomness"),
        size = document.querySelector("#size"),
        sizeDelta = document.querySelector("#sizeDelta"),
        life = document.querySelector("life")
        */

    data.seed = seed.value
    console.log(seed.value)
    canvases = []
    getAccounts()

    /* pictureSettings.size = cleanNumber(pictureSize)
    pictureSettings.quality = pictureQuality.options[pictureQuality.selectedIndex].text

    splatterSetting.color = selectedColorSplatter
    splatterSetting.shades = cleanNumber(shades)
    splatterSetting.amount = pictureSettings.size / cleanNumber(amount)
    splatterSetting.angle = cleanNumber(angle)
    splatterSetting.angleXdelta = pictureSettings.size / cleanNumber(angleXdelta)
    splatterSetting.angleYdelta = pictureSettings.size / cleanNumber(angleYdelta)
    splatterSetting.randomness = cleanNumber(randomness)
    splatterSetting.size = size + Math.random() * 3
    splatterSetting.sizeDelta = sizeDelta
    splatterSetting.life = life + Math.random() * 50 */
    
    console.log("Updated!")
}

for(input of inputs){
    input.onchange = function(){
        console.log("Changed!")
        updateState()
    }
}

function cleanNumber(string) {
    if (string.value < 0 || string.value == undefined)
        return 1
    else
        return string.value.replace(/\D/g, '');
}

function request() {
    let url = "https://randomuser.me/api/?";
    Object.keys(data).forEach(element => {
        url += `${element}=${data[element]}&`
    })
    return url.slice(0, request.length - 1)
}

function getAccounts() {
    fetch(request()).then(
        response => {
            return response.json()
        }
    ).then(
        json => {
            accounts.innerHTML = "";
            makeCards(json).forEach(card => {
                accounts.append(card)
            })
            bloodsplatters();
        }
    )
}

function makeCards(accounts) {
    //console.log(accounts)
    let cards = [];
    accounts.results.forEach(result => {
        let card = document.createElement('div')
        card.setAttribute("class", "cards")

        let canvas = document.createElement('canvas')
        canvas.width = pictureSettings.size
        canvas.height = pictureSettings.size
        canvas.style.borderRadius = "100px"
        canvas.onclick = function (e, canvas) {
            canvases.forEach(object => {
                if (object.canvas === this) {
                    let location = this.getBoundingClientRect()
                    for (var i = 0; i < splatterSetting.amount; i++) {
                        object.particles.push({
                            x: e.clientX - location.x,
                            y: e.clientY - location.y,
                            angle: i * splatterSetting.angle,
                            size: splatterSetting.size,
                            life: splatterSetting.life
                        })
                    }
                }
            })
        }
        let ctx = canvas.getContext('2d')

        let image = new Image()

        switch (pictureSettings.quality) {
            case "large":
                image.src = result.picture.large
                break;
            case "medium":
                image.src = result.picture.medium
                break;
            case "thumbnail":
                image.src = result.picture.thumbnail
                break;
            default:
                image.src = result.picture.thumbnail
                break;
        }

        image.onload = function () {
            ctx.drawImage(image, 0, 0, pictureSettings.size, pictureSettings.size)
        }

        let name = document.createElement('h1')

        let basicInfo = document.createElement('ul')
        basicInfo.setAttribute("class", "basicInfo")
        //let detailedInfo = document.createElement('ul')

        name.innerText = `${result.name.first} ${result.name.last}`

        basicInfo.append(listItem(result.email));
        basicInfo.append(listItem(result.cell))

        //detailedInfo.append(listItem(`${result.location.street}, ${result.location.city}`))
        card.append(canvas)
        card.append(name)
        card.append(basicInfo)
        cards.push(card)
        //body.append(card)
    })
    return cards
}

//Sets up onclick events for each bloodsplatters.
function bloodsplatters() {
    Array.from(document.querySelectorAll("canvas")).forEach(canvas => {
        canvases.push({
            "canvas": canvas,
            "particles": []
        })
    })
}

//Animates the bloodsplatters
let delta = 0,
    last = Date.now()

function animateBloodsplatters() {
    delta = Date.now() - last;
    last = Date.now();
    canvases.forEach(object => {
        for (let i = 0; i < object.particles.length; i++) {
            let p = object.particles[i];
            p.x += Math.cos(p.angle) * splatterSetting.angleXdelta + Math.random() * splatterSetting
                .randomness - Math.random() * splatterSetting.randomness
            p.y += Math.sin(p.angle) * splatterSetting.angleYdelta + Math.random() * splatterSetting
                .randomness - Math.random() * splatterSetting.randomness
            p.life -= delta
            p.size -= delta / splatterSetting.sizeDelta;

            if (p.size <= 0) {
                p.life = 0
            }

            if (p.life <= 0) {
                object.particles.splice(i--, 1)
                continue;
            }
        }
    })
}

//Renders the blood bath!
function render() {
    canvases.forEach(object => {
        let ctx = object.canvas.getContext('2d')
        //console.log(splatterSetting.color.toLowerCase())
        object.particles.forEach(particle => {
            switch (splatterSetting.color.toLowerCase()) {
                case "red":
                    ctx.fillStyle =
                        `rgba(${(Math.random() * splatterSetting.shades) + (255-splatterSetting.shades)}, 0, 0, ${(Math.random() * 1)})`
                    break
                case "blue":
                    ctx.fillStyle =
                        `rgba(0, 0, ${(Math.random() * splatterSetting.shades) + (255-splatterSetting.shades)}, ${Math.random() * 1})`

                    break
                case "green":
                    ctx.fillStyle =
                        `rgba(0, ${(Math.random() * splatterSetting.shades) + (255-splatterSetting.shades)}, 0, ${Math.random() * 1})`
                    break
                default:
                    ctx.fillStyle = `rgba(255, 255, 255, 0.5)`
                    break
            }
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size + 1, 2, Math.PI * 2, false);
            ctx.fill();
        })
    })
}

//Start the loop!
function animloop() {
    if(renderLoop){
        console.log("Rendering...")
        requestAnimationFrame(animloop);
        animateBloodsplatters();
        render();
    }
}
animloop();


function listItem(text) {
    let listItem = document.createElement('li')
    listItem.innerText = text;
    return listItem;
}

let pageNumber = document.querySelector('.pagination').querySelector('h2')
let seed = document.querySelector('input')
console.log(pageNumber)

function next() {
    data.page += 1;
    data.seed = seed.value;
    pageNumber.innerHTML = `Page ${data.page}`
    canvases = [];
    getAccounts()
}

function previous() {
    if (data.page > 1) {
        data.page -= 1;
        data.seed = seed.value;
        pageNumber.innerHTML = `Page ${data.page}`
        canvases = [];
        getAccounts()
    }

}

//Blood splatters settings
var options = {
    scatter: 0,
    gravity: 0.2,
    consistency: 0.04,
    pollock: false,
    burst: true,
    shade: true
}

getAccounts()