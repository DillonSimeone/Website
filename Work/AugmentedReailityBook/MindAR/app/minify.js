const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');
const Terser = require('terser');
const CleanCSS = require('clean-css');

const inputDir = '.';
const outputDir = './dist';

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
    } else {
        // Copy other files (assets)
        fs.copyFileSync(filePath, destPath);
        // console.log(`Copied Asset: ${relativePath}`);
    }
}

async function processDir(currentDir, relativeDir = '') {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
        if (file === 'node_modules' || file === 'dist' || file === '.git' || file === 'package.json' || file === 'package-lock.json' || file === 'minify.js') {
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
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    await processDir(inputDir);
    console.log('Minification complete!');
}

run();
