const mainFrame = document.getElementById('main-frame');
const buttons = {
  classic: document.getElementById('btn-classic'),
  bold: document.getElementById('btn-bold'),
  minimal: document.getElementById('btn-minimal')
};

function setActiveButton(activeKey) {
  Object.keys(buttons).forEach(key => {
    if (key === activeKey) {
      buttons[key].classList.add('active');
    } else {
      buttons[key].classList.remove('active');
    }
  });
}

buttons.classic.addEventListener('click', () => {
  mainFrame.className = 'deco-container border-style-classic';
  setActiveButton('classic');
});

buttons.bold.addEventListener('click', () => {
  mainFrame.className = 'deco-container border-style-bold';
  setActiveButton('bold');
});

buttons.minimal.addEventListener('click', () => {
  mainFrame.className = 'deco-container border-style-minimal';
  setActiveButton('minimal');
});
