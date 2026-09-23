import { defineConfig } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import { resolve, relative } from 'path';
import fs from 'fs';

const VIDEO_PLATFORM_DIR = resolve(__dirname, 'public/Projects/VideoRecordingPlatform');
const ZIP_SKIP_DIRS = new Set(['node_modules', '.gradle', '__pycache__', '.git', 'raw']);
const ZIP_SKIP_EXT = new Set(['.webm', '.mp4', '.mkv', '.mov', '.m4v', '.avi']);

function listVideoPlatformFiles(dir = VIDEO_PLATFORM_DIR, base = VIDEO_PLATFORM_DIR) {
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ZIP_SKIP_DIRS.has(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listVideoPlatformFiles(full, base));
        } else if (entry.isFile()) {
            const relPath = relative(base, full).split('\\').join('/');
            if (relPath === 'file-manifest.json') continue;
            if (relPath.endsWith('/scorecard.json') || relPath === 'scorecard.json') continue;
            const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase();
            if (ZIP_SKIP_EXT.has(ext)) continue;
            files.push({ path: relPath, size: fs.statSync(full).size });
        }
    }
    return files;
}

function videoPlatformManifestPlugin() {
    const sendManifest = (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/Projects/VideoRecordingPlatform/file-manifest.json') return next();
        try {
            const manifestPath = resolve(VIDEO_PLATFORM_DIR, 'file-manifest.json');
            if (!fs.existsSync(manifestPath)) {
                fs.writeFileSync(manifestPath, JSON.stringify({ files: listVideoPlatformFiles() }));
            }
            const body = fs.readFileSync(manifestPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(body);
        } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ files: [], error: error.message }));
        }
    };

    return {
        name: 'video-platform-manifest',
        configureServer(server) {
            server.middlewares.use(sendManifest);
        },
        closeBundle() {
            const distDir = resolve(__dirname, 'dist/Projects/VideoRecordingPlatform');
            if (!fs.existsSync(distDir)) return;
            fs.writeFileSync(
                resolve(distDir, 'file-manifest.json'),
                JSON.stringify({ files: listVideoPlatformFiles() })
            );
        }
    };
}

// Helper to read all html files in a directory and return their contents
function getCards(category, reverse = false) {
    const dir = resolve(__dirname, `src/content/${category}`);
    if (!fs.existsSync(dir)) return [];
    
    let files = fs.readdirSync(dir)
        .filter(file => file.endsWith('.html'))
        .sort(); // Ensure consistent order
        
    if (reverse) files.reverse();
    
    return files.map(file => fs.readFileSync(resolve(dir, file), 'utf-8'));
}

export default defineConfig({
    root: 'src',
    publicDir: resolve(__dirname, 'public'),
    base: '/',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.log'],
            },
            format: {
                comments: false,
            },
        },
    },
    plugins: [
        videoPlatformManifestPlugin(),
        handlebars({
            partialDirectory: resolve(__dirname, 'src/partials'),
            context() {
                return {
                    laserCards: getCards('laser'),
                    printingCards: getCards('3dprinting'),
                    workCards: getCards('work'),
                    miniProjectCards: getCards('mini-projects'),
                    esp32Cards: getCards('esp32'),
                    shopCards: getCards('shop', true),
                };
            },
        }),


        ViteMinifyPlugin({
            collapseWhitespace: true,
            removeComments: true,
            minifyJS: true,
            minifyCSS: true,
            removeAttributeQuotes: false,
            removeEmptyAttributes: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
        }),
        viteSingleFile(),
        {
            name: 'cleanup-dist',
            closeBundle() {
                const distPath = resolve(__dirname, 'dist');
                const foldersToRemove = [
                    '**/venv',
                    '**/.venv',
                    '**/.pio',
                    '**/node_modules',
                    '**/dist'
                ];
                
                // Helper to recursively find and delete folders
                const deleteFolders = (dir) => {
                    if (!fs.existsSync(dir)) return;
                    const items = fs.readdirSync(dir);
                    for (const item of items) {
                        const fullPath = resolve(dir, item);
                        if (fs.lstatSync(fullPath).isDirectory()) {
                            if (foldersToRemove.some(pattern => {
                                const folderName = item;
                                return pattern === folderName || (pattern.startsWith('**/') && pattern.endsWith(folderName));
                            })) {
                                console.log(`Removing unwanted folder from dist: ${fullPath}`);
                                fs.rmSync(fullPath, { recursive: true, force: true });
                            } else {
                                deleteFolders(fullPath);
                            }
                        }
                    }
                };
                deleteFolders(distPath);
            }
        }
    ],
});
