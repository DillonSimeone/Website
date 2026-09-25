const strobeGrid = document.getElementById('strobe-grid');
const btns = {
  slow: document.getElementById('btn-slow'),
  rave: document.getElementById('btn-rave'),
  off: document.getElementById('btn-off')
};

// Set default
strobeGrid.classList.add('speed-rave');

function setSpeedClass(speed) {
  strobeGrid.classList.remove('speed-rave', 'speed-slow');
  Object.keys(btns).forEach(k => btns[k].classList.remove('active'));
  
  if (speed !== 'off') {
    strobeGrid.classList.add(`speed-${speed}`);
  }
  btns[speed].classList.add('active');
}

btns.slow.addEventListener('click', () => setSpeedClass('slow'));
btns.rave.addEventListener('click', () => setSpeedClass('rave'));
btns.off.addEventListener('click', () => setSpeedClass('off'));

// Chrome warp logic on mousemove
const chromeBox = document.getElementById('chrome-box');

chromeBox.addEventListener('mousemove', (e) => {
  const rect = chromeBox.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  
  chromeBox.style.background = `radial-gradient(circle at ${x}% ${y}%, #ffffff, #555555 25%, #111111 50%, #888888 75%, #000000 100%)`;
});

chromeBox.addEventListener('mouseleave', () => {
  chromeBox.style.background = `radial-gradient(circle at 50% 50%, #ffffff, #555555 30%, #111111 60%, #555555 90%)`;
});
