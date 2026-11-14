document.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('news-page');
  const lens = document.getElementById('mag-lens');

  // Interactive Magnifying Glass zoom math
  page.addEventListener('mousemove', (e) => {
    lens.classList.add('active');

    // Position the lens centered at cursor coords
    const x = e.pageX;
    const y = e.pageY;
    
    lens.style.left = `${x - 70}px`;
    lens.style.top = `${y - 70}px`;

    // Calculate background offsets relative to page sheet bounds
    const rect = page.getBoundingClientRect();
    const pageX = e.clientX - rect.left;
    const pageY = e.clientY - rect.top;

    // Zoom factor is 1.6x. Offset background position of the lens
    // to align the zoomed backdrop print properly
    const bgX = -((pageX * 1.6) - 70);
    const bgY = -((pageY * 1.6) - 70);

    lens.style.backgroundPosition = `${bgX}px ${bgY}px`;
  });

  page.addEventListener('mouseleave', () => {
    lens.classList.remove('active');
  });
});
