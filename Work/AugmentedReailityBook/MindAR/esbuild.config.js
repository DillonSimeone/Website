const esbuild = require('esbuild');

// Build Config for JavaScript
esbuild.build({
  entryPoints: ['app/javascript/app.js'],
  bundle: true,
  minify: true,
  sourcemap: (process.env.ELEVENTY_ENV || "").trim() !== 'production',
  outfile: 'dist/javascript/app.min.js',
  loader: { '.webp': 'dataurl', '.glb': 'file' },
  external: ['mind-ar-image-three', 'three', 'three/addons/*'],
  format: 'esm',
}).then(() => {
  console.log('⚡ esbuild: app.js bundled to dist/javascript/app.min.js');
}).catch(() => process.exit(1));

// Build Config for CSS
esbuild.build({
  entryPoints: ['app/style/styles.css'],
  bundle: true,
  minify: true,
  outfile: 'dist/style/styles.min.css',
}).then(() => {
  console.log('⚡ esbuild: styles.css minified to dist/style/styles.min.css');
}).catch(() => process.exit(1));

