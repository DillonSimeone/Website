document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.holo-card');

  // Interactive light reflection shift on mouse movement
  window.addEventListener('mousemove', (e) => {
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Calculate percentage coords
      const xPercent = Math.round((x / rect.width) * 100);
      const yPercent = Math.round((y / rect.height) * 100);

      // Shift the holographic overlay gradient positioning
      const shine = card.querySelector('.holo-shine');
      if (shine) {
        shine.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
      }
    });
  });
});
