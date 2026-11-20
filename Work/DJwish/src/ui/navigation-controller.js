import { STOPS } from '../three/world.js';

const GIG_STOPS = {
  1: 'codafest',
  2: 'wdt',
  3: 'confluence',
  4: 'ada'
};

/**
 * NavigationController - Handles street stop routing, gesture-gated wheel & touch swipes,
 * section dots, bottom navigation pill, and GigCard sync.
 */
export class NavigationController {
  constructor({ app, director, gigCard, onStopChange } = {}) {
    this.app = app;
    this.director = director;
    this.gigCard = gigCard;
    this.onStopChange = onStopChange;

    this.currentPage = 0;
    this.activeDot = -1;
    this.isProgrammaticScroll = false;
    this.wheelLockUntil = 0;
    this.touchStartY = 0;
    this.touchStartX = 0;
    this.touchBlocked = false;

    this.threeContainer = document.getElementById('three-container');
    this.scrollHint = document.getElementById('scroll-hint');
    this.dots = Array.from(document.querySelectorAll('.section-dot'));
    this.btnPillPrev = document.getElementById('btn-pill-prev');
    this.btnPillNext = document.getElementById('btn-pill-next');
    this.pillPageTitle = document.getElementById('pill-page-title');

    if (this.scrollHint && window.matchMedia('(pointer: coarse)').matches) {
      this.scrollHint.textContent = 'SWIPE TO WALK THE STREET';
    }

    this.bindEvents();
  }

  getScrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? window.scrollY / max : 0;
  }

  scrollToStop(index, behavior = 'instant') {
    const i = Math.max(0, Math.min(STOPS.length - 1, index));
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: (i / (STOPS.length - 1)) * max, behavior });
  }

  goToPage(index, { instant = false } = {}) {
    if (this.app.isStageMode || this.app.settingsOpen) return;

    const prev = this.currentPage;
    const target = Math.max(0, Math.min(STOPS.length - 1, index));
    this.currentPage = target;

    this.app.skipIntroIfPlaying();
    if (this.app.hero && !this.app.hero.isDismissed) {
      this.app.hero.dismiss(false);
    }

    // Keep native scrollbar synced without fighting programmatic camera transitions
    clearTimeout(this.scrollSyncTimer);
    this.isProgrammaticScroll = true;
    this.scrollToStop(target, 'instant');
    this.scrollSyncTimer = setTimeout(() => {
      this.isProgrammaticScroll = false;
    }, 90);

    const directJump = !instant && Math.abs(target - prev) >= 2;
    this.director.goToStop(target, { direct: directJump, instant });

    this.updateNavButtons();
    this.updateGigCard();
    this.onStopChange?.(target);
  }

  updateNavButtons() {
    if (this.btnPillPrev) this.btnPillPrev.disabled = (this.currentPage <= 0);
    if (this.btnPillNext) this.btnPillNext.disabled = (this.currentPage >= STOPS.length - 1);
    if (this.pillPageTitle) {
      const stop = STOPS[this.currentPage];
      const label = stop?.pageTitle || stop?.label || `Page ${this.currentPage + 1}`;
      this.pillPageTitle.textContent = `${label} (${this.currentPage + 1}/${STOPS.length})`;
    }
  }

  updateGigCard() {
    if (!this.gigCard) return;
    if (this.app.isStageMode || this.app.settingsOpen) {
      this.gigCard.hide();
      return;
    }
    const gigId = GIG_STOPS[this.currentPage];
    if (gigId) this.gigCard.showGig(gigId);
    else this.gigCard.hide();
  }

  updateStreetHud() {
    const stopFloat = this.director.stopFloat;
    const dot = Math.round(stopFloat);
    if (dot !== this.activeDot) {
      this.activeDot = dot;
      this.dots.forEach((d, i) => d.classList.toggle('active', i === dot));
    }
    if (this.scrollHint) {
      const show = stopFloat < 0.12 ? '1' : '0';
      if (this.scrollHint.style.opacity !== show) this.scrollHint.style.opacity = show;
    }
  }

  bindEvents() {
    window.addEventListener('scroll', () => {
      if (this.app.isStageMode || this.app.settingsOpen || this.isProgrammaticScroll) return;
      const progress = this.getScrollProgress();
      this.director.setScrollProgress(progress);
      const stop = Math.round(progress * (STOPS.length - 1));
      if (stop !== this.currentPage) {
        this.currentPage = stop;
        this.updateNavButtons();
        this.updateGigCard();
      }
      if (window.scrollY > 4) this.app.skipIntroIfPlaying();
    }, { passive: true });

    // Non-passive wheel handler prevents native momentum from overriding stop transitions
    window.addEventListener('wheel', (e) => {
      if (e.target.closest('#gig-floating-card, .hero-docked-card, #video-modal, #gig-lightbox, #settings-layer')) return;
      if (this.app.isStageMode || this.app.settingsOpen) return;

      e.preventDefault();

      if (this.app.hero && !this.app.hero.isDismissed) {
        this.app.hero.dismiss(false);
        return;
      }

      if (Math.abs(e.deltaY) < 16) return;

      const now = performance.now();
      if (now < this.wheelLockUntil) return;
      this.wheelLockUntil = now + 420;

      this.goToPage(this.currentPage + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });

    window.addEventListener('touchstart', (e) => {
      this.touchBlocked = Boolean(
        e.target.closest('#gig-floating-card, .hero-docked-card, #video-modal, #gig-lightbox, #settings-layer, #street-header, #bottom-nav-pill, .wall-panel')
      );
      if (e.touches && e.touches[0]) {
        this.touchStartY = e.touches[0].clientY;
        this.touchStartX = e.touches[0].clientX;
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.touchBlocked || this.app.settingsOpen) return;
      if (!e.changedTouches || !e.changedTouches[0]) return;

      const dy = this.touchStartY - e.changedTouches[0].clientY;
      const dx = this.touchStartX - e.changedTouches[0].clientX;

      if (this.app.isStageMode) {
        // Horizontal swipe switches Live Stage Rig scenes on mobile
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          this.app.stepStageScene(dx > 0 ? 1 : -1);
        }
        return;
      }

      if (this.app.hero && !this.app.hero.isDismissed) {
        if (dy > 35) this.app.hero.dismiss(false);
        return;
      }

      if (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.15) {
        this.goToPage(this.currentPage + (dy > 0 ? 1 : -1));
      }
    }, { passive: true });

    this.threeContainer?.addEventListener('pointerdown', () => this.app.skipIntroIfPlaying());
    this.btnPillPrev?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.btnPillNext?.addEventListener('click', () => this.goToPage(this.currentPage + 1));

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => {
        this.app.skipIntroIfPlaying();
        this.goToPage(parseInt(dot.dataset.stop, 10));
      });
    });
  }
}
