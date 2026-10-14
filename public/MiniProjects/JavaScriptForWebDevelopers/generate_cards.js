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

    // Match <h1>...</h1> if no title
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

    // Match subtitle or description paragraphs
    if (!description) {
        const subMatch = content.match(/<p[^>]*class=["'][^"']*(?:subtitle|description|lead)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
        if (subMatch) {
            description = subMatch[1].replace(/<[^>]+>/g, '').trim();
        }
    }

    // Match header paragraph inside <header>
    if (!description) {
        const headerPMatch = content.match(/<header[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/header>/i);
        if (headerPMatch) {
            description = headerPMatch[1].replace(/<[^>]+>/g, '').trim();
        }
    }

    // Fallback: match any reasonable <p>...</p> with substance
    if (!description) {
        const pMatches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        for (const m of pMatches) {
            const text = m[1].replace(/<[^>]+>/g, '').trim();
            if (text.length > 20 && !/^(tip amount|total cost|none yet)/i.test(text)) {
                description = text;
                break;
            }
        }
    }

    if (description) {
        description = description.replace(/\s+/g, ' ').trim();
    }

    return { title, description };
}

function deriveBadge(relDir) {
    if (/CIS133W/i.test(relDir)) {
        if (/Lab\s*(\d+)/i.test(relDir)) {
            const m = relDir.match(/Lab\s*(\d+)/i);
            return `CIS 133W • Lab ${m[1]}`;
        }
        if (/Practice\s*([\d-]+)/i.test(relDir)) {
            const m = relDir.match(/Practice\s*([\d-]+)/i);
            return `CIS 133W • Practice ${m[1]}`;
        }
        if (/Module\s*(\d+)/i.test(relDir)) {
            const m = relDir.match(/Module\s*(\d+)/i);
            return `CIS 133W • Module ${m[1]}`;
        }
        return 'CIS 133W';
    }

    const firstSegment = relDir.split('/')[0];
    return firstSegment || 'Demo';
}

function scanProjects() {
    const projects = [];

    function walk(currentDir) {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const item of items) {
            if (!item.isDirectory()) continue;
            const dirName = item.name;
            if (dirName.startsWith('.') || dirName === 'node_modules' || dirName === '__MACOSX') continue;

            const dirPath = path.join(currentDir, dirName);
            const hasIndexHtml = fs.existsSync(path.join(dirPath, 'index.html'));

            if (hasIndexHtml) {
                // Leaf project directory: do not descend deeper
                const relDir = path.relative(baseDir, dirPath).replace(/\\/g, '/');
                const readmeInfo = extractInfoFromReadme(dirPath);
                const htmlInfo = extractInfoFromHtml(dirPath);

                let title = (readmeInfo && readmeInfo.title) || (htmlInfo && htmlInfo.title) || dirName;
                let description = (readmeInfo && readmeInfo.description) || (htmlInfo && htmlInfo.description);

                if (!description) {
                    if (/tip_calculator/i.test(dirName)) {
                        description = 'Interactive restaurant bill and tip calculator with customizable tip percentages.';
                    } else if (/Practice 3-1/i.test(dirName)) {
                        description = 'Real-time integer statistics calculator analyzing numbers for sum, average, min, and max.';
                    } else {
                        description = 'Interactive JavaScript mini-project and DOM challenge.';
                    }
                }

                const badge = deriveBadge(relDir);

                projects.push({
                    relDir,
                    dirName,
                    badge,
                    title,
                    description,
                    link: `./${relDir}/index.html`
                });
            } else {
                // Intermediate category folder (e.g. CIS133W, Module1): descend into children
                walk(dirPath);
            }
        }
    }

    walk(baseDir);

    // Sort order: prioritize Labs, then numeric/alphabetical by relative directory
    projects.sort((a, b) => {
        const aIsLab = /Lab/i.test(a.relDir);
        const bIsLab = /Lab/i.test(b.relDir);
        if (aIsLab && !bIsLab) return -1;
        if (!aIsLab && bIsLab) return 1;
        return a.relDir.localeCompare(b.relDir, undefined, { numeric: true, sensitivity: 'base' });
    });

    return projects;
}

function generateHtml(projects) {
    const cardsHtml = projects.map(p => `        <!-- Card: ${escapeHtml(p.title)} -->
        <div class="card">
            <div class="card-content">
                <span class="card-badge">${escapeHtml(p.badge)}</span>
                <h2 class="card-title">${escapeHtml(p.title)}</h2>
                <p class="card-description">${escapeHtml(p.description)}</p>
            </div>
            <div class="card-footer">
                <a href="${encodeURI(p.link)}" class="card-btn">
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
        <a href="../../index.html" class="back-link">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/>
            </svg>
            Back to Portfolio
        </a>
        <br>
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
projects.forEach(p => console.log(` - [${p.badge}] "${p.title}" (${p.link})`));

const output = generateHtml(projects);
fs.writeFileSync(indexHtmlPath, output, 'utf-8');
console.log(`\nSuccessfully updated index.html!`);
