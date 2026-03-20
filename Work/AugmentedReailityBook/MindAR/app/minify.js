const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');
const Terser = require('terser');
const CleanCSS = require('clean-css');

const inputDir = '.';
const outputDir = './dist';

// Parse CLI arguments
const args = process.argv.slice(2);
let targetHtml = null;
args.forEach((arg, index) => {
    if (arg === '--target' && args[index + 1]) {
        targetHtml = args[index + 1];
    }
});

// Options for minification
const htmlOptions = {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,
    minifyCSS: true,
    removeAttributeQuotes: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    removeOptionalTags: true
};

const cleanCSS = new CleanCSS({ level: 2 });

async function minifyFile(filePath, relativePath) {
    const ext = path.extname(filePath).toLowerCase();
    const destPath = path.join(outputDir, relativePath);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    if (ext === '.html' || ext === '.htm') {
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const minified = await minify(content, htmlOptions);
            fs.writeFileSync(destPath, minified);
            console.log(`Minified HTML: ${relativePath}`);
            
            // If this is our target HTML, also save it as index.html
            if (targetHtml && relativePath.toLowerCase() === targetHtml.toLowerCase()) {
                fs.writeFileSync(path.join(outputDir, 'index.html'), minified);
                console.log(`[PROD] Set ${relativePath} as index.html`);
            }
        } catch (err) {
            console.error(`Error minifying HTML ${relativePath}:`, err);
            fs.copyFileSync(filePath, destPath);
        }
    } else if (ext === '.js') {
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const result = await Terser.minify(content);
            if (result.error) throw result.error;
            fs.writeFileSync(destPath, result.code);
            console.log(`Minified JS: ${relativePath}`);
        } catch (err) {
            console.error(`Error minifying JS ${relativePath}:`, err);
            fs.copyFileSync(filePath, destPath);
        }
    } else if (ext === '.css') {
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const result = cleanCSS.minify(content);
            if (result.errors.length > 0) throw result.errors;
            fs.writeFileSync(destPath, result.styles);
            console.log(`Minified CSS: ${relativePath}`);
        } catch (err) {
            console.error(`Error minifying CSS ${relativePath}:`, err);
            fs.copyFileSync(filePath, destPath);
        }
    } else if (relativePath === 'pages.json') {
        // Special logic for production-ready pages.json paths
        console.log(`Optimizing paths in pages.json for production...`);
        const content = fs.readFileSync(filePath, 'utf-8');
        try {
            const data = JSON.parse(content);
            
            // Helper to clean paths (remove ../../ and point to production folder)
            const cleanPath = (p, isModel = false) => {
                if (!p) return p;
                // Get just the filename (e.g. shrek.png)
                const filename = path.basename(p);
                
                if (isModel) {
                    // Models go into assets/3dModel
                    return 'assets/3dModel/' + filename;
                } else {
                    // Images go into the root folder (matches pages.json structure)
                    return filename;
                }
            };

            if (data.pages) {
                data.pages.forEach(page => {
                    page.trackingImage = cleanPath(page.trackingImage);
                    if (page.model && page.model.src) {
                        page.model.src = cleanPath(page.model.src, true);
                    }
                });
            }
            
            // Also update the meta descriptor path
            if (data.meta && data.meta.trackingDescriptor) {
                data.meta.trackingDescriptor = 'assets/targets/' + path.basename(data.meta.trackingDescriptor);
            }

            fs.writeFileSync(destPath, JSON.stringify(data, null, 2));
            console.log(`Optimized pages.json: ${relativePath}`);
        } catch (err) {
            console.error(`Error processing pages.json:`, err);
            fs.copyFileSync(filePath, destPath);
        }
    } else {
        // Copy other files (assets)
        fs.copyFileSync(filePath, destPath);
    }
}

async function processDir(currentDir, relativeDir = '') {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
        if (file === 'node_modules' || file === 'dist' || file === '.git' || file === 'package.json' || file === 'package-lock.json' || file === 'minify.js' || file === 'v3_dist' || file === 'assets') {
            continue;
        }

        const filePath = path.join(currentDir, file);
        const relPath = path.join(relativeDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            await processDir(filePath, relPath);
        } else {
            await minifyFile(filePath, relPath);
        }
    }
}

async function run() {
    console.log(`Starting minification project: ${inputDir} -> ${outputDir}`);
    if (targetHtml) {
        console.log(`[PROD] Mode: Mapping ${targetHtml} as primary entry point.`);
    }
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    } else {
        // Clean output dir first to avoid stale files
        fs.rmSync(outputDir, { recursive: true, force: true });
        fs.mkdirSync(outputDir);
    }

    await processDir(inputDir);
    console.log('Minification complete!');
}

run();
