const colors = [
  '#f3f0ea', // Original sand
  '#ffde43', // Yellow-sun
  '#b2ff59', // Lime-green
  '#ffab91', // Peach-salmon
  '#b3e5fc', // Light sky
  '#e1bee7'  // Lavender
];

document.getElementById('btn-color').addEventListener('click', () => {
  const currentBg = document.body.style.backgroundColor;
  let newBg = colors[Math.floor(Math.random() * colors.length)];
  // Keep picking until different
  while (newBg.toLowerCase() === currentBg.toLowerCase()) {
    newBg = colors[Math.floor(Math.random() * colors.length)];
  }
  document.body.style.backgroundColor = newBg;
});

document.getElementById('btn-alert').addEventListener('click', () => {
  alert('🔴 NEOBRUTALISM: Raw elements override standard rounded-corner rules!');
});

const textInput = document.getElementById('neo-text-input');
const outputPreview = document.getElementById('live-output');
const sendBtn = document.getElementById('btn-send');

textInput.addEventListener('input', (e) => {
  if (e.target.value.trim() === '') {
    outputPreview.textContent = 'Output preview will appear here...';
  } else {
    outputPreview.textContent = `⚡ Live Input: "${e.target.value}"`;
  }
});

sendBtn.addEventListener('click', () => {
  const val = textInput.value;
  if (val.trim()) {
    alert(`✉️ Sent: ${val}`);
    textInput.value = '';
    outputPreview.textContent = 'Output preview will appear here...';
  } else {
    alert('⚠️ Input is empty!');
  }
});
