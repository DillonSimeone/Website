// Modal Pop-up (Iframe Viewer) Module
(function initModal() {
  const itemModal = document.querySelector("#itemModal");
  const modalFrame = document.querySelector("#modalFrame");
  const modalCloseBtn = document.querySelector("#modalCloseBtn");
  const container = document.querySelector("#galleryContainer") || document.querySelector("#searchResults");

  if (!itemModal || !modalFrame || !container) return;

  function openModal(url) {
    if (url.startsWith("data:text/html")) {
      modalFrame.removeAttribute("src");
      modalFrame.srcdoc = decodeURIComponent(url.replace(/^data:text\/html[^,]*,/, ''));
    } else {
      modalFrame.removeAttribute("srcdoc");
      modalFrame.src = url;
    }
    itemModal.classList.add("open");
    itemModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    itemModal.classList.remove("open");
    itemModal.setAttribute("aria-hidden", "true");
    modalFrame.removeAttribute("srcdoc");
    modalFrame.src = "";
    document.body.style.overflow = "";
  }

  // Intercept item clicks in either gallery or search results
  container.addEventListener("click", function (event) {
    const link = event.target.closest(".onion-card, .resultLink, .resultItem a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (href && href !== "#") {
      event.preventDefault();
      openModal(href);
    }
  });

  // Also support the breathing red onion link in the tidbit section
  document.addEventListener("click", function (event) {
    const breathingLink = event.target.closest(".breathing-red-link");
    if (breathingLink) {
      event.preventDefault();
      openModal(breathingLink.getAttribute("href"));
    }
  });

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }

  itemModal.addEventListener("click", function (event) {
    if (event.target === itemModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && itemModal.classList.contains("open")) {
      closeModal();
    }
  });
})();
