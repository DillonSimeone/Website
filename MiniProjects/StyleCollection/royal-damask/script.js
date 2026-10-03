const frameBody = document.getElementById('frame-body');
const buttons = {
  baroque: document.getElementById('btn-baroque'),
  gilded: document.getElementById('btn-gilded'),
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

buttons.baroque.addEventListener('click', () => {
  frameBody.className = 'damask-container border-style-baroque';
  setActiveButton('baroque');
});

buttons.gilded.addEventListener('click', () => {
  frameBody.className = 'damask-container border-style-gilded';
  setActiveButton('gilded');
});

buttons.minimal.addEventListener('click', () => {
  frameBody.className = 'damask-container border-style-minimal';
  setActiveButton('minimal');
});
