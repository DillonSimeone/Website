/**
 * Lightweight, privacy-friendly SPA traffic logger for Google Apps Script.
 * Logs page/hash views without cookies or PII.
 */
const ANALYTICS_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbwoF49FeLYWhKucwrGH6t6CecjubQT_0RMlWfzCNOF841k09W2XpeK3tgBtMTwRlYM3dw/exec';

function getSessionId() {
    try {
        let id = sessionStorage.getItem('ds_sid');
        if (!id) {
            id = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID().slice(0, 12)
                : Math.random().toString(36).slice(2, 14);
            sessionStorage.setItem('ds_sid', id);
        }
        return id;
    } catch {
        return '';
    }
}

let lastTrackedPath = null;

function trackView() {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal && !location.search.includes('track_test=1')) return;

    const path = (location.pathname || '/') + (location.hash || '');
    if (path === lastTrackedPath) return;
    lastTrackedPath = path;

    const payload = JSON.stringify({
        session: getSessionId(),
        path,
        referrer: document.referrer || 'direct',
        device: window.innerWidth <= 768 ? 'mobile' : 'desktop',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    });

    try {
        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'text/plain' });
            if (navigator.sendBeacon(ANALYTICS_ENDPOINT, blob)) return;
        }
        fetch(ANALYTICS_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: payload,
            keepalive: true
        }).catch(() => {});
    } catch {
        // Never disrupt user navigation
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackView, { once: true });
} else {
    trackView();
}

window.addEventListener('hashchange', trackView);
