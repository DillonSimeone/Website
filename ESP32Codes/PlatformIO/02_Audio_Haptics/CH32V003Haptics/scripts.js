// CH32V003 HAPTIC CORE — page behavior

// ---------- Strobe grid speed control ----------
const strobeGrid = document.getElementById('strobe-grid');
const btns = {
  slow: document.getElementById('btn-slow'),
  rave: document.getElementById('btn-rave'),
  off: document.getElementById('btn-off')
};

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

// ---------- BOM totals ----------
(function computeBomTotals() {
  const rows = document.querySelectorAll('#bom-table tbody tr');
  let total = 0;
  let probeCost = 0;

  rows.forEach(row => {
    const price = parseFloat(row.dataset.price) || 0;
    total += price;
    if (row.textContent.includes('WCH-LinkE')) probeCost = price;
  });

  const fmt = v => '$' + v.toFixed(2);
  document.getElementById('bom-total').textContent = fmt(total);
  document.getElementById('bom-total-no-probe').textContent = fmt(total - probeCost);
})();

// ---------- Copy buttons ----------
document.querySelectorAll('.code-block[data-copy]').forEach(block => {
  const btn = block.querySelector('.copy-btn');
  const pre = block.querySelector('pre');

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      btn.textContent = 'COPIED!';
    } catch {
      btn.textContent = 'FAILED';
    }
    setTimeout(() => { btn.textContent = 'COPY'; }, 1200);
  });
});

// ---------- Gotcha accordions ----------
document.querySelectorAll('.gotcha').forEach(g => {
  const head = g.querySelector('.gotcha-head');
  head.addEventListener('click', () => g.classList.toggle('open'));
  if (g.hasAttribute('data-open')) g.classList.add('open');
});
