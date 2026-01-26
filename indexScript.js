/*=======================================================
                Theme Toggle - Cyberpunk Dark Mode
=========================================================*/

/**
 * 🌙 Initialize theme from localStorage or system preference
 * Runs immediately to prevent flash of wrong theme
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
    }
}

// Run immediately (before DOM fully loads) to prevent flash
initTheme();

/**
 * ☀️🌙 Toggle between light and dark mode with a cool transition
 */
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-mode');

    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Trigger a subtle "flash" effect on toggle
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.style.transform = 'scale(1.3) rotate(360deg)';
        setTimeout(() => {
            toggle.style.transform = '';
        }, 400);
    }

    // Re-generate trianglify with new color palette after theme switch
    if (typeof draw === 'function') {
        setTimeout(() => draw(), 100);
    }

    // Update nav button colors for the new theme
    if (typeof randomizeColor === 'function') {
        setTimeout(() => randomizeColor(), 150);
    }
}

// Attach event listener once DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
});

/*=======================================================
                Main Portfolio Scripts
=========================================================*/

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

// Cyberpunk neon palette for dark mode
const neonPalette = ["#00f0ff", "#ff00ff", "#00ff66", "#ff3355", "#ffee00", "#00ddff", "#ff44aa"];

function randomNeonColor() {
    return neonPalette[Math.floor(Math.random() * neonPalette.length)];
}

function randomizeColor() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    let hireMe = document.querySelector('#hire');

    if (isDarkMode) {
        const color = randomNeonColor();
        hireMe.style.backgroundColor = 'transparent';
        hireMe.style.borderColor = color;
        hireMe.style.color = color;
        hireMe.style.boxShadow = `0 0 15px ${color}`;
    } else {
        hireMe.style.backgroundColor = randomPaletteColor();
        hireMe.style.borderColor = 'transparent';
        hireMe.style.color = '#000';
        hireMe.style.boxShadow = '';
    }

    let buttons = Array.from(document.querySelectorAll("nav div"));

    buttons.forEach(element => {
        element.onmouseover = function () {
            const color = isDarkMode ? randomNeonColor() : randomPaletteColor();
            this.style.fill = color;
            if (isDarkMode) {
                this.style.filter = `drop-shadow(0 0 8px ${color})`;
            } else {
                this.style.filter = ''; // Clear dark mode glow
            }
        }
        element.onmouseout = function () { //Selected buttons keeps their random hover colors.
            if (this.id !== selectedButton) {
                this.style.fill = isDarkMode ? "#a0a0b0" : "#666";
                if (isDarkMode) {
                    this.style.filter = `drop-shadow(0 0 3px #00f0ff)`;
                } else {
                    this.style.filter = '';
                }
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
    injectFooters();
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

/**
 * 🦶 Injects a cute footer at the bottom of all content sections
 * Fetches last commit date from GitHub API for the "Last updated" text
 */
function injectFooters() {
    // Sections that should have a footer (exclude loading and elevator pitch)
    const sectionsWithFooter = ['hobby', 'work', 'projects', 'embedded'];

    sectionsWithFooter.forEach(sectionId => {
        const article = document.getElementById(sectionId);
        if (!article) return;

        const section = article.querySelector('section');
        if (!section) return;

        // Create footer element
        const footer = document.createElement('footer');
        footer.className = 'site-footer';
        footer.innerHTML = `
            <p>Last updated: <span class="last-updated">Loading...</span></p>
            <p>© Dillon Simeone | <a href="https://github.com/DillonSimeone/Website">View on GitHub</a></p>
        `;

        section.appendChild(footer);
    });

    // Fetch last commit date from GitHub API and update all footers
    fetch('https://api.github.com/repos/DillonSimeone/Website/commits?per_page=1')
        .then(response => response.json())
        .then(data => {
            if (data && data[0] && data[0].commit && data[0].commit.committer.date) {
                const date = new Date(data[0].commit.committer.date);
                const formattedDate = date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                // Update all footer dates
                document.querySelectorAll('.last-updated').forEach(el => {
                    el.textContent = formattedDate;
                });
            }
        })
        .catch(() => {
            document.querySelectorAll('.last-updated').forEach(el => {
                el.textContent = 'Recently';
            });
        });
}

setUp();