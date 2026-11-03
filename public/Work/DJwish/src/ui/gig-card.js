import { GIGS_DATA, getBookingMailto } from '../data/gigs.js';

/**
 * GigCardController - Floating Glassy Card & Mobile Bottom Sheet
 * Follows the camera during past gig & studio stops (CodaFest, WDT, Confluence, ADA)
 * providing bookers with venue details, audience impact, event-fit takeaways,
 * in-app video playback, and 1-click orbital switching around the 120m hydraulic gig tower.
 */
export class GigCardController {
  constructor({ onSelectGig, onFastTrack, onPlayVideo } = {}) {
    this.onSelectGig = onSelectGig;
    this.onFastTrack = onFastTrack;
    this.onPlayVideo = onPlayVideo;
    this.currentGig = null;
    this.lightboxIndex = 0;
    this.activePhotos = [];

    this.cardEl = document.createElement('aside');
    this.cardEl.id = 'gig-floating-card';
    this.cardEl.className = 'gig-card hidden';
    this.cardEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.cardEl);

    this.createLightbox();
    this.bindEvents();
  }

  createLightbox() {
    this.lightbox = document.createElement('div');
    this.lightbox.id = 'gig-lightbox';
    this.lightbox.className = 'lightbox hidden';
    this.lightbox.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="Gig Photo Gallery">
        <button id="lightbox-btn-close" class="lightbox-close" aria-label="Close photo view">&times;</button>
        <button id="lightbox-btn-prev" class="lightbox-nav prev" aria-label="Previous photo">&#8249;</button>
        <div class="lightbox-stage">
          <img id="lightbox-img" src="" alt="Festival performance photo">
          <div class="lightbox-meta">
            <span id="lightbox-caption" class="lightbox-caption"></span>
            <span id="lightbox-counter" class="lightbox-counter"></span>
          </div>
        </div>
        <button id="lightbox-btn-next" class="lightbox-nav next" aria-label="Next photo">&#8250;</button>
      </div>
    `;
    document.body.appendChild(this.lightbox);
  }

  bindEvents() {
    // Lightbox navigation
    this.lightbox.querySelector('#lightbox-btn-close')?.addEventListener('click', () => this.closeLightbox());
    this.lightbox.querySelector('.lightbox-backdrop')?.addEventListener('click', () => this.closeLightbox());
    this.lightbox.querySelector('#lightbox-btn-prev')?.addEventListener('click', () => this.stepLightbox(-1));
    this.lightbox.querySelector('#lightbox-btn-next')?.addEventListener('click', () => this.stepLightbox(1));

    window.addEventListener('keydown', (e) => {
      if (!this.lightbox.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closeLightbox();
        else if (e.key === 'ArrowLeft') this.stepLightbox(-1);
        else if (e.key === 'ArrowRight') this.stepLightbox(1);
      }
    });

    // Mobile sheet toggle
    this.cardEl.addEventListener('click', (e) => {
      if (e.target.closest('.sheet-handle')) {
        this.cardEl.classList.toggle('expanded');
      }
    });
  }

  showGig(gigId) {
    const gig = GIGS_DATA.find(g => g.id === gigId);
    if (!gig) {
      this.hide();
      return;
    }

    this.currentGig = gig;
    this.activePhotos = gig.photos || [];

    const isLeftDocked = (gigId === 'wdt' || gigId === 'ada');
    this.cardEl.classList.toggle('dock-left', isLeftDocked);
    this.cardEl.classList.toggle('dock-right', !isLeftDocked);

    const bookingUrl = getBookingMailto();

    // Render photo thumbnails, video module, or informative showcase placeholder
    let mediaHtml = '';
    if (gig.videos && gig.videos.length > 0) {
      mediaHtml = `
        <div class="gig-videos-section">
          <div class="gig-section-label">COLLABORATIVE MUSIC VIDEOS (${gig.videos.length})</div>
          <div class="gig-video-cards">
            ${gig.videos.map(v => `
              <button class="gig-video-card-btn" data-video-id="${v.id}" data-title="${v.title}" data-desc="${v.desc}" data-url="${v.url}" title="Play '${v.title}' in player">
                <div class="video-card-thumb-wrap">
                  <img src="https://img.youtube.com/vi/${v.id}/mqdefault.jpg" alt="${v.title}" loading="lazy">
                  <span class="video-play-badge">▶</span>
                </div>
                <div class="video-card-info">
                  <span class="video-tag">${v.tag}</span>
                  <span class="video-title">${v.title}</span>
                </div>
              </button>
            `).join('')}
          </div>
          ${gig.channelUrl ? `
            <a href="${gig.channelUrl}" target="_blank" rel="noopener noreferrer" class="gig-channel-link" title="Explore full past DJ sets & showings on YouTube">
              <span>▶ WATCH ALL SHOWINGS ON YOUTUBE ↗</span>
            </a>
          ` : ''}
        </div>
      `;
    } else if (this.activePhotos.length > 0) {
      mediaHtml = `
        <div class="gig-photos-section">
          <div class="gig-section-label">PHOTO GALLERY (${this.activePhotos.length} SHOTS)</div>
          <div class="gig-thumb-strip">
            ${this.activePhotos.map((p, i) => `
              <button class="gig-thumb-btn" data-index="${i}" title="${p.caption}">
                <img src="${p.thumb}" alt="${p.caption}" loading="lazy">
              </button>
            `).join('')}
          </div>
        </div>
      `;
    } else if (gig.id === 'ada') {
      mediaHtml = `
        <div class="gig-photos-empty">
          <span class="empty-tag">CERTIFIED ACCESSIBLE CIVIC STAGE</span>
          <span class="empty-sub">City of Hillsboro municipal showcase with synchronized ASL visual integration</span>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="gig-photos-empty">
          <span class="empty-tag">CAMP TALOALI RESIDENT DJ</span>
          <span class="empty-sub">High-energy sub-bass sets engineered for physical chest impact</span>
        </div>
      `;
    }

    this.cardEl.innerHTML = `
      <div class="sheet-handle" title="Tap to expand or collapse">
        <span class="handle-bar"></span>
      </div>

      <!-- Quick-switching 4-gig pill strip -->
      <div class="gig-pill-strip" role="tablist" aria-label="Experience & Gigs">
        ${GIGS_DATA.map(g => `
          <button class="gig-tab-pill ${g.id === gig.id ? 'active' : ''}" data-page="${g.pageIndex}" style="${g.id === gig.id ? `background: ${g.accent}; border-color: ${g.accent}; color: #000; font-weight: 700;` : ''}" title="Orbit 3D camera to ${g.name}">
            ${g.id === 'codafest' ? 'CODAFEST \'26' : g.id === 'wdt' ? 'TIMBERFEST' : g.id === 'confluence' ? 'CONFLUENCE LAB' : 'ADA SHOWCASE'}
          </button>
        `).join('')}
      </div>

      <div class="gig-card-header" style="border-top-color: ${gig.accent};">
        <div class="gig-header-top">
          <span class="gig-role-tag" style="background: ${gig.accentGlow}; color: #fff; border-color: ${gig.accent};">
            ${gig.role}
          </span>
          <span class="gig-date-badge">${gig.dates}</span>
        </div>
        <h2 class="gig-name">${gig.name}</h2>
        <div class="gig-location">📍 ${gig.venue} · ${gig.city}</div>
      </div>

      <div class="gig-card-body">
        ${gig.takeaway ? `
          <div class="gig-takeaway-banner" style="border-left-color: ${gig.accent};">
            <span class="takeaway-label">⚡ BOOKER FIT:</span>
            <span class="takeaway-text">${gig.takeaway}</span>
          </div>
        ` : ''}
        <p class="gig-blurb">${gig.blurb}</p>
        ${mediaHtml}
      </div>

      <div class="gig-card-footer">
        <a href="${bookingUrl}" class="gig-footer-btn gig-book-btn" title="Book Nate for your festival, civic, university or private event">
          <span>⚡ INQUIRE FOR YOUR EVENT</span>
        </a>
        <button id="gig-btn-fast-track" class="gig-footer-btn gig-fast-track-btn" title="Jump straight to Technical Rider & Rider Specs">
          <span>TECH RIDER ➔</span>
        </button>
        ${gig.website ? `
          <a href="${gig.website}" target="_blank" rel="noopener noreferrer" class="gig-footer-btn gig-site-link" title="Visit official site for ${gig.name}">
            <span>${gig.domainBadge || 'OFFICIAL SITE ↗'}</span>
          </a>
        ` : ''}
      </div>
    `;

    // Bind gig tab pill click events
    this.cardEl.querySelectorAll('.gig-tab-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = parseInt(btn.dataset.page, 10);
        if (this.onSelectGig) this.onSelectGig(page);
      });
    });

    // Bind video play buttons
    this.cardEl.querySelectorAll('.gig-video-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = btn.dataset.videoId;
        const title = btn.dataset.title;
        const desc = btn.dataset.desc;
        const url = btn.dataset.url;
        if (this.onPlayVideo) {
          this.onPlayVideo({ videoId, title, desc, url });
        }
      });
    });

    // Bind fast-track button
    this.cardEl.querySelector('#gig-btn-fast-track')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onFastTrack) this.onFastTrack();
    });

    // Bind thumbnail click events
    this.cardEl.querySelectorAll('.gig-thumb-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index, 10);
        this.openLightbox(idx);
      });
    });

    this.cardEl.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.cardEl.classList.add('visible');
    });
  }

  hide() {
    this.cardEl.classList.remove('visible');
    setTimeout(() => {
      if (!this.cardEl.classList.contains('visible')) {
        this.cardEl.classList.add('hidden');
        this.cardEl.classList.remove('expanded');
      }
    }, 300);
  }

  openLightbox(index) {
    if (!this.activePhotos.length) return;
    this.lightboxIndex = Math.max(0, Math.min(this.activePhotos.length - 1, index));
    this.updateLightboxPhoto();
    this.lightbox.classList.remove('hidden');
  }

  closeLightbox() {
    this.lightbox.classList.add('hidden');
  }

  stepLightbox(dir) {
    if (!this.activePhotos.length) return;
    this.lightboxIndex = (this.lightboxIndex + dir + this.activePhotos.length) % this.activePhotos.length;
    this.updateLightboxPhoto();
  }

  updateLightboxPhoto() {
    const photo = this.activePhotos[this.lightboxIndex];
    if (!photo) return;

    const img = this.lightbox.querySelector('#lightbox-img');
    const caption = this.lightbox.querySelector('#lightbox-caption');
    const counter = this.lightbox.querySelector('#lightbox-counter');

    if (img) {
      img.src = photo.full;
      img.alt = photo.caption;
    }
    if (caption) caption.textContent = photo.caption;
    if (counter) counter.textContent = `${this.lightboxIndex + 1} / ${this.activePhotos.length}`;
  }
}
