const fs = require('fs');
const path = require('path');

// Helper to find all directories with platformio.ini (excluding .pio and node_modules)
function findPlatformIOProjects(dir, projects = []) {
    const files = fs.readdirSync(dir);
    if (files.includes('platformio.ini')) {
        projects.push(dir);
        return projects;
    }
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === '.pio' || file === 'node_modules' || file === '.git' || file === '_tooling') {
                continue;
            }
            findPlatformIOProjects(fullPath, projects);
        }
    }
    return projects;
}

// Simple parser for platformio.ini
function parsePlatformIOIni(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const data = {
        board: 'Unknown',
        platform: 'Unknown',
        framework: 'arduino',
        lib_deps: []
    };
    
    let inLibDeps = false;
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith(';')) {
            continue;
        }
        if (line.startsWith('[') && line.endsWith(']')) {
            inLibDeps = false;
            continue;
        }
        if (line.startsWith('board')) {
            data.board = line.split('=')[1].trim();
            inLibDeps = false;
        } else if (line.startsWith('platform')) {
            data.platform = line.split('=')[1].trim();
            inLibDeps = false;
        } else if (line.startsWith('framework')) {
            data.framework = line.split('=')[1].trim();
            inLibDeps = false;
        } else if (line.startsWith('lib_deps')) {
            inLibDeps = true;
            const parts = line.split('=');
            if (parts[1] && parts[1].trim()) {
                data.lib_deps.push(parts[1].trim());
            }
        } else if (inLibDeps) {
            data.lib_deps.push(line);
        }
    }
    return data;
}

// Simple parser for main.cpp to extract pin definitions and comments
function parseMainCpp(projectDir) {
    const srcDir = path.join(projectDir, 'src');
    if (!fs.existsSync(srcDir)) return null;
    
    const files = fs.readdirSync(srcDir);
    const mainFile = files.find(f => f.endsWith('.cpp') || f.endsWith('.ino'));
    if (!mainFile) return null;
    
    const filePath = path.join(srcDir, mainFile);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    
    const pins = [];
    let topComment = '';
    let readingComment = true;
    
    for (let line of lines) {
        const trimmed = line.trim();
        // Extract top-level comments for project description
        if (readingComment) {
            if (trimmed.startsWith('//')) {
                topComment += trimmed.replace(/^\/\/+\s*/, '') + ' ';
            } else if (trimmed.startsWith('/*')) {
                // simple block comment read
                let cleanLine = trimmed.replace(/^\/\*+\s*/, '').replace(/\*+\/$/, '');
                topComment += cleanLine + ' ';
            } else if (trimmed === '' && topComment) {
                // Done reading initial comment block
                readingComment = false;
            } else if (trimmed !== '') {
                readingComment = false;
            }
        }
        
        // Extract pin definitions: #define PIN_NAME value
        const pinMatch = trimmed.match(/^#define\s+([A-Za-z0-9_]+(?:PIN|SDA|SCL|INT|RX|TX|PWM|DATA|MISO|MOSI|SCK|LED|BUTTON|MOTOR)[A-Za-z0-9_]*)\s+([A-Za-z0-9_]+)/i);
        if (pinMatch) {
            pins.push({ name: pinMatch[1], pin: pinMatch[2] });
        }
    }
    
    return {
        topComment: topComment.trim(),
        pins
    };
}

function generateReadme(projectDir) {
    const iniPath = path.join(projectDir, 'platformio.ini');
    const readmePath = path.join(projectDir, 'README.md');
    
    // Skip if README already exists
    if (fs.existsSync(readmePath)) {
        console.log(`[SKIP] README.md already exists for ${path.basename(projectDir)}`);
        return;
    }
    
    console.log(`[GEN] Generating README.md for ${path.basename(projectDir)}`);
    
    const iniData = parsePlatformIOIni(iniPath);
    const cppData = parseMainCpp(projectDir);
    
    const projectName = path.basename(projectDir);
    let description = cppData && cppData.topComment ? cppData.topComment : `A microcontroller project built using PlatformIO.`;
    
    let content = `# ${projectName}\n\n`;
    content += `${description}\n\n`;
    
    content += `## 🛠️ Project Specifications\n\n`;
    content += `- **Board:** \`${iniData.board}\`\n`;
    content += `- **Platform:** \`${iniData.platform}\`\n`;
    content += `- **Framework:** \`${iniData.framework}\`\n`;
    
    if (iniData.lib_deps.length > 0) {
        content += `- **Dependencies:**\n`;
        iniData.lib_deps.forEach(dep => {
            content += `  - \`${dep}\`\n`;
        });
    }
    content += `\n`;
    
    if (cppData && cppData.pins.length > 0) {
        content += `## 🔌 Pin Configuration\n\n`;
        content += `| Signal Name | GPIO Pin |\n`;
        content += `| :--- | :--- |\n`;
        cppData.pins.forEach(pin => {
            content += `| \`${pin.name}\` | \`${pin.pin}\` |\n`;
        });
        content += `\n`;
    }
    
    content += `## 🚀 Build & Upload Instructions\n\n`;
    content += `This project is configured for **PlatformIO**.\n\n`;
    content += `1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.\n`;
    content += `2. Open this directory in VS Code.\n`;
    content += `3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.\n`;
    if (fs.existsSync(path.join(projectDir, 'upload.bat'))) {
        content += `4. Alternatively, run the local \`upload.bat\` script to build, upload, and launch the serial monitor automatically.\n`;
    }
    
    fs.writeFileSync(readmePath, content, 'utf8');
}

function main() {
    const targetDir = path.resolve(__dirname, '..');
    console.log(`Scanning for PlatformIO projects in: ${targetDir}`);
    const projects = findPlatformIOProjects(targetDir);
    console.log(`Found ${projects.length} PlatformIO projects.`);
    for (const project of projects) {
        generateReadme(project);
    }
    console.log('Finished generating READMEs!');
}

main();
