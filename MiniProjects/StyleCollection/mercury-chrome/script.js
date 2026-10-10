document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.mercury-card');
  let angle = 0;

  // Animate border-radius for organic fluid morphing
  function animateBlobs() {
    angle += 0.02; // morph speed

    cards.forEach((card, idx) => {
      // Offset values based on card index to make morphs asynchronous
      const offset = idx * 1.5;
      
      const a = Math.round(50 + Math.sin(angle + offset) * 18);
      const b = Math.round(50 + Math.cos(angle * 0.8 + offset) * 15);
      const c = Math.round(50 + Math.sin(angle * 1.2 + offset) * 16);
      const d = Math.round(50 + Math.cos(angle * 0.9 + offset) * 14);

      card.style.borderRadius = `${a}% ${100 - a}% ${b}% ${100 - b}% / ${c}% ${d}% ${100 - d}% ${100 - c}%`;
    });

    requestAnimationFrame(animateBlobs);
  }

  animateBlobs();
});
