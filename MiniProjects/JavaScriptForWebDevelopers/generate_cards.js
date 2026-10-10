const fs = require('fs');
const path = require('path');

const baseDir = __dirname;
const indexHtmlPath = path.join(baseDir, 'index.html');

function extractInfoFromReadme(dirPath) {
    const readmePath = path.join(dirPath, 'README.md');
    if (!fs.existsSync(readmePath)) return null;

    const content = fs.readFileSync(readmePath, 'utf-8');
    const lines = content.split(/\r?\n/).map(l => l.trim());

    let title = null;
    let descriptionLines = [];

    for (const line of lines) {
        if (!title && line.startsWith('#')) {
            title = line.replace(/^#+\s*/, '').trim();
            continue;
        }
        if (line) {
            descriptionLines.push(line);
        }
    }

    return {
        title: title || null,
        description: descriptionLines.join(' ').trim() || null
    };
}

function extractInfoFromHtml(dirPath) {
    const htmlPath = path.join(dirPath, 'index.html');
    if (!fs.existsSync(htmlPath)) return null;

    const content = fs.readFileSync(htmlPath, 'utf-8');
    let title = null;
    let description = null;

    // Match <title>...</title>
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
    }

    // Match <h1>...</h1>
    if (!title) {
        const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (h1Match) {
            title = h1Match[1].trim();
        }
    }

    // Match <meta name="description" content="...">
    const metaDescMatch = content.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (metaDescMatch) {
        description = metaDescMatch[1].trim();
    }

    // Match first <p>...</p> if no meta description
    if (!description) {
        const pMatch = content.match(/<p[^>]*>([^<]+)<\/p>/i);
        if (pMatch) {
            description = pMatch[1].trim();
        }
    }

    return { title, description };
}

function scanProjects() {
    const items = fs.readdirSync(baseDir, { withFileTypes: true });
    const projects = [];

    for (const item of items) {
        if (!item.isDirectory()) continue;
        const dirName = item.name;
        if (dirName.startsWith('.') || dirName === 'node_modules') continue;

        const dirPath = path.join(baseDir, dirName);
        const hasIndexHtml = fs.existsSync(path.join(dirPath, 'index.html'));

        if (!hasIndexHtml) continue;

        const readmeInfo = extractInfoFromReadme(dirPath);
        const htmlInfo = extractInfoFromHtml(dirPath);

        const title = (readmeInfo && readmeInfo.title) || (htmlInfo && htmlInfo.title) || dirName;
        const description = (readmeInfo && readmeInfo.description) || (htmlInfo && htmlInfo.description) || 'Explore this project interactive demo.';

        projects.push({
            dirName,
            title,
            description,
            link: `./${dirName}/index.html`
        });
    }

    return projects;
}

function generateHtml(projects) {
    const cardsHtml = projects.map(p => `        <!-- Card: ${escapeHtml(p.title)} -->
        <div class="card">
            <div class="card-content">
                <h2 class="card-title">${escapeHtml(p.title)}</h2>
                <p class="card-description">${escapeHtml(p.description)}</p>
            </div>
            <div class="card-footer">
                <a href="${escapeHtml(p.link)}" class="card-btn">
                    Launch Project
                    <svg viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                </a>
            </div>
        </div>`).join('\n\n');

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JavaScript For Web Developers</title>
    <link rel="stylesheet" href="style.css">
</head>

<body>
    <header>
        <span class="badge">Interactive Demos</span>
        <h1>JavaScript For Web Developers</h1>
        <p class="subtitle">A collection of hands-on interactive mini-projects, challenges, and experiments.</p>
    </header>

    <main class="card-grid">
${cardsHtml}
    </main>
</body>

</html>
`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const projects = scanProjects();
console.log(`Found ${projects.length} project(s):`);
projects.forEach(p => console.log(` - [${p.dirName}] "${p.title}"`));

const output = generateHtml(projects);
fs.writeFileSync(indexHtmlPath, output, 'utf-8');
console.log(`\nSuccessfully updated index.html!`);
