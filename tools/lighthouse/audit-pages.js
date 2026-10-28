const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const baseUrl = process.argv[2] || 'http://localhost:5173';
const reportsDir = path.join(__dirname, 'reports');

if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

// Terminal color helpers
const c = {
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
    if (score === 100) return `${c.green}${c.bold}100${c.reset}`;
    if (score >= 90) return `${c.green}${score}${c.reset}`;
    if (score >= 50) return `${c.yellow}${score}${c.reset}`;
    return `${c.red}${c.bold}${score}${c.reset}`;
}

async function verifyServer(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

// Pages to audit
const targetPages = [
    { name: 'Portfolio: Home (Bio)', url: `${baseUrl}/?page=Home` },
    { name: 'Portfolio: Shop', url: `${baseUrl}/?page=Shop` },
    { name: 'Portfolio: Past Work', url: `${baseUrl}/?page=PastWork` },
    { name: 'Portfolio: Projects', url: `${baseUrl}/?page=Projects` },
    { name: 'Portfolio: Embedded (ESP32)', url: `${baseUrl}/?page=Embedded` },
    { name: 'Portfolio: Hobby', url: `${baseUrl}/?page=Hobby` },
    { name: 'Project: Universe Hub', url: `${baseUrl}/Projects/Universe/index.html` },
    { name: 'Project: Parametric PCB', url: `${baseUrl}/Projects/ParametricPCB/index.html` },
    { name: 'Project: Sound Reactive Stage', url: `${baseUrl}/Projects/SoundReactive/index.html` },
    { name: 'Work: Codafest Production', url: `${baseUrl}/Work/Codafest/index.html` },
    { name: 'Work: DJ Deaf Wish', url: `${baseUrl}/Work/DJwish/index.html` },
    { name: 'Work: Universal Music Design', url: `${baseUrl}/Work/UniversalMusicDesign/index.html` }
];

function runLighthouseSingle(pageName, url) {
    const slug = pageName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const outputBase = path.join(reportsDir, `temp_${slug}`);

    const flags = [
        `"${url}"`,
        '--chrome-flags="--headless"',
        '--preset=desktop',
        '--output=json',
        `--output-path="${outputBase}"`,
        '--quiet'
    ];

    const cmd = `npx --yes lighthouse ${flags.join(' ')}`;

    try {
        execSync(cmd, { stdio: 'inherit', cwd: __dirname });
    } catch (err) {
        console.error(`  ${c.red}✖ Lighthouse run failed for ${url}:${c.reset}`, err.message);
        return null;
    }

    let reportPath = `${outputBase}.report.json`;
    if (!fs.existsSync(reportPath)) {
        reportPath = `${outputBase}.json`;
    }
    if (!fs.existsSync(reportPath)) {
        reportPath = outputBase;
    }

    if (!fs.existsSync(reportPath)) {
        return null;
    }

    const raw = fs.readFileSync(reportPath, 'utf8');
    try { fs.unlinkSync(reportPath); } catch {} // Clean temp file

    return JSON.parse(raw);
}

async function main() {
    console.log(`\n${c.cyan}${c.bold}====================================================${c.reset}`);
    console.log(`${c.cyan}${c.bold}  LIGHTHOUSE COMPREHENSIVE MULTI-PAGE AUDIT SUITE   ${c.reset}`);
    console.log(`${c.dim}  Target Server: ${baseUrl}${c.reset}`);
    console.log(`${c.cyan}${c.bold}====================================================${c.reset}\n`);

    const serverOk = await verifyServer(baseUrl);
    if (!serverOk) {
        console.error(`${c.red}Error: Target server ${baseUrl} is not reachable!${c.reset}`);
        process.exit(1);
    }
    console.log(`${c.green}✔ Target server verified active.${c.reset}\n`);

    const auditResults = [];
    const nonPerfectPages = [];
    const colorContrastIssues = [];

    for (let i = 0; i < targetPages.length; i++) {
        const p = targetPages[i];
        process.stdout.write(`[${i + 1}/${targetPages.length}] Auditing: ${c.bold}${p.name}${c.reset} ... `);

        const data = runLighthouseSingle(p.name, p.url);
        if (!data) {
            console.log(`${c.red}FAILED${c.reset}`);
            continue;
        }

        const cats = data.categories || {};
        const perf = Math.round((cats.performance ? cats.performance.score : 0) * 100);
        const a11y = Math.round((cats.accessibility ? cats.accessibility.score : 0) * 100);
        const bp = Math.round((cats['best-practices'] ? cats['best-practices'].score : 0) * 100);
        const seo = Math.round((cats.seo ? cats.seo.score : 0) * 100);

        const is100All = (perf === 100 && a11y === 100 && bp === 100 && seo === 100);

        // Check color contrast audit
        const contrastAudit = data.audits && data.audits['color-contrast'];
        const contrastScore = contrastAudit && contrastAudit.score !== null ? contrastAudit.score : 1;
        const contrastFailingItems = [];

        if (contrastScore < 1 && contrastAudit && contrastAudit.details && contrastAudit.details.items) {
            for (const item of contrastAudit.details.items) {
                contrastFailingItems.push({
                    selector: item.node ? item.node.selector : 'unknown',
                    snippet: item.node ? item.node.snippet : '',
                    explanation: item.node ? item.node.explanation : '',
                    contrastRatio: item.contrastRatio,
                    targetContrastRatio: item.targetContrastRatio
                });
            }

            colorContrastIssues.push({
                page: p.name,
                url: p.url,
                failures: contrastFailingItems
            });
        }

        const entry = {
            name: p.name,
            url: p.url,
            perf,
            a11y,
            bp,
            seo,
            is100All,
            contrastPassed: contrastScore === 1,
            contrastFailingCount: contrastFailingItems.length
        };
        auditResults.push(entry);

        if (!is100All) {
            nonPerfectPages.push(entry);
            console.log(`${c.yellow}P:${scoreColor(perf)} A:${scoreColor(a11y)} BP:${scoreColor(bp)} SEO:${scoreColor(seo)}${c.reset}`);
        } else {
            console.log(`${c.green}${c.bold}PERFECT 100/100/100/100!${c.reset}`);
        }
    }

    // Print Consolidated Summary Table
    console.log(`\n${c.bold}┌────────────────────────────────────────────────────────┬──────┬──────┬──────┬──────┬──────────────┐${c.reset}`);
    console.log(`${c.bold}│ Page / View Name                                       │ Perf │ A11y │  BP  │ SEO  │ Contrast Pass│${c.reset}`);
    console.log(`${c.bold}├────────────────────────────────────────────────────────┼──────┼──────┼──────┼──────┼──────────────┤${c.reset}`);

    for (const r of auditResults) {
        const namePadded = r.name.padEnd(54).substring(0, 54);
        const pStr = scoreColor(r.perf).padStart(13);
        const aStr = scoreColor(r.a11y).padStart(13);
        const bStr = scoreColor(r.bp).padStart(13);
        const sStr = scoreColor(r.seo).padStart(13);
        const cStr = r.contrastPassed ? `${c.green}✔ PASS${c.reset}`.padStart(20) : `${c.red}✖ ${r.contrastFailingCount} FAIL${c.reset}`.padStart(20);

        console.log(`│ ${namePadded} │ ${pStr} │ ${aStr} │ ${bStr} │ ${sStr} │ ${cStr} │`);
    }
    console.log(`${c.bold}└────────────────────────────────────────────────────────┴──────┴──────┴──────┴──────┴──────────────┘${c.reset}\n`);

    // Log Non-100/100 Pages
    console.log(`${c.bold}Pages NOT hitting 100/100 across all categories:${c.reset}`);
    if (nonPerfectPages.length === 0) {
        console.log(`  ${c.green}✔ ALL PAGES HIT PERFECT 100/100 ACROSS ALL BOARDS!${c.reset}`);
    } else {
        for (const np of nonPerfectPages) {
            console.log(`  • ${c.yellow}${np.name}${c.reset} (${np.url})`);
            const subIssues = [];
            if (np.perf < 100) subIssues.push(`Performance: ${np.perf}`);
            if (np.a11y < 100) subIssues.push(`Accessibility: ${np.a11y}`);
            if (np.bp < 100) subIssues.push(`Best Practices: ${np.bp}`);
            if (np.seo < 100) subIssues.push(`SEO: ${np.seo}`);
            console.log(`    Missing 100 in: ${subIssues.join(', ')}`);
        }
    }

    // Log Detailed Color Contrast Failures
    console.log(`\n${c.bold}WCAG Color Contrast Audit Summary:${c.reset}`);
    if (colorContrastIssues.length === 0) {
        console.log(`  ${c.green}✔ ZERO COLOR CONTRAST VIOLATIONS DETECTED ACROSS ALL PAGES!${c.reset}`);
    } else {
        console.log(`  ${c.red}Found color contrast violations on ${colorContrastIssues.length} page(s):${c.reset}`);
        for (const ci of colorContrastIssues) {
            console.log(`\n  [Page] ${c.bold}${ci.page}${c.reset} (${ci.url}):`);
            for (const f of ci.failures) {
                console.log(`    • Selector: ${c.cyan}${f.selector}${c.reset}`);
                if (f.explanation) console.log(`      Reason:   ${f.explanation}`);
                if (f.contrastRatio) console.log(`      Ratio:    ${f.contrastRatio}:1 (Required: ${f.targetContrastRatio}:1)`);
            }
        }
    }

    // Save Markdown & JSON reports
    const mdReportPath = path.join(reportsDir, 'all-pages-audit.md');
    const jsonReportPath = path.join(reportsDir, 'all-pages-audit.json');

    let md = `# Lighthouse Multi-Page Audit & Color Contrast Report\n\n`;
    md += `Generated: ${new Date().toISOString()}\n`;
    md += `Target: ${baseUrl}\n\n`;
    md += `## Score Summary\n\n`;
    md += `| Page / Route | Performance | Accessibility | Best Practices | SEO | 100/100 All | Color Contrast |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    for (const r of auditResults) {
        md += `| **${r.name}** | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${r.is100All ? '✅ Yes' : '⚠️ No'} | ${r.contrastPassed ? '✅ Pass' : `❌ ${r.contrastFailingCount} Fails`} |\n`;
    }

    md += `\n## Pages Below 100/100\n\n`;
    if (nonPerfectPages.length === 0) {
        md += `> **All audited pages scored a perfect 100/100 across all four categories!**\n\n`;
    } else {
        for (const np of nonPerfectPages) {
            md += `### ${np.name}\n- URL: \`${np.url}\`\n`;
            if (np.perf < 100) md += `- **Performance**: ${np.perf}\n`;
            if (np.a11y < 100) md += `- **Accessibility**: ${np.a11y}\n`;
            if (np.bp < 100) md += `- **Best Practices**: ${np.bp}\n`;
            if (np.seo < 100) md += `- **SEO**: ${np.seo}\n`;
            md += `\n`;
        }
    }

    md += `## Color Contrast Audit Breakdown\n\n`;
    if (colorContrastIssues.length === 0) {
        md += `> **No color contrast violations detected across any audited pages.**\n`;
    } else {
        for (const ci of colorContrastIssues) {
            md += `### ${ci.page}\n`;
            for (const f of ci.failures) {
                md += `- **Selector**: \`${f.selector}\`\n`;
                if (f.explanation) md += `  - Explanation: ${f.explanation}\n`;
                if (f.contrastRatio) md += `  - Ratio: ${f.contrastRatio}:1 (Target: ${f.targetContrastRatio}:1)\n`;
            }
            md += `\n`;
        }
    }

    fs.writeFileSync(mdReportPath, md, 'utf8');
    fs.writeFileSync(jsonReportPath, JSON.stringify({ auditResults, nonPerfectPages, colorContrastIssues }, null, 2), 'utf8');

    console.log(`\n✔ Full Reports Saved:`);
    console.log(`  • Markdown: ${mdReportPath}`);
    console.log(`  • JSON:     ${jsonReportPath}\n`);
}

main();
