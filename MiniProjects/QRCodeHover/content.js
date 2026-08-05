(function () {
    'use strict';

    let mouseX = 0;
    let mouseY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey || !e.shiftKey) return;
        if (e.key !== 'Control' && e.key !== 'Shift') return;

        const targetUrl = findAssetUrlAt(mouseX, mouseY) || window.location.href;
        createQrPanel(mouseX, mouseY, targetUrl);
    });

    function createQrPanel(x, y, url) {
        const panel = document.createElement('div');

        Object.assign(panel.style, {
            position: 'fixed',
            top: `${y - 10}px`,
            left: `${x + 15}px`,
            zIndex: '2147483647',
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            opacity: '0',
            transform: 'scale(0.9) translateY(10px)',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid #e5e7eb'
        });

        const label = document.createElement('div');
        label.innerText = 'Click to Copy Image';
        Object.assign(label.style, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            fontWeight: '600',
            color: '#4b5563',
            userSelect: 'none'
        });

        panel.appendChild(label);
        document.body.appendChild(panel);

        const qrHost = document.createElement('div');
        panel.appendChild(qrHost);

        // QRCode is bundled locally via lib/qrcode.min.js (loaded before this script).
        new QRCode(qrHost, {
            text: url,
            width: 150,
            height: 150,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        requestAnimationFrame(() => {
            panel.style.opacity = '1';
            panel.style.transform = 'scale(1) translateY(0)';
        });

        let autoDismissTimeout = setTimeout(() => {
            dismissPanel(panel);
        }, 3000);

        panel.addEventListener('click', (e) => {
            e.stopPropagation();
            clearTimeout(autoDismissTimeout);

            label.innerText = 'Copying...';

            try {
                const imgElement = qrHost.querySelector('img');
                if (!imgElement) {
                    throw new Error('QR image not found');
                }

                const canvas = document.createElement('canvas');
                canvas.width = 150;
                canvas.height = 150;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgElement, 0, 0);

                canvas.toBlob(async (blob) => {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);

                        label.innerText = 'Copied! ✓';
                        panel.style.backgroundColor = '#ecfdf5';
                        label.style.color = '#059669';

                        setTimeout(() => dismissPanel(panel), 600);
                    } catch (err) {
                        label.innerText = 'Clipboard Error';
                        panel.style.backgroundColor = '#fef2f2';
                        label.style.color = '#dc2626';
                        setTimeout(() => dismissPanel(panel), 1500);
                    }
                }, 'image/png');
            } catch (err) {
                label.innerText = 'Error';
                setTimeout(() => dismissPanel(panel), 1000);
            }
        });
    }

    function findAssetUrlAt(x, y) {
        const elements = document.elementsFromPoint(x, y);
        if (!elements) return null;

        for (const el of elements) {
            if (el.tagName === 'IMG' && el.src && !el.src.startsWith('data:')) return el.src;
            if (el.tagName === 'A' && el.href) return el.href;
        }

        return null;
    }

    function dismissPanel(panel) {
        panel.style.transform = 'scale(0.95) translateY(-10px)';
        panel.style.opacity = '0';
        setTimeout(() => panel.remove(), 200);
    }
})();
