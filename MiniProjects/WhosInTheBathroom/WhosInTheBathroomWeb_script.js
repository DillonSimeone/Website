document.addEventListener('DOMContentLoaded', () => {
    const btnKnock = document.getElementById('btn-knock');
    const btnKillAll = document.getElementById('btn-killall');
    const stallsContainer = document.getElementById('bathroom-stalls');

    // Cursed processes that love to stay inside the bathroom
    const offendingProcesses = [
        { name: "GoogleAntiGravityTokenTracker.exe", pid: "14204" },
        { name: "Node_Modules_Black_Hole.exe", pid: "9412" },
        { name: "Teams_Memory_Sponge.exe", pid: "2204" },
        { name: "Unused_Docker_Daemon_Ghost.exe", pid: "667" }
    ];

    btnKnock.addEventListener('click', () => {
        renderStalls();
        btnKnock.innerText = "Knock Harder (Rescan)";
        btnKillAll.classList.remove('hidden');
    });

    btnKillAll.addEventListener('click', () => {
        // Clear everything out immediately
        stallsContainer.innerHTML = '<div class="empty-state" style="color: #457b9d; font-weight: bold;">*LOUD FLUSHING SOUNDS*<br><br>All handles successfully cleared! The bathroom is clean.</div>';
        btnKillAll.classList.add('hidden');
        btnKnock.innerText = "Knock on Door (Scan)";
    });

    function renderStalls() {
        stallsContainer.innerHTML = '';
        
        const table = document.createElement('div');
        table.className = 'process-table';

        offendingProcesses.forEach((proc, index) => {
            const row = document.createElement('div');
            row.className = 'process-row';
            row.id = `proc-row-${index}`;

            const cellName = document.createElement('div');
            cellName.className = 'process-cell name';
            cellName.innerText = `[Occupied] ${proc.name}`;

            const cellPid = document.createElement('div');
            cellPid.className = 'process-cell pid';
            cellPid.innerText = `PID: ${proc.pid}`;

            const cellAction = document.createElement('div');
            cellAction.className = 'process-cell action';

            const killBtn = document.createElement('button');
            killBtn.className = 'btn-inline-kill';
            killBtn.innerText = 'FLUSH';
            killBtn.addEventListener('click', () => {
                row.remove();
                checkIfEmpty();
            });

            cellAction.appendChild(killBtn);
            row.appendChild(cellName);
            row.appendChild(cellPid);
            row.appendChild(cellAction);
            table.appendChild(row);
        });

        stallsContainer.appendChild(table);
    }

    function checkIfEmpty() {
        const remainingRows = stallsContainer.querySelectorAll('.process-row');
        if (remainingRows.length === 0) {
            stallsContainer.innerHTML = '<div class="empty-state">The bathroom is now completely clear. You can delete your folders in peace!</div>';
            btnKillAll.classList.add('hidden');
            btnKnock.innerText = "Knock on Door (Scan)";
        }
    }
});
