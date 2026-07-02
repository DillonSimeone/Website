document.addEventListener('DOMContentLoaded', () => {
  const fluid = document.getElementById('cocktail-fluid');
  const drinkBtn = document.getElementById('btn-drink');
  const ingBtns = document.querySelectorAll('.ing-btn');

  let currentHeight = 0;

  // Add ingredients to the glass
  ingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentHeight >= 100) return;

      currentHeight = Math.min(currentHeight + 33.3, 100);
      fluid.style.height = `${currentHeight}%`;

      // Set fluid color
      const ingColor = btn.getAttribute('data-color');
      fluid.style.backgroundColor = ingColor;
    });
  });

  // Empty the glass
  drinkBtn.addEventListener('click', () => {
    currentHeight = 0;
    fluid.style.height = '0%';
  });
});
