/* 
  Static Asset Background - Optimized for zero-computation rendering.
*/

const min = 20;
const max = 80;

let cachedMobileSvg = null;
let cachedDesktopSvg = null;

window.mobilecheck = function () {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

async function getSvgData(isMobile) {
    if (isMobile) {
        if (!cachedMobileSvg) {
            const res = await fetch('/background-mobile.svg');
            cachedMobileSvg = await res.text();
        }
        return cachedMobileSvg;
    } else {
        if (!cachedDesktopSvg) {
            const res = await fetch('/background-desktop.svg');
            cachedDesktopSvg = await res.text();
        }
        return cachedDesktopSvg;
    }
}

/**
 * Mobile path: Inject a static, palette-colored SVG directly.
 * No Web Worker needed — color replacement is a fast regex (<1ms).
 * Result: static paint-only paths with zero JS overhead.
 */
async function drawMobile() {
    const container = document.querySelector('.trianglify');
    if (!container) return;

    try {
        const svgData = await getSvgData(true);

        const coloredSvg = svgData.replace(/fill="[^"]*"/g, () => {
            const c = typeof randomRgb === 'function' ? randomRgb(min, max) : '#888';
            return `fill="${c}"`;
        }).replace(/stroke="[^"]*"/g, () => {
            const c = typeof randomRgb === 'function' ? randomRgb(min, max) : '#888';
            return `stroke="${c}"`;
        });

        container.style.opacity = '0';
        container.style.transition = 'opacity 1.2s ease';
        container.innerHTML = coloredSvg;

        requestAnimationFrame(() => {
            container.style.opacity = '';
        });
    } catch (e) {
        console.warn('Failed to load mobile background SVG:', e);
    }
}

/**
 * Desktop path: Full interactive SVG with mousemove reveal circle.
 * Preserved exactly as before for desktop users.
 */
async function drawDesktop() {
    const container = document.querySelector('.trianglify');
    if (!container) return;

    try {
        const isMobile = window.innerWidth < 800;
        const svgData = await getSvgData(isMobile);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = svgData;
        const pattern = tempDiv.querySelector('svg');
        if (!pattern) return;

        pattern.setAttribute('width', '100%');
        pattern.setAttribute('height', '100%');
        pattern.setAttribute('preserveAspectRatio', 'xMidYMid slice');

        const paths = Array.from(pattern.querySelectorAll('path'));
        paths.forEach(path => {
            if (typeof randomRgb === 'function') {
                const color = randomRgb(min, max);
                path.setAttribute('fill', color);
                path.setAttribute('stroke', color);
            }
        });

        const circleElement = document.createElement("div");
        circleElement.className = "circle";
        container.innerHTML = "";
        container.appendChild(pattern);
        container.appendChild(circleElement);

        paths.forEach(poly => {
            poly.classList.add('poly', 'fade');
        });

        document.removeEventListener('mousemove', document.fn);

        requestAnimationFrame(() => {
            const circle = document.querySelector('.circle');
            const radius = circle ? circle.clientWidth / 2 : 50;

            const polyPoints = paths.map(poly => {
                const rect = poly.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            });

            let ticking = false;
            let frameCount = 0;
            const polyActiveStates = new Array(polyPoints.length).fill(false);

            document.addEventListener('mousemove', document.fn = function fn(e) {
                if (!ticking) {
                    window.requestAnimationFrame(() => {
                        frameCount++;
                        if (frameCount % 2 !== 0) { ticking = false; return; }
                        if (!circle) { ticking = false; return; }
                        const center = { x: e.clientX, y: e.clientY };
                        circle.style.transform = `translate(${center.x - radius}px, ${center.y - radius}px)`;
                        for (let i = 0; i < polyPoints.length; i++) {
                            const isInCircle = detectPointInCircle(polyPoints[i], radius, center);
                            if (isInCircle && !polyActiveStates[i]) {
                                paths[i].classList.remove('fade');
                                polyActiveStates[i] = true;
                            } else if (!isInCircle && polyActiveStates[i]) {
                                paths[i].classList.add('fade');
                                polyActiveStates[i] = false;
                            }
                        }
                        ticking = false;
                    });
                    ticking = true;
                }
            });
        });
    } catch (e) {
        console.warn('Failed to load desktop background SVG:', e);
    }
}

/**
 * Route to mobile or desktop path based on viewport width.
 */
function draw() {
    if (window.innerWidth < 800) {
        drawMobile();
    } else {
        drawDesktop();
    }
}

function detectPointInCircle(point, radius, center) {
    return Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2) <= radius * radius;
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        requestAnimationFrame(draw);
    });
} else {
    requestAnimationFrame(draw);
}

window.redraw = draw;
