document.addEventListener('DOMContentLoaded', () => {
  const sheets = document.querySelectorAll('.specimen-sheet');
  const modal = document.getElementById('specimen-modal');
  const closeModal = document.getElementById('btn-close-modal');

  const modalGenus = document.getElementById('modal-genus');
  const modalFamily = document.getElementById('modal-family');
  const modalLoc = document.getElementById('modal-loc');

  sheets.forEach(sheet => {
    sheet.addEventListener('click', () => {
      // Extract data
      const genus = sheet.getAttribute('data-genus');
      const family = sheet.getAttribute('data-family');
      const loc = sheet.getAttribute('data-loc');

      // Populate modal
      modalGenus.textContent = genus;
      modalFamily.textContent = family;
      modalLoc.textContent = loc;

      // Show modal
      modal.classList.add('active');
    });
  });

  closeModal.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // Close when clicking overlay backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
});
