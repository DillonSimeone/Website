document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.tarot-card-wrapper');

  // Toggle card flip on click
  cards.forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
    });
  });
});
