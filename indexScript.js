let selectedButton = "";
let HistoryAPIControlsEnable = true;
let shattered = false;

//History Api witchery
window.addEventListener('popstate', function (e) {
    reveal(e.state.previousPage, e.state.previousButton, 30, true);
});

function reveal(targetID, buttonID, timedelay, historyAPI) {
    let button;
    if (buttonID !== "")
        button = document.getElementById(buttonID);

    if (timedelay == undefined)
        timedelay = 60; //Default value

    setTimeout(function () {
        hideAll(targetID, buttonID);
        if (button !== undefined) {
            selectedButton = buttonID;
        }

        let target = document.getElementById(targetID);
        target.className = "item reveal";

        // Hide mobile hamburger on landing page (no nav there)
        const globalToggle = document.getElementById('globalNavToggle');
        if (globalToggle) {
            if (targetID === 'elevatorPitch' || targetID === 'loading') {
                globalToggle.style.display = 'none';
            } else {
                globalToggle.style.display = ''; // Reset to CSS default
            }
        }
    }, timedelay);

    if (HistoryAPIControlsEnable) { //Toggle for history api functionality, at the top of this script (For hot reloading functionability for testing)
        if (historyAPI !== true
        ) { //This checks if the popstate event was fired, so the user don't get trapped in an infinite loop in history!
            if (buttonID === "")
                history.replaceState({
                    previousPage: `${targetID}`,
                    previousButton: `${buttonID}`
                }, '', window.location.pathname)
            else
                history.pushState({
                    previousPage: `${targetID}`,
                    previousButton: `${buttonID}`
                }, '', `?page=${buttonID}`);
        }
    }

    if (shattered)
        unShatter();
};

function superReveal(targetID, buttonID, timedelay, historyAPI) { //Like the reveal function, but with a few extra actions to get rid of the background in a neat way.
    reveal(targetID, buttonID, timedelay, historyAPI) //Yay for DRY!
    /*Extra features
        1. Sends all polys away in random directions. Note to self: Remember make it easy for this to be undone.
        2. Spawns all elements in via fading them in while sliding them up.
        3. ???
        4. Profit!
    */
    shatter();
}

function shatter() {
    animations = [`flyUp`, `flyDown`, `flyLeft`, `flyRight`]; //CSS classes to be added to trigger animations.
    let polys = document.querySelectorAll('.trianglify svg path')
    polys.forEach(poly => {
        let random = animations[Math.floor(Math.random() * animations.length)];
        poly.className.baseVal = `poly fade ${random}`
    })
    shattered = true;
}

function unShatter() {
    let polys = document.querySelectorAll('.trianglify svg path')
    polys.forEach(poly => {
        poly.className.baseVal = `poly fade`
    })
    shattered = false;
}
//Hides all pages expect targetID and sets buttonID's style to show that it's selected when setting all other buttons' colors to the default.
function hideAll(targetID, buttonID) {
    let items = Array.from(document.getElementsByClassName('item'));
    let navButtons = Array.from(document.getElementsByClassName("navButton"));


    items.forEach(element => {
        if (element.getAttribute('id') === targetID) {
            //Those items are not the items you are looking for. *Waving hand*
        } else {
            element.className = "item hide spin";
        }
    });

    navButtons.forEach(element => {
        if (element.getAttribute('id') === buttonID) {
            //Do nothing.
        } else {
            element.style.fill = "#666";
        }
    });
};

//Wonder if CSS will be able to generate random colors one day. Could replace this bit by using a keyframe with the palette of color in it... Switch between the colors, from start to end over a few minutes or something.
function randomizeColor() {
    let hireMe = document.querySelector('#hire')
    hireMe.style.backgroundColor = randomPaletteColor()

    let buttons = Array.from(document.querySelectorAll("nav div"));

    buttons.forEach(element => {
        element.onmouseover = function () {
            this.style.fill = randomPaletteColor();
        }
        element.onmouseout = function () { //Selected buttons keeps their random hover colors.
            if (this.id !== selectedButton) {
                this.style.fill = "#666";
            }
        }
    });
}

//Handy snippet that reads the url bar and gets all of the vars there.
function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
        vars[key] = value;
    });
    return vars;
}

function setUp() {
    let page = getUrlVars().page;
    reveal('loading', '',
        30
    ) //Note to self, if the delay on this is higher than any of the other panels... This gets called AFTER those panels, resulting in infinite loading!
    draw();
    randomizeColor();
    //console.log(`URL var: ${page}`)
    if (page !== undefined) {
        document.querySelector(`#${page}`).click();
        //console.log(document.querySelector(`#${page}`))
    } else
        reveal('elevatorPitch', 'LandingPage');

    generateDynamicNavs();
}

function generateDynamicNavs() {
    const navs = document.querySelectorAll('.section-nav');
    navs.forEach(nav => {
        const containerSelector = nav.getAttribute('data-target-container');
        const titleSelector = nav.getAttribute('data-title-selector');
        const list = nav.querySelector('.dynamic-links');
        const section = nav.closest('.item');

        if (!section || !list) return;

        const targets = section.querySelectorAll(containerSelector);
        targets.forEach(target => {
            const titleEl = target.querySelector(titleSelector);
            if (!titleEl) return;

            const titleText = titleEl.innerText || titleEl.textContent;
            // Generate ID on the TITLE ELEMENT (not the container)
            if (!titleEl.id) {
                titleEl.id = titleText.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-');
            }

            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${titleEl.id}`;
            a.textContent = titleText;
            li.appendChild(a);
            list.appendChild(li);
        });
    });

    // Start the periodic nudge animation
    startNudgeAnimation();
}

function startNudgeAnimation() {
    // Every 8 seconds, nudge visible section-navs
    setInterval(() => {
        const navs = document.querySelectorAll('.section-nav');
        navs.forEach(nav => {
            // Only nudge if not being hovered
            if (!nav.matches(':hover')) {
                nav.classList.add('nudge');
                // Remove after 400ms to create the "bounce back" effect
                setTimeout(() => {
                    nav.classList.remove('nudge');
                }, 400);
            }
        });
    }, 8000);
}

function toggleLocalNav(btn) {
    const section = btn.closest('.item');
    const nav = section.querySelector('.section-nav');
    nav.classList.toggle('active');
    btn.classList.toggle('active');
}

// Global toggle for mobile - finds the visible section's nav
function toggleGlobalNav() {
    const globalToggle = document.getElementById('globalNavToggle');
    // Find the currently visible/revealed section
    const visibleSection = document.querySelector('.item.reveal');
    if (visibleSection) {
        const nav = visibleSection.querySelector('.section-nav');
        if (nav) {
            nav.classList.toggle('active');
            globalToggle.classList.toggle('active');
        }
    }
}

// Close side nav when clicking on a link (for mobile)
document.addEventListener('click', function (e) {
    // If clicking a link inside a section-nav, handle closing and centering
    const nav = e.target.closest('.section-nav');
    if (nav) {
        if (e.target.tagName === 'A') {
            const href = e.target.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                // Look for target in the entire document since IDs should be unique
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            if (window.innerWidth <= 1024) {
                const globalToggle = document.getElementById('globalNavToggle');
                setTimeout(() => {
                    nav.classList.remove('active');
                    if (globalToggle) globalToggle.classList.remove('active');
                }, 300);
            }
        }
    }
});

setUp();