import { defineConfig } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import { resolve } from 'path';
import fs from 'fs';

// Helper to read all html files in a directory and return their contents
function getCards(category) {
    const dir = resolve(__dirname, `src/content/${category}`);
    if (!fs.existsSync(dir)) return [];
    
    return fs.readdirSync(dir)
        .filter(file => file.endsWith('.html'))
        .sort() // Ensure consistent order
        .map(file => fs.readFileSync(resolve(dir, file), 'utf-8'));
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
        handlebars({
            partialDirectory: resolve(__dirname, 'src/partials'),
            context: {
                laserCards: getCards('laser'),
                printingCards: getCards('3dprinting'),
                workCards: getCards('work'),
                miniProjectCards: getCards('mini-projects'),
                esp32Cards: getCards('esp32'),
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
