const gridElement = document.getElementById('content-grid');
const layoutButtons = document.querySelectorAll('.layout-btn');

layoutButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Remove active state from all buttons
    layoutButtons.forEach(btn => btn.classList.remove('active'));
    
    // Add active state to clicked button
    button.classList.add('active');
    
    // Determine columns target
    const cols = button.getAttribute('data-columns');
    
    // Clear grid classes
    gridElement.classList.remove('cols-1', 'cols-2', 'cols-3');
    
    // Add appropriate grid layout class
    gridElement.classList.add(`cols-${cols}`);
  });
});
