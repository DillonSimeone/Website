document.addEventListener('DOMContentLoaded', () => {
  const board = document.getElementById('map-board');
  const clearBtn = document.getElementById('btn-clear-pins');

  board.addEventListener('click', (e) => {
    // Prevent placement when clicking buttons or internal cards
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.closest('.map-card')) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel values into mock latitude/longitude coordinates
    const lat = ((y / rect.height) * 180 - 90).toFixed(4);
    const lon = ((x / rect.width) * 360 - 180).toFixed(4);
    const latDir = lat >= 0 ? 'S' : 'N'; // inverted coordinate mapping
    const lonDir = lon >= 0 ? 'E' : 'W';

    // Create Pin Node
    const pin = document.createElement('div');
    pin.classList.add('map-pin');
    pin.style.left = `${x - 10}px`;
    pin.style.top = `${y - 25}px`;

    // Create coords popup
    const popup = document.createElement('div');
    popup.classList.add('pin-popup');
    popup.textContent = `${Math.abs(lat).toFixed(1)}°${latDir}, ${Math.abs(lon).toFixed(1)}°${lonDir}`;
    
    pin.appendChild(popup);
    board.appendChild(pin);
  });

  // Clear all pinned markers
  clearBtn.addEventListener('click', () => {
    const pins = document.querySelectorAll('.map-pin');
    pins.forEach(p => p.remove());
  });
});
