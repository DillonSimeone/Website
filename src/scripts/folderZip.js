import { buildStoredZipParts, crc32 } from './zipStore.mjs';

const POOL = 4;

function fileUrl(root, relPath) {
    if (relPath.startsWith('/') || relPath.includes('\\') || relPath.split('/').includes('..')) {
        throw new Error('Refusing a file path that leaves the folder');
    }
    return root + relPath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let cursor = 0;

    async function worker() {
        while (cursor < items.length) {
            const index = cursor++;
            out[index] = await fn(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return out;
}

function formatMb(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function packFolder(root, onProgress) {
    const manifestUrl = fileUrl(root, 'file-manifest.json');
    const manifestRes = await fetch(manifestUrl, { cache: 'no-store' });
    const manifestText = await manifestRes.text();
    let manifest;
    try {
        manifest = JSON.parse(manifestText);
    } catch {
        throw new Error('The file list came back as a page instead of data. Restart the dev server, then try the download again.');
    }
    if (!manifestRes.ok || !manifest || !Array.isArray(manifest.files)) {
        throw new Error('The file list is missing. Restart the dev server, or rebuild so it can be generated.');
    }
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    if (files.length === 0) throw new Error('That folder has nothing to pack.');

    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    let doneBytes = 0;
    let doneCount = 0;

    const packed = await mapPool(files, POOL, async (file) => {
        const res = await fetch(fileUrl(root, file.path), { cache: 'no-store' });
        if (!res.ok) throw new Error(`Missing ${file.path}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const crc = crc32(data);
        doneBytes += data.length;
        doneCount += 1;
        if (onProgress) onProgress(doneCount, files.length, doneBytes, totalBytes);
        return { name: file.path, data, crc };
    });

    return { packed, totalBytes };
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function initFolderZip() {
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a.zip-folder');
        if (!link) return;
        event.preventDefault();
        if (link.dataset.busy === '1') return;

        const root = link.dataset.zipRoot;
        const filename = link.dataset.zipName || 'project.zip';
        if (!root) return;

        const label = link.dataset.label || link.textContent;
        link.dataset.label = label;
        link.dataset.busy = '1';
        link.setAttribute('aria-busy', 'true');
        link.textContent = 'Reading the folder…';

        const onProgress = (doneCount, totalCount, doneBytes) => {
            link.textContent = `Packing ${doneCount} of ${totalCount} (${formatMb(doneBytes)})…`;
        };

        packFolder(root, onProgress)
            .then(({ packed }) => {
                link.textContent = 'Preparing the download…';
                const parts = buildStoredZipParts(packed);
                saveBlob(new Blob(parts, { type: 'application/zip' }), filename);
                link.textContent = label;
            })
            .catch((error) => {
                console.error(error);
                link.textContent = error.message || 'Could not pack that folder.';
                setTimeout(() => {
                    if (link.dataset.busy !== '1') link.textContent = label;
                }, 5000);
            })
            .finally(() => {
                link.dataset.busy = '0';
                link.removeAttribute('aria-busy');
            });
    });
}
