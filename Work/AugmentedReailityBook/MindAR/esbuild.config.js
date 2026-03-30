const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['app/javascript/app.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: 'dist/javascript/app.min.js',
  loader: { '.png': 'dataurl', '.glb': 'file' },
  alias: {
    'three': './app/javascript/three.module.js',
    'three/addons/loaders/GLTFLoader.js': './app/javascript/loaders/GLTFLoader.js',
    'three/addons/loaders/DRACOLoader.js': './app/javascript/loaders/DRACOLoader.js',
    'three/addons/renderers/CSS3DRenderer.js': './app/javascript/renderers/CSS3DRenderer.js'
  },
  external: ['mind-ar-image-three'],
}).catch(() => process.exit(1));

console.log('⚡ esbuild: app.js bundled to dist/javascript/app.min.js');
