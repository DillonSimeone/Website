const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetMode = (process.argv[2] || 'all').toLowerCase();
const targetUrl = process.argv[3] || 'http://localhost:5173/';
const reportsDir = path.join(__dirname, 'reports');

if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

// Terminal color helpers
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function scoreColor(score) {
    if (score >= 90) return `${colors.green}${colors.bold}${score}${colors.reset}`;
    if (score >= 50) return `${colors.yellow}${colors.bold}${score}${colors.reset}`;
    return `${colors.red}${colors.bold}${score}${colors.reset}`;
}

async function verifyServer(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

function runAudit(mode, url) {
    console.log(`\n${colors.cyan}${colors.bold}====================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}  Running Lighthouse Audit: ${mode.toUpperCase()} MODE${colors.reset}`);
    console.log(`${colors.dim}  Target: ${url}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}====================================================${colors.reset}\n`);

    const jsonPath = path.join(reportsDir, `${mode}.json`);
    const htmlPath = path.join(reportsDir, `${mode}.html`);

    const outputBase = path.join(reportsDir, mode);

    let flags = [
        `"${url}"`,
        '--chrome-flags="--headless"',
        '--output=json',
        '--output=html',
        `--output-path="${outputBase}"`,
        '--quiet'
    ];

    if (mode === 'desktop') {
        flags.push('--preset=desktop');
    }

    const cmd = `npx --yes lighthouse ${flags.join(' ')}`;

    try {
        execSync(cmd, { stdio: 'inherit', cwd: __dirname });
    } catch (err) {
        console.error(`${colors.red}Audit execution failed.${colors.reset}`, err.message);
        return null;
    }

    // Lighthouse generates: <output-path>.report.json and <output-path>.report.html
    let parsedJsonPath = `${outputBase}.report.json`;
    if (!fs.existsSync(parsedJsonPath)) {
        parsedJsonPath = `${outputBase}.json`;
    }

    if (!fs.existsSync(parsedJsonPath)) {
        console.error(`${colors.red}Report JSON not found at ${parsedJsonPath}${colors.reset}`);
        return null;
    }

    const data = JSON.parse(fs.readFileSync(parsedJsonPath, 'utf8'));
    printDashboard(mode, data);

    const generatedHtml = path.join(reportsDir, `${mode}.report.html`);
    if (fs.existsSync(generatedHtml)) {
        console.log(`${colors.dim}HTML Report saved to:${colors.reset} ${generatedHtml}\n`);
    }

    return data;
}

function printDashboard(mode, data) {
    console.log(`\n${colors.bold}┌───────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.bold}│        LIGHTHOUSE ${mode.toUpperCase().padEnd(8)} AUDIT RESULTS        │${colors.reset}`);
    console.log(`${colors.bold}├──────────────────────────────┬────────────────┤${colors.reset}`);
    console.log(`${colors.bold}│ Category                     │ Score          │${colors.reset}`);
    console.log(`${colors.bold}├──────────────────────────────┼────────────────┤${colors.reset}`);

    const cats = data.categories || {};
    const catKeys = ['performance', 'accessibility', 'best-practices', 'seo'];
    for (const key of catKeys) {
        const cat = cats[key];
        if (cat) {
            const score = Math.round(cat.score * 100);
            const title = cat.title.padEnd(28);
            const coloredScore = scoreColor(score).padStart(23);
            console.log(`│ ${title} │ ${coloredScore}    │`);
        }
    }
    console.log(`${colors.bold}└──────────────────────────────┴────────────────┘${colors.reset}`);

    // Core Web Vitals
    const audits = data.audits || {};
    console.log(`\n${colors.bold}Core Web Vitals & Metrics:${colors.reset}`);
    const metrics = [
        { label: 'First Contentful Paint (FCP)', key: 'first-contentful-paint' },
        { label: 'Largest Contentful Paint (LCP)', key: 'largest-contentful-paint' },
        { label: 'Total Blocking Time (TBT)', key: 'total-blocking-time' },
        { label: 'Cumulative Layout Shift (CLS)', key: 'cumulative-layout-shift' },
        { label: 'Speed Index', key: 'speed-index' }
    ];

    for (const m of metrics) {
        const item = audits[m.key];
        if (item) {
            const val = item.displayValue || (item.numericValue ? `${Math.round(item.numericValue)} ms` : 'N/A');
            const score = item.score !== null ? Math.round(item.score * 100) : 100;
            console.log(`  • ${m.label.padEnd(35)}: ${val.padEnd(12)} (Score: ${scoreColor(score)})`);
        }
    }

    // Top Opportunities / Diagnostics
    console.log(`\n${colors.bold}Key Diagnostics & Opportunities:${colors.reset}`);
    const oppKeys = [
        'unused-javascript',
        'unused-css-rules',
        'total-byte-weight',
        'render-blocking-resources',
        'uses-responsive-images',
        'uses-optimized-images'
    ];

    let foundOpp = false;
    for (const key of oppKeys) {
        const item = audits[key];
        if (item && item.score !== null && item.score < 0.9) {
            foundOpp = true;
            const savings = item.displayValue ? ` - ${item.displayValue}` : '';
            console.log(`  ⚠ ${colors.yellow}${item.title}${colors.reset}${savings}`);
        }
    }

    if (!foundOpp) {
        console.log(`  ${colors.green}✔ No critical performance opportunities detected!${colors.reset}`);
    }
    console.log('');
}

async function main() {
    console.log(`${colors.bold}Checking server status at ${targetUrl}...${colors.reset}`);
    const isRunning = await verifyServer(targetUrl);
    if (!isRunning) {
        console.error(`\n${colors.red}${colors.bold}ERROR: Unable to reach ${targetUrl}${colors.reset}`);
        console.error(`Please ensure your local web server is running (e.g. run ${colors.cyan}npm run dev${colors.reset} in another terminal).\n`);
        process.exit(1);
    }
    console.log(`${colors.green}✔ Local server is active!${colors.reset}`);

    if (targetMode === 'mobile' || targetMode === 'all') {
        runAudit('mobile', targetUrl);
    }
    if (targetMode === 'desktop' || targetMode === 'all') {
        runAudit('desktop', targetUrl);
    }
}

main();
