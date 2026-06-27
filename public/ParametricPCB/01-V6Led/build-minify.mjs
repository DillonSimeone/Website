import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectDir = __dirname;
const tempJsPath = path.join(projectDir, 'temp_bundled.js');
const tempCssPath = path.join(projectDir, 'temp_minified.css');
const outputHtmlPath = path.join(projectDir, 'minified.html');

console.log('--- Starting Minification & Bundling Build ---');

try {
  // 1. Bundle and minify JS using esbuild (stripping all comments, including licenses)
  console.log('Bundling & minifying Javascript...');
  const mainJsPath = path.join(projectDir, 'src', 'main.js');
  execSync(`npx esbuild "${mainJsPath}" --bundle --minify --format=esm --target=es2020 --legal-comments=none --external:node:module --outfile="${tempJsPath}"`, { stdio: 'inherit' });

  // 2. Minify CSS using esbuild
  console.log('Minifying CSS...');
  const cssPath = path.join(projectDir, 'style.css');
  execSync(`npx esbuild "${cssPath}" --minify --outfile="${tempCssPath}"`, { stdio: 'inherit' });

  // 3. Read HTML template and minify it (remove comments and collapse to a single line)
  console.log('Reading and minifying HTML template...');
  const htmlTemplatePath = path.join(projectDir, 'index.html');
  let htmlContent = fs.readFileSync(htmlTemplatePath, 'utf8');
  
  // Strip HTML comments
  htmlContent = htmlContent.replace(/<!--[\s\S]*?-->/g, '');
  // Collapse newlines and whitespace
  htmlContent = htmlContent.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

  // 4. Read bundled files (making sure they are single-line as well)
  const bundledJsContent = fs.readFileSync(tempJsPath, 'utf8').trim();
  const minifiedCssContent = fs.readFileSync(tempCssPath, 'utf8').trim();

  // 5. Inline CSS and JS using callback functions to prevent regex $ pattern interpretation
  console.log('Inlining assets into HTML...');
  
  // Replace style.css link tag (using callback)
  const cssRegex = /<link\s+rel="stylesheet"\s+href="\.\/style\.css">/i;
  htmlContent = htmlContent.replace(cssRegex, () => `<style>${minifiedCssContent}</style>`);

  // Replace main.js module script tag (using callback)
  const jsRegex = /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/i;
  htmlContent = htmlContent.replace(jsRegex, () => `<script type="module">${bundledJsContent}</script>`);

  // 6. Write final minified HTML
  fs.writeFileSync(outputHtmlPath, htmlContent, 'utf8');
  console.log(`Successfully generated single-file minified HTML: ${outputHtmlPath}`);

} catch (error) {
  console.error('Build failed:', error.message);
} finally {
  // 7. Cleanup temp files
  console.log('Cleaning up temporary files...');
  if (fs.existsSync(tempJsPath)) fs.unlinkSync(tempJsPath);
  if (fs.existsSync(tempCssPath)) fs.unlinkSync(tempCssPath);
}

console.log('--- Build Process Complete ---');
