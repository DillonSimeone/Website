document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('glitter-trail-container');

  // Spawn trail sparkles
  window.addEventListener('mousemove', (e) => {
    // Limit spawn rate slightly
    if (Math.random() > 0.35) return;

    const particle = document.createElement('div');
    particle.classList.add('glitter-particle');

    // Position at mouse coords
    particle.style.left = `${e.clientX}px`;
    particle.style.top = `${e.clientY + window.scrollY}px`;

    // Random displacement vector
    const mx = (Math.random() - 0.5) * 80; // floating range
    const my = (Math.random() - 0.5) * 80;
    
    // Set custom CSS variables
    particle.style.setProperty('--mx', `${mx}px`);
    particle.style.setProperty('--my', `${my}px`);

    // Random particle size scale
    const scale = Math.random() * 0.6 + 0.5;
    particle.style.transform = `scale(${scale})`;

    // Random colors
    const colors = ['#fff', '#ff7dd6', '#ffea7d', '#7dd6ff'];
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

    container.appendChild(particle);

    // Remove from DOM after float-fade animation completes
    setTimeout(() => {
      particle.remove();
    }, 800);
  });
});
