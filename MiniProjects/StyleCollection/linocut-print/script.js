document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-ink');
  const body = document.body;
  const classes = ['ink-charcoal', 'ink-terracotta', 'ink-indigo'];
  let currentIdx = 0;

  btn.addEventListener('click', () => {
    body.classList.remove(classes[currentIdx]);
    currentIdx = (currentIdx + 1) % classes.length;
    body.classList.add(classes[currentIdx]);
  });
});
