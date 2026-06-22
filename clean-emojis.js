const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const EM_DASH_LOG_PATH = path.join(ROOT_DIR, 'em-dash.log');

// Regex for emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;
const EM_DASH_REGEX = /—|&mdash;/g;

// Exclude these directory patterns
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.vscode', 'dist', '.claude']);

let emDashLogs = [];
let modifiedCount = 0;

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (EXCLUDED_DIRS.has(file)) continue;

    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');

      // Decide if we should process this file
      let shouldProcess = false;

      // 1. Files in src/ (except core index.html and style.css)
      if (relPath.startsWith('src/')) {
        if (relPath !== 'src/index.html' && relPath !== 'src/styles/style.css') {
          shouldProcess = ['.html', '.js', '.css', '.md'].includes(ext);
        }
      }
      // 2. Only markdown files (.md) in public/ (like AGENTS.md, README.md, etc.)
      else if (relPath.startsWith('public/')) {
        shouldProcess = (ext === '.md');
      }
      // 3. Root files (except the script itself)
      else if (!relPath.includes('/')) {
        if (file !== 'clean-emojis.js') {
          shouldProcess = ['.html', '.js', '.css', '.md'].includes(ext);
        }
      }

      if (shouldProcess) {
        callback(filePath);
      }
    }
  }
}

console.log('Scanning files...');

walkDir(ROOT_DIR, (filePath) => {
  const relativePath = path.relative(ROOT_DIR, filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  let hasEmojis = false;
  let hasEmDashes = false;

  // Check for em dashes
  if (EM_DASH_REGEX.test(content)) {
    hasEmDashes = true;
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (EM_DASH_REGEX.test(line)) {
        emDashLogs.push(`File: ${relativePath}:${index + 1}\nLine: ${line.trim()}\n`);
      }
    });
  }

  // Find emojis
  const emojisFound = content.match(EMOJI_REGEX);
  if (emojisFound) {
    hasEmojis = true;
    console.log(`Found emojis in ${relativePath}: ${Array.from(new Set(emojisFound)).join(', ')}`);
    
    // Remove emojis
    let newContent = content.replace(EMOJI_REGEX, '');
    
    // Clean up double spaces that might be left over from removing emojis (e.g., "word 🚀 word" -> "word  word" -> "word word")
    newContent = newContent.replace(/ {2,}/g, ' ');

    fs.writeFileSync(filePath, newContent, 'utf8');
    modifiedCount++;
  }
});

// Write em dash logs to root
fs.writeFileSync(EM_DASH_LOG_PATH, emDashLogs.join('\n'), 'utf8');
console.log(`\nScan complete.`);
console.log(`Modified ${modifiedCount} files to remove emojis.`);
console.log(`Log of em dashes written to: ${EM_DASH_LOG_PATH}`);
