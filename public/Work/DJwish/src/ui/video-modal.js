/**
 * VideoModal - In-App Video Player Overlay
 * Plays YouTube collaborative music videos and live showings
 * directly on the page without navigating away, keeping bookers on site.
 */
export class VideoModal {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'video-modal';
    this.container.className = 'video-modal hidden';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Video Player');

    this.render();
    document.body.appendChild(this.container);

    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="video-modal-backdrop"></div>
      <div class="video-modal-dialog">
        <button id="video-modal-close" class="video-modal-close" aria-label="Close video player">&times;</button>
        <div class="video-modal-stage">
          <div class="video-frame-wrap">
            <iframe id="video-modal-iframe" src="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
          </div>
        </div>
        <div class="video-modal-info">
          <div class="video-modal-header">
            <h3 id="video-modal-title" class="video-modal-title"></h3>
            <a id="video-modal-yt-btn" href="" target="_blank" rel="noopener noreferrer" class="video-modal-yt-link">
              <span>WATCH ON YOUTUBE ↗</span>
            </a>
          </div>
          <p id="video-modal-desc" class="video-modal-desc"></p>
        </div>
      </div>
    `;

    this.iframe = this.container.querySelector('#video-modal-iframe');
    this.titleEl = this.container.querySelector('#video-modal-title');
    this.descEl = this.container.querySelector('#video-modal-desc');
    this.ytBtn = this.container.querySelector('#video-modal-yt-btn');
  }

  bindEvents() {
    this.container.querySelector('#video-modal-close')?.addEventListener('click', () => this.close());
    this.container.querySelector('.video-modal-backdrop')?.addEventListener('click', () => this.close());

    window.addEventListener('keydown', (e) => {
      if (!this.container.classList.contains('hidden') && e.key === 'Escape') {
        this.close();
      }
    });
  }

  open({ videoId, title = '', desc = '', url = '' }) {
    if (!videoId) return;

    this.iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.descEl) this.descEl.textContent = desc;
    if (this.ytBtn) this.ytBtn.href = url || `https://www.youtube.com/watch?v=${videoId}`;

    this.container.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.container.classList.add('visible');
    });
  }

  close() {
    this.container.classList.remove('visible');
    // Stop video playback immediately
    if (this.iframe) this.iframe.src = '';
    setTimeout(() => {
      if (!this.container.classList.contains('visible')) {
        this.container.classList.add('hidden');
      }
    }, 250);
  }
}
