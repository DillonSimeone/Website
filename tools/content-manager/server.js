const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const ROOT_DIR = path.resolve(__dirname, '../../');
const CONTENT_DIR = path.join(ROOT_DIR, 'src/content');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Category templates configuration
const TEMPLATES = {
    laser: 'hobby',
    '3dprinting': 'hobby',
    work: 'work',
    'mini-projects': 'grid',
    esp32: 'grid',
    shop: 'shop'
};

function getTemplateContent(type, title) {
    if (type === 'hobby') {
        return `<div class="artwork">
    <h2>${title}</h2>
    <p>Description goes here...</p>
    <div class="medias">
        <div class="images">
            <img loading="lazy" data-src="./path/to/image.webp" alt="${title}">
        </div>
    </div>
</div>\n`;
    } else if (type === 'grid') {
        return `<div class="grid-item">
    <h2>${title}</h2>
    <p>Summary goes here...</p>
    <ul>
        <li><a href="./path/to/project/index.html">Launch</a></li>
    </ul>
</div>\n`;
    } else if (type === 'shop') {
        return `<div class="grid-item">
    <h2>${title}</h2>
    <p>Product description goes here...</p>
    <div class="medias">
        <div class="images">
            <img loading="lazy" data-src="./path/to/product-image.webp" alt="${title}">
        </div>
    </div>
    <div class="shop-actions" style="margin-top: 20px; text-align: center;">
        <a href="https://buy.stripe.com/..." class="buy-button" target="_blank" style="display: inline-block; padding: 12px 30px; background: var(--neon-cyan); color: #000; text-decoration: none; font-family: 'Orbitron', sans-serif; font-weight: bold; border-radius: 4px; box-shadow: 0 0 15px var(--neon-cyan); transition: all 0.3s;">BUY NOW</a>
    </div>
</div>\n`;
    } else {
        return `<div>
    <h2>${title}</h2>
    <p>Professional description...</p>
    <div class="medias">
        <div class="images">
            <img loading="lazy" data-src="./path/to/image.webp" alt="${title}">
        </div>
    </div>
</div>\n`;
    }
}

// Helper: Parse H2 title from HTML content
function parseTitle(htmlContent) {
    const match = htmlContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    return match ? match[1].trim() : '';
}

// Helper: Read and return JSON body from request
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
    });
}

// Helper: Send JSON response
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Helper: Serve static file
function serveStatic(res, filePath) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        
        let contentType = 'text/html';
        const ext = path.extname(filePath);
        if (ext === '.css') contentType = 'text/css';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.json') contentType = 'application/json';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.svg') contentType = 'image/svg+xml';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
}

const server = http.createServer(async (req, res) => {
    // Enable CORS for development convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    try {
        // --- API ENDPOINTS ---

        // GET /api/categories
        if (req.method === 'GET' && pathname === '/api/categories') {
            const categories = Object.keys(TEMPLATES);
            return sendJson(res, 200, { categories });
        }

        // GET /api/content/:category
        if (req.method === 'GET' && pathname.startsWith('/api/content/')) {
            const category = pathname.substring('/api/content/'.length);
            const targetDir = path.join(CONTENT_DIR, category);

            if (!fs.existsSync(targetDir)) {
                return sendJson(res, 404, { error: 'Category not found' });
            }

            const files = fs.readdirSync(targetDir)
                .filter(file => file.endsWith('.html'))
                .sort();

            const items = files.map(filename => {
                const fullPath = path.join(targetDir, filename);
                const fileContent = fs.readFileSync(fullPath, 'utf8');
                const title = parseTitle(fileContent);
                
                // Parse the filename. Format: XX-slug.html or slug.html
                const match = filename.match(/^(\d+)-(.*)\.html$/);
                let prefix = '';
                let slug = filename.replace(/\.html$/, '');
                if (match) {
                    prefix = match[1];
                    slug = match[2];
                }

                return {
                    filename,
                    prefix,
                    slug,
                    title,
                    rawContent: fileContent
                };
            });

            return sendJson(res, 200, { category, items });
        }

        // POST /api/reorder
        if (req.method === 'POST' && pathname === '/api/reorder') {
            const { category, files } = await readJsonBody(req);
            if (!category || !Array.isArray(files)) {
                return sendJson(res, 400, { error: 'Invalid payload' });
            }

            const targetDir = path.join(CONTENT_DIR, category);
            if (!fs.existsSync(targetDir)) {
                return sendJson(res, 404, { error: 'Category not found' });
            }

            // To avoid collisions when renaming files (e.g. renaming 01-x to 02-x when 02-x exists),
            // we first rename all files to temporary unique names.
            const renames = [];
            const tempNames = [];

            for (let i = 0; i < files.length; i++) {
                const oldName = files[i];
                const oldPath = path.join(targetDir, oldName);
                if (!fs.existsSync(oldPath)) {
                    return sendJson(res, 400, { error: `File not found: ${oldName}` });
                }

                // Strip the old prefix to get the clean slug
                const match = oldName.match(/^\d+-(.*)$/);
                const slug = match ? match[1] : oldName;
                
                const tempName = `temp_${i}_${Date.now()}_${slug}`;
                const tempPath = path.join(targetDir, tempName);

                fs.renameSync(oldPath, tempPath);
                tempNames.push({ tempPath, slug });
            }

            // Now rename from temp names to their final sequenced names
            for (let i = 0; i < tempNames.length; i++) {
                const { tempPath, slug } = tempNames[i];
                const prefix = String(i).padStart(2, '0');
                const newName = `${prefix}-${slug}`;
                const newPath = path.join(targetDir, newName);

                fs.renameSync(tempPath, newPath);
                renames.push({ from: files[i], to: newName });
            }

            return sendJson(res, 200, { success: true, renames });
        }

        // POST /api/create
        if (req.method === 'POST' && pathname === '/api/create') {
            const { category, title } = await readJsonBody(req);
            if (!category || !title) {
                return sendJson(res, 400, { error: 'Category and title are required' });
            }

            const targetDir = path.join(CONTENT_DIR, category);
            if (!fs.existsSync(targetDir)) {
                return sendJson(res, 404, { error: 'Category not found' });
            }

            // Create clean slug
            let slug = title.toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/,/g, '')
                .replace(/\./g, '')
                .replace(/\(/g, '')
                .replace(/\)/g, '')
                .replace(/[^a-z0-9_-]/g, '');

            // Find next prefix index
            const files = fs.readdirSync(targetDir)
                .filter(file => file.endsWith('.html'));
            
            let nextIndex = 0;
            files.forEach(f => {
                const match = f.match(/^(\d+)-/);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    if (idx >= nextIndex) {
                        nextIndex = idx + 1;
                    }
                }
            });

            const prefix = String(nextIndex).padStart(2, '0');
            const filename = `${prefix}-${slug}.html`;
            const newPath = path.join(targetDir, filename);

            const templateType = TEMPLATES[category] || 'hobby';
            const fileContent = getTemplateContent(templateType, title);

            fs.writeFileSync(newPath, fileContent, 'utf8');

            return sendJson(res, 201, { success: true, filename, title });
        }

        // POST /api/delete
        if (req.method === 'POST' && pathname === '/api/delete') {
            const { category, filename } = await readJsonBody(req);
            if (!category || !filename) {
                return sendJson(res, 400, { error: 'Category and filename are required' });
            }

            const filePath = path.join(CONTENT_DIR, category, filename);
            if (!fs.existsSync(filePath)) {
                return sendJson(res, 404, { error: 'File not found' });
            }

            fs.unlinkSync(filePath);

            // Auto-resequence remaining files to close any gaps
            const targetDir = path.join(CONTENT_DIR, category);
            const remainingFiles = fs.readdirSync(targetDir)
                .filter(file => file.endsWith('.html'))
                .sort();

            const tempNames = [];
            for (let i = 0; i < remainingFiles.length; i++) {
                const oldName = remainingFiles[i];
                const oldPath = path.join(targetDir, oldName);
                const match = oldName.match(/^\d+-(.*)$/);
                const slug = match ? match[1] : oldName;
                const tempName = `temp_${i}_${Date.now()}_${slug}`;
                const tempPath = path.join(targetDir, tempName);
                fs.renameSync(oldPath, tempPath);
                tempNames.push({ tempPath, slug });
            }

            for (let i = 0; i < tempNames.length; i++) {
                const { tempPath, slug } = tempNames[i];
                const prefix = String(i).padStart(2, '0');
                const newName = `${prefix}-${slug}`;
                const newPath = path.join(targetDir, newName);
                fs.renameSync(tempPath, newPath);
            }

            return sendJson(res, 200, { success: true });
        }

        // POST /api/rename
        if (req.method === 'POST' && pathname === '/api/rename') {
            const { category, filename, newSlug, newTitle } = await readJsonBody(req);
            if (!category || !filename || !newSlug || !newTitle) {
                return sendJson(res, 400, { error: 'Category, filename, newSlug and newTitle are required' });
            }

            const targetDir = path.join(CONTENT_DIR, category);
            const oldPath = path.join(targetDir, filename);
            if (!fs.existsSync(oldPath)) {
                return sendJson(res, 404, { error: 'File not found' });
            }

            // Get prefix from old file
            const match = filename.match(/^(\d+)-/);
            const prefix = match ? match[1] : '';
            const newFilename = prefix ? `${prefix}-${newSlug}.html` : `${newSlug}.html`;
            const newPath = path.join(targetDir, newFilename);

            // 1. Read existing content and update <h2> title
            let content = fs.readFileSync(oldPath, 'utf8');
            content = content.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/i, `<h2>${newTitle}</h2>`);

            // 2. If it's a rename to a different filename, write to new location and remove old
            if (oldPath !== newPath) {
                fs.writeFileSync(newPath, content, 'utf8');
                fs.unlinkSync(oldPath);
            } else {
                fs.writeFileSync(oldPath, content, 'utf8');
            }

            return sendJson(res, 200, { success: true, filename: newFilename, title: newTitle });
        }

        // --- STATIC FILES SERVING ---
        if (req.method === 'GET') {
            let targetFile = pathname === '/' ? 'index.html' : pathname;
            // Clean up dot dot paths for security
            targetFile = targetFile.replace(/\.\./g, '');
            const filePath = path.join(PUBLIC_DIR, targetFile);
            return serveStatic(res, filePath);
        }

        // Unhandled request
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');

    } catch (err) {
        console.error(err);
        sendJson(res, 500, { error: 'Internal Server Error', details: err.message });
    }
});

server.listen(PORT, () => {
    console.log(`Content Manager Server listening on http://localhost:${PORT}`);
});
