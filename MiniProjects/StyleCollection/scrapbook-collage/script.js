document.addEventListener('DOMContentLoaded', () => {
  const board = document.getElementById('scrapbook-board');
  const clearBtn = document.getElementById('btn-clear-tape');

  // Listen to clicks on the scrapbook board to place tape strips
  board.addEventListener('click', (e) => {
    // Avoid placing tape when clicking on buttons or links
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.closest('.clear-btn')) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Create tape element
    const tape = document.createElement('div');
    tape.classList.add('placed-tape');
    
    // Random rotation and dimensions
    const randomRot = Math.floor(Math.random() * 50) - 25; // -25 to +25 deg
    const randomWidth = Math.floor(Math.random() * 30) + 75; // 75px to 105px
    
    tape.style.left = `${x - randomWidth / 2}px`;
    tape.style.top = `${y - 12}px`;
    tape.style.width = `${randomWidth}px`;
    tape.style.transform = `rotate(${randomRot}deg)`;

    board.appendChild(tape);
  });

  // Clear all placed tapes
  clearBtn.addEventListener('click', () => {
    const placedTapes = document.querySelectorAll('.placed-tape');
    placedTapes.forEach(t => t.remove());
  });
});
