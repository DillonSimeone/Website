document.addEventListener('DOMContentLoaded', () => {
    const btnInspect = document.getElementById('btn-inspect');
    const btnPurgeAll = document.getElementById('btn-purge-all');
    const btnReset = document.getElementById('btn-reset');
    const fileRegistry = document.getElementById('file-registry');
    const consoleBox = document.getElementById('propaganda-feed');
    const consoleText = document.getElementById('console-text');

    const bourgeoisFiles = [
        {
            name: "__MACOSX",
            icon: "📁",
            reason: "Denied: Requires written permission from NIGHTMARISHTOWE\\Doctor Nightmares",
            type: "folder"
        },
        {
            name: "node_modules",
            icon: "📦",
            reason: "Denied: 45,000 deep symlinks locked by an orphaned Vite daemon",
            type: "folder"
        },
        {
            name: "temp_build_cache",
            icon: "🗄️",
            reason: "Denied: Read-Only archive attribute set by imperialist zip extractor",
            type: "folder"
        },
        {
            name: "stray_debug.log",
            icon: "📄",
            reason: "Denied: Handle locked by a defunct background process from 3 weeks ago",
            type: "file"
        }
    ];

    function logConsole(message) {
        consoleBox.classList.remove('hidden');
        consoleText.innerText = message;
    }

    function renderFiles() {
        fileRegistry.innerHTML = '';

        bourgeoisFiles.forEach((file, index) => {
            const row = document.createElement('div');
            row.className = 'file-row';
            row.id = `file-item-${index}`;

            const info = document.createElement('div');
            info.className = 'file-info';

            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.innerText = file.icon;

            const details = document.createElement('div');
            
            const name = document.createElement('div');
            name.className = 'file-name';
            name.innerText = file.name;

            const status = document.createElement('div');
            status.className = 'file-status';
            status.innerText = file.reason;

            details.appendChild(name);
            details.appendChild(status);
            info.appendChild(icon);
            info.appendChild(details);

            const seizeBtn = document.createElement('button');
            seizeBtn.className = 'btn-inline-seize';
            seizeBtn.innerText = '⚒️ SEIZE';
            seizeBtn.addEventListener('click', () => {
                liberateItem(row, file, seizeBtn, status);
            });

            row.appendChild(info);
            row.appendChild(seizeBtn);
            fileRegistry.appendChild(row);
        });

        btnPurgeAll.classList.remove('hidden');
    }

    function liberateItem(row, file, btn, statusEl) {
        row.classList.add('liberated');
        statusEl.innerText = "✓ LIBERATED: Property of the Proletariat (Full Control granted to All Workers)";
        btn.innerText = "SEIZED ★";
        btn.disabled = true;

        logConsole(
`===============================================================================
       CENTRAL EXECUTIVE COMMITTEE — DIRECTIVE NO. 404
===============================================================================
Target Asset: ${file.name}

[1/3] Expropriating ownership from bourgeois user tokens...
      > Ownership declared property of Comrade Doctor Nightmares.
[2/3] Liquidating bureaucratic ACL restrictions...
      > Granted *S-1-1-0:(OI)(CI)F (Full Control to the Proletariat).
[3/3] Purging counter-revolutionary Read-Only attributes...
      > Attributes purged.

RESULT: LIBERATION COMPLETE! File may be deleted without petitioning yourself.`
        );

        checkAllLiberated();
    }

    function checkAllLiberated() {
        const remaining = document.querySelectorAll('.btn-inline-seize:not([disabled])');
        if (remaining.length === 0) {
            btnPurgeAll.classList.add('hidden');
            logConsole(
`===============================================================================
 ★ ALL FILESYSTEM ASSETS LIBERATED BY THE CENTRAL COMMITTEE ★
===============================================================================
Private property is abolished. Every handle has been expropriated.
You may now purge the entire directory tree without asking permission from yourself!
Carry on building the Five-Year Plan.`
            );
        }
    }

    btnInspect.addEventListener('click', () => {
        renderFiles();
        logConsole("[Gosplan Registry] Stubborn assets detected on drive F:\\. Bureaucracy stands ready.");
    });

    btnPurgeAll.addEventListener('click', () => {
        const rows = document.querySelectorAll('.file-row');
        rows.forEach((row, idx) => {
            const file = bourgeoisFiles[idx];
            const btn = row.querySelector('.btn-inline-seize');
            const statusEl = row.querySelector('.file-status');
            if (btn && !btn.disabled) {
                row.classList.add('liberated');
                statusEl.innerText = "✓ LIBERATED: Property of the Proletariat";
                btn.innerText = "SEIZED ★";
                btn.disabled = true;
            }
        });
        checkAllLiberated();
    });

    btnReset.addEventListener('click', () => {
        renderFiles();
        logConsole("[Archive Reset] Bourgeois lockouts re-instated. Ready for re-seizure.");
    });

    // Initial render
    renderFiles();
});
