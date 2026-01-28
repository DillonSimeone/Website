/*=======================================================
                Theme Management
=========================================================*/

/**
 * Initialize theme from localStorage or system preference.
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
    }
}

initTheme();

/**
 * Toggle between light and dark mode with transition effects.
 */
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-mode');

    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.style.transform = 'scale(1.3) rotate(360deg)';
        setTimeout(() => {
            toggle.style.transform = '';
        }, 400);
    }

    if (typeof randomizeColor === 'function') {
        setTimeout(() => randomizeColor(), 150);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
});

/*=======================================================
                Main Portfolio Navigation
=========================================================*/

let selectedButton = "";
const HistoryAPIControlsEnable = true;
let shattered = false;

window.addEventListener('popstate', (e) => {
    if (e.state) {
        reveal(e.state.previousPage, e.state.previousButton, 30, true);
    }
});

/**
 * Main reveal function for page transitions.
 */
function reveal(targetID, buttonID, timedelay = 60, historyAPI = false) {
    const button = buttonID ? document.getElementById(buttonID) : null;

    setTimeout(() => {
        hideAll(targetID, buttonID);
        if (button) selectedButton = buttonID;

        const target = document.getElementById(targetID);
        target.className = "item reveal";

        // UI Reset
        const globalToggle = document.getElementById('globalNavToggle');
        if (globalToggle) {
            globalToggle.classList.remove('active');
            globalToggle.style.display = (targetID === 'elevatorPitch' || targetID === 'loading') ? 'none' : '';
        }

        document.querySelectorAll('.section-nav').forEach(nav => nav.classList.remove('active'));
    }, timedelay);

    if (HistoryAPIControlsEnable && !historyAPI) {
        if (!buttonID) {
            history.replaceState({ previousPage: targetID, previousButton: buttonID }, '', window.location.pathname);
        } else {
            history.pushState({ previousPage: targetID, previousButton: buttonID }, '', `?page=${buttonID}`);
        }
    }

    if (shattered) unShatter();
}

/**
 * Special reveal that triggers the background shatter effect.
 */
function superReveal(targetID, buttonID, timedelay, historyAPI) {
    reveal(targetID, buttonID, timedelay, historyAPI);
    shatter();
}

/**
 * Background animation logic.
 */
function shatter() {
    const animations = ['flyUp', 'flyDown', 'flyLeft', 'flyRight'];
    const polys = document.querySelectorAll('.trianglify svg path');
    polys.forEach(poly => {
        const random = animations[Math.floor(Math.random() * animations.length)];
        poly.className.baseVal = `poly fade ${random}`;
    });
    shattered = true;
}

function unShatter() {
    const polys = document.querySelectorAll('.trianglify svg path');
    polys.forEach(poly => poly.className.baseVal = 'poly fade');
    shattered = false;
}

/**
 * Hides all inactive sections and resets nav button colors.
 */
function hideAll(targetID, buttonID) {
    const items = document.querySelectorAll('.item');
    const navButtons = document.querySelectorAll('.navButton');

    items.forEach(el => {
        if (el.id !== targetID) el.className = "item hide spin";
    });

    navButtons.forEach(btn => {
        if (btn.id !== buttonID) btn.style.fill = "#666";
    });
}

/*=======================================================
                Interactive Styling
=========================================================*/

const neonPalette = ["#00f0ff", "#ff00ff", "#00ff66", "#ff3355", "#ffee00", "#00ddff", "#ff44aa"];
const randomNeonColor = () => neonPalette[Math.floor(Math.random() * neonPalette.length)];

/**
 * Dynamic thematic color application.
 */
function randomizeColor() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const hireMe = document.querySelector('#hire');

    if (hireMe) {
        if (isDarkMode) {
            const color = randomNeonColor();
            Object.assign(hireMe.style, {
                backgroundColor: 'transparent',
                borderColor: color,
                color: color,
                boxShadow: `0 0 15px ${color}`
            });
        } else {
            Object.assign(hireMe.style, {
                backgroundColor: typeof randomPaletteColor === 'function' ? randomPaletteColor() : '#666',
                borderColor: 'transparent',
                color: '#000',
                boxShadow: ''
            });
        }
    }

    document.querySelectorAll("nav div").forEach(btn => {
        btn.onmouseover = function () {
            const color = isDarkMode ? randomNeonColor() : (typeof randomPaletteColor === 'function' ? randomPaletteColor() : '#666');
            this.style.fill = color;
            this.style.filter = isDarkMode ? `drop-shadow(0 0 8px ${color})` : '';
        };
        btn.onmouseout = function () {
            if (this.id !== selectedButton) {
                this.style.fill = isDarkMode ? "#a0a0b0" : "#666";
                this.style.filter = isDarkMode ? `drop-shadow(0 0 3px #00f0ff)` : '';
            }
        };
    });
}

function getUrlVars() {
    const vars = {};
    window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m, key, value) => {
        vars[key] = value;
    });
    return vars;
}

/*=======================================================
                Initialization Logic
=========================================================*/

function setUp() {
    const page = getUrlVars().page;
    reveal('loading', '', 30);

    if (typeof draw === 'function') draw();

    randomizeColor();

    if (page) {
        const targetBtn = document.querySelector(`#${page}`);
        if (targetBtn) targetBtn.click();
    } else {
        reveal('elevatorPitch', 'LandingPage');
    }

    generateDynamicNavs();
    injectFooters();
    initHobbyGalleries();
    initProjectGalleries();
}

/**
 * Builds table of contents for each section.
 */
function generateDynamicNavs() {
    document.querySelectorAll('.section-nav').forEach(nav => {
        const containerSelector = nav.getAttribute('data-target-container');
        const titleSelector = nav.getAttribute('data-title-selector');
        const list = nav.querySelector('.dynamic-links');
        const section = nav.closest('.item');

        if (!section || !list) return;

        list.innerHTML = '';
        section.querySelectorAll(containerSelector).forEach(target => {
            const titleEl = target.querySelector(titleSelector);
            if (!titleEl) return;

            const titleText = titleEl.innerText || titleEl.textContent;
            if (!titleText.trim()) return;

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
    startNudgeAnimation();
}

function startNudgeAnimation() {
    setInterval(() => {
        document.querySelectorAll('.section-nav').forEach(nav => {
            if (!nav.matches(':hover')) {
                nav.classList.add('nudge');
                setTimeout(() => nav.classList.remove('nudge'), 400);
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

function toggleGlobalNav() {
    const globalToggle = document.getElementById('globalNavToggle');
    const visibleSection = document.querySelector('.item.reveal');
    if (visibleSection) {
        const nav = visibleSection.querySelector('.section-nav');
        if (nav) {
            nav.classList.toggle('active');
            globalToggle.classList.toggle('active');
        }
    }
}

document.addEventListener('click', (e) => {
    const nav = e.target.closest('.section-nav');
    if (nav && e.target.tagName === 'A') {
        const href = e.target.getAttribute('href');
        if (href.startsWith('#')) {
            e.preventDefault();
            const target = document.getElementById(href.substring(1));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        if (window.innerWidth <= 1024) {
            const globalToggle = document.getElementById('globalNavToggle');
            setTimeout(() => {
                nav.classList.remove('active');
                if (globalToggle) globalToggle.classList.remove('active');
            }, 300);
        }
    }
});

/**
 * Injects commit-driven footers into main articles.
 */
function injectFooters() {
    const sectionsWithFooter = ['hobby', 'work', 'projects', 'embedded'];

    sectionsWithFooter.forEach(sectionId => {
        const article = document.getElementById(sectionId);
        if (!article) return;

        const section = article.querySelector('section');
        if (!section) return;

        const footer = document.createElement('footer');
        footer.className = 'site-footer';
        footer.innerHTML = `
            <p>Last updated: <span class="last-updated">Loading...</span></p>
            <p>© Dillon Simeone | <a href="https://github.com/DillonSimeone/Website">View on GitHub</a></p>
        `;
        section.appendChild(footer);
    });

    fetch('https://api.github.com/repos/DillonSimeone/Website/commits?per_page=1')
        .then(res => res.json())
        .then(data => {
            if (data?.[0]?.commit?.committer?.date) {
                const date = new Date(data[0].commit.committer.date);
                const formattedDate = date.toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
                document.querySelectorAll('.last-updated').forEach(el => el.textContent = formattedDate);
            }
        })
        .catch(() => document.querySelectorAll('.last-updated').forEach(el => el.textContent = 'Recently'));
}

/*=======================================================
                Gallery Modal Logic
=========================================================*/

function initHobbyGalleries() {
    initSectionGalleries('hobby', '.artwork, .headers + .images', 0);
}

function initProjectGalleries() {
    initSectionGalleries('work', '.medias, .images', 2);
}

/**
 * Transforms image groups into modal galleries.
 */
function initSectionGalleries(sectionId, blockSelector, minSizeToConvert = 0) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.querySelectorAll(blockSelector).forEach(block => {
        const imageGrid = block.classList.contains('images') || block.classList.contains('medias')
            ? block
            : block.querySelector('.images, .medias');

        if (!imageGrid) return;

        const images = Array.from(imageGrid.querySelectorAll('img'));
        if (images.length === 0) return;

        // Lazy-load fallback for non-gallery items
        if (images.length <= minSizeToConvert) {
            images.forEach(img => {
                const ds = img.getAttribute('data-src');
                if (ds) {
                    img.src = ds;
                    img.removeAttribute('data-src');
                }
            });
            return;
        }

        const imageData = images.map(img => ({
            src: img.getAttribute('data-src') || img.getAttribute('src'),
            alt: img.getAttribute('alt') || 'Gallery Image'
        }));

        const parentBlock = block.closest('div, .artwork') || block.parentElement;
        const title = parentBlock.querySelector('h2')?.textContent || 'Project Gallery';

        imageGrid.innerHTML = '';

        const thumbnail = document.createElement('div');
        thumbnail.className = 'gallery-thumbnail';

        const firstImg = document.createElement('img');
        Object.assign(firstImg, { src: imageData[0].src, alt: imageData[0].alt, loading: 'lazy' });

        thumbnail.appendChild(firstImg);
        thumbnail.onclick = () => openGallery(title, imageData);
        imageGrid.appendChild(thumbnail);

        if (imageData.length > 1) {
            const btn = document.createElement('button');
            btn.className = 'view-gallery-btn';
            btn.textContent = `View Full Gallery (${imageData.length} images)`;
            btn.onclick = (e) => {
                e.stopPropagation();
                openGallery(title, imageData);
            };
            imageGrid.after(btn);
        }
    });
}

/**
 * Dynamically loads and displays modal gallery.
 */
function openGallery(title, images) {
    const modal = document.getElementById('galleryModal');
    const container = document.getElementById('galleryScrollContainer');
    const titleEl = document.getElementById('galleryTitle');

    if (!modal || !container) return;

    titleEl.textContent = title;
    container.innerHTML = '';
    document.body.style.overflow = 'hidden';

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);

    images.forEach((imgData, index) => {
        const img = document.createElement('img');
        img.alt = imgData.alt;
        img.onload = () => setTimeout(() => img.classList.add('loaded'), index * 100);
        img.src = imgData.src;
        container.appendChild(img);
    });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeGallery();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeGallery() {
    const modal = document.getElementById('galleryModal');
    const container = document.getElementById('galleryScrollContainer');

    if (!modal) return;
    modal.classList.remove('active');

    setTimeout(() => {
        modal.style.display = 'none';
        if (container) container.innerHTML = '';

        const activeItem = document.querySelector('.item.reveal');
        document.body.style.overflow = activeItem ? 'hidden' : '';
    }, 400);
}

setUp();