document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-palette');
  const body = document.body;
  const palettes = ['palette-1', 'palette-2', 'palette-3'];
  let currentIdx = 0;

  btn.addEventListener('click', () => {
    body.classList.remove(palettes[currentIdx]);
    currentIdx = (currentIdx + 1) % palettes.length;
    body.classList.add(palettes[currentIdx]);
  });
});
