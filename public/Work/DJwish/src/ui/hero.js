import { getBookingMailto } from '../data/gigs.js';

/**
 * HeroOverlay - Instant 30-Second Booker Pitch
 * Surfaces Nate's core identity, booking call-to-action, and CodaFest live video
 * within the first 0–5 seconds of loading while the 3D scene loads in the background.
 */
export class HeroOverlay {
  constructor({ onDismiss, onVideoReady }) {
    this.onDismiss = onDismiss;
    this.onVideoReady = onVideoReady;
    this.isDismissed = false;

    this.container = document.createElement('div');
    this.container.id = 'hero-overlay';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'DJ Deaf Wish Booker Summary');

    this.render();
    document.body.appendChild(this.container);

    this.bindEvents();
  }

  render() {
    const bookingUrl = getBookingMailto();

    this.container.innerHTML = `
      <div class="hero-docked-card">
        <div class="hero-pitch">
          <div class="hero-badge">
            <span class="hero-pulse-dot"></span>
            <span>UNIVERSAL MUSIC DESIGN // PORTLAND, OR</span>
          </div>

          <h1 class="hero-title">
            <span class="hero-name">DJ DEAF WISH</span>
            <span class="hero-subname">NATE HERGERT</span>
          </h1>

          <p class="hero-desc">
            Deaf electronic musician &amp; organizer. High-impact sub-bass tactile haptics, modular synthesis, and synesthetic light telemetry.
          </p>

          <div class="hero-credentials">
            <span class="cred-badge">⚡ RIT ALUMNI</span>
            <span class="cred-badge">🏛️ CYMASPACE PI ($97K OCF GRANT)</span>
            <span class="cred-badge">🔊 SUB-BASS HAPTICS &amp; 7-BAND VISUALS</span>
          </div>

          <div class="hero-actions">
            <a href="${bookingUrl}" class="hero-btn-book" title="Send booking inquiry to 3phased@gmail.com">
              <span>⚡ BOOK NATE</span>
            </a>
            <button id="hero-btn-explore" class="hero-btn-explore" title="Walk the street & explore past gigs">
              <span>ENTER STREET ↓</span>
            </button>
          </div>
        </div>

        <div class="hero-media-card">
          <div class="hero-video-frame">
            <video id="hero-video" autoplay loop muted playsinline poster="./assets/video/codafest-poster.jpg">
              <source src="./assets/video/codafest.mp4" type="video/mp4">
              <source src="./assets/video/codafest.webm" type="video/webm">
            </video>
          </div>
        </div>
      </div>
    `;

    this.videoEl = this.container.querySelector('#hero-video');
    if (this.videoEl) {
      this.videoEl.muted = true;
      this.videoEl.play().catch(() => {});
    }
  }

  bindEvents() {
    const btnExplore = this.container.querySelector('#hero-btn-explore');
    btnExplore?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss(true);
    });

    // Dismiss on scroll, wheel, swipe or keydown
    const onUserInteraction = (e) => {
      if (this.isDismissed) return;
      // If clicking inside the booking mailto button, let it open email without blocking
      if (e.target.closest('.hero-btn-book')) return;

      if (e.type === 'keydown') {
        const keys = ['Space', 'ArrowDown', 'PageDown', 'Enter'];
        if (!keys.includes(e.code) && !keys.includes(e.key)) return;
      }

      this.dismiss(true);
    };

    window.addEventListener('wheel', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction);
  }

  dismiss(isManualAction = false) {
    if (this.isDismissed) return;
    this.isDismissed = true;

    this.container.classList.add('dismissed');
    document.body.classList.remove('hero-active');

    setTimeout(() => {
      this.container.remove();
    }, 600);

    if (isManualAction && this.onDismiss) {
      this.onDismiss();
    }
  }
}
