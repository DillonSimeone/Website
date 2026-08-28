document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('panel-2');

  // Interactive 3D structural tilt math
  panel.addEventListener('mousemove', (e) => {
    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left; // x coordinate inside element
    const y = e.clientY - rect.top;  // y coordinate inside element
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Tilt calculations
    const rotateY = ((x - centerX) / centerX) * 15; // max 15 deg
    const rotateX = -((y - centerY) / centerY) * 15; // max 15 deg
    
    panel.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
    panel.style.boxShadow = `${-rotateY * 0.8}px ${rotateX * 0.8 + 10}px 0px #000`;
  });

  // Revert back when mouse leaves panel
  panel.addEventListener('mouseleave', () => {
    panel.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
    panel.style.boxShadow = '10px 10px 0px #000';
  });
});
