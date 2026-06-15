document.addEventListener('DOMContentLoaded', () => {
  const panes = document.querySelectorAll('.pane');
  const lightCast = document.getElementById('light-cast');

  // Change background light cast reflection color on pane hover
  panes.forEach(pane => {
    pane.addEventListener('mouseenter', () => {
      // Clear active classes
      panes.forEach(p => p.classList.remove('active'));
      
      // Activate hovered pane
      pane.classList.add('active');

      // Shift cast color reflection
      const castColor = pane.getAttribute('data-color');
      if (castColor) {
        lightCast.style.backgroundColor = castColor;
      }
    });
  });
});
