/* Interactive Logic for DeafSpace Music Studio Critique & Specification */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SIDENOTE VISIBILITY TOGGLE ---
    const btnToggleSidenotes = document.getElementById('btn-toggle-sidenotes');
    const academicContent = document.getElementById('academic-content');

    if (btnToggleSidenotes && academicContent) {
        btnToggleSidenotes.addEventListener('click', () => {
            academicContent.classList.toggle('hide-sidenotes');
            btnToggleSidenotes.classList.toggle('active');
            
            if (academicContent.classList.contains('hide-sidenotes')) {
                btnToggleSidenotes.textContent = 'SHOW MARGIN NOTES';
            } else {
                btnToggleSidenotes.textContent = 'HIDE MARGIN NOTES';
            }
        });
    }

    // --- 2. INTERACTIVE LAYOUT DIAGRAM ---
    const gridDataOld = [
        ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
        ['wall', 'collab', 'eq', 'eq', 'eq', 'eq', 'collab', 'wall'],
        ['wall', 'path', 'path', 'path', 'path', 'path', 'path', 'wall'],
        ['wall', 'path', 'xylo', 'xylo', 'xylo', 'xylo', 'path', 'wall'],
        ['wall', 'path', 'path', 'path', 'path', 'path', 'path', 'wall'],
        ['wall', 'user', 'eq', 'eq', 'eq', 'eq', 'collab', 'wall']
    ];

    const gridDataNew = [
        ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
        ['wall', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'wall'],
        ['wall', 'clear', 'collab', 'clear', 'clear', 'user', 'clear', 'wall'],
        ['wall', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'wall'],
        ['wall', 'clear', 'collab', 'clear', 'clear', 'collab', 'clear', 'wall'],
        ['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall']
    ];

    const labelMapping = {
        'wall': 'Wall / Table',
        'eq': 'Gear Overload',
        'path': 'Narrow Path',
        'xylo': 'Xylophone (Blocked Center)',
        'user': 'Dillon (Facing Wall)',
        'collab': 'Collab (Facing Wall)',
        'clear': 'Wide Open Path',
    };

    function renderMap(grid) {
        const mapContainer = document.getElementById('studioMap');
        if (!mapContainer) return;
        
        mapContainer.innerHTML = '';
        
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const type = grid[r][c];
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                
                if (type === 'wall') cell.className += ' cell-wall';
                else if (type === 'eq' || type === 'xylo') cell.className += ' cell-equipment';
                else if (type === 'user') cell.className += ' cell-user';
                else if (type === 'collab') cell.className += ' cell-collab';
                else if (type === 'clear') cell.className += ' cell-clear';
                
                cell.textContent = labelMapping[type] || '';
                mapContainer.appendChild(cell);
            }
        }
    }

    // Bind layout buttons
    const btnLayoutOld = document.getElementById('btn-layout-old');
    const btnLayoutNew = document.getElementById('btn-layout-new');

    if (btnLayoutOld && btnLayoutNew) {
        btnLayoutOld.addEventListener('click', () => {
            btnLayoutOld.classList.add('active');
            btnLayoutNew.classList.remove('active');
            renderMap(gridDataOld);
        });

        btnLayoutNew.addEventListener('click', () => {
            btnLayoutOld.classList.remove('active');
            btnLayoutNew.classList.add('active');
            renderMap(gridDataNew);
        });
    }

    // Initialize map
    renderMap(gridDataOld);


    // --- 3. CONTRAST / LIGHTING SIMULATION ---
    let currentContrastMode = 'old';
    const btnToggleContrast = document.getElementById('toggleContrastBtn');
    const viewOld = document.getElementById('viewOld');
    const viewNew = document.getElementById('viewNew');

    if (btnToggleContrast && viewOld && viewNew) {
        btnToggleContrast.addEventListener('click', () => {
            if (currentContrastMode === 'old') {
                viewOld.style.opacity = '0.3';
                viewNew.style.opacity = '1';
                currentContrastMode = 'new';
                btnToggleContrast.textContent = "Switch to Old Lighting";
            } else {
                viewOld.style.opacity = '1';
                viewNew.style.opacity = '0.3';
                currentContrastMode = 'old';
                btnToggleContrast.textContent = "Switch to Proposed Lighting";
            }
        });
    }


    // --- 4. INTERACTIVE LED FREQUENCY VISUALIZER (FFT MATRIX) ---
    const cols = 12;
    const rows = 6;
    const totalLeds = cols * rows; // 72
    const ledStrip = document.getElementById('ledStrip'); // Container ID
    const freqSlider = document.getElementById('freqSlider');
    const freqValDisplay = document.getElementById('freqVal');
    const visualizerDesc = document.getElementById('visualizerDesc');

    if (ledStrip) {
        // Generate nodes
        for (let i = 0; i < totalLeds; i++) {
            const node = document.createElement('div');
            node.className = 'led-node';
            ledStrip.appendChild(node);
        }
    }

    // Color definitions for columns
    const colColors = [
        'rgb(220, 30, 30)',   // Col 0: Sub Bass - Red
        'rgb(220, 30, 30)',   // Col 1: Sub Bass - Red
        'rgb(220, 110, 30)',  // Col 2: Bass - Orange
        'rgb(220, 110, 30)',  // Col 3: Bass - Orange
        'rgb(210, 190, 30)',  // Col 4: Low Mids - Yellow
        'rgb(210, 190, 30)',  // Col 5: Low Mids - Yellow
        'rgb(40, 180, 40)',   // Col 6: Mids - Green
        'rgb(40, 180, 40)',   // Col 7: Mids - Green
        'rgb(30, 150, 200)',  // Col 8: Presence - Blue
        'rgb(30, 150, 200)',  // Col 9: Presence - Blue
        'rgb(120, 40, 180)',  // Col 10: Treble - Purple
        'rgb(120, 40, 180)'   // Col 11: Treble - Purple
    ];

    const categories = [
        'Sub-Bass (20 - 40 Hz)',
        'Sub-Bass (40 - 80 Hz)',
        'Low Bass (80 - 150 Hz)',
        'Mid Bass (150 - 250 Hz)',
        'Low Mids (250 - 450 Hz)',
        'Mids (450 - 700 Hz)',
        'High Mids (700 - 1000 Hz)',
        'Presence (1.0 - 1.4 kHz)',
        'Presence (1.4 - 1.8 kHz)',
        'Treble (1.8 - 2.5 kHz)',
        'Treble (2.5 - 4.0 kHz)',
        'Treble (4.0 kHz+)'
    ];

    function updateFreqVisualizer(value) {
        if (!freqValDisplay || !visualizerDesc) return;
        freqValDisplay.textContent = value + " Hz";
        
        // Logarithmic mapping of frequency to peak column index
        const minLog = Math.log(20);
        const maxLog = Math.log(2000);
        const pct = (Math.log(value) - minLog) / (maxLog - minLog);
        const peakCol = Math.round(pct * (cols - 1));
        const category = categories[peakCol];
        
        visualizerDesc.innerHTML = `Frequency classification: <strong>${category}</strong> - Simulating real-time FFT spectrum on LED matrix.`;
        
        // Calculate heights for each column (bell curve centered at peakCol)
        const heights = [];
        for (let c = 0; c < cols; c++) {
            const dist = Math.abs(c - peakCol);
            let h = Math.max(0, rows - dist * 1.5);
            h = Math.round(h);
            
            // Add visual organic jitter
            if (h > 0) {
                h = Math.max(1, Math.min(rows, h + Math.round((Math.random() - 0.5) * 1.2)));
            }
            heights.push(h);
        }
        
        const nodes = document.querySelectorAll('.led-node');
        nodes.forEach((node, idx) => {
            const col = idx % cols;
            const rowFromTop = Math.floor(idx / cols);
            const rowFromBottom = (rows - 1) - rowFromTop; // 0 to 5 (0 is bottom)
            
            const isActive = rowFromBottom < heights[col];
            
            if (isActive) {
                const color = colColors[col];
                node.style.backgroundColor = color;
                node.style.borderColor = color;
                node.style.boxShadow = `0 0 10px ${color}, inset 0 0 4px rgba(255, 255, 255, 0.4)`;
            } else {
                node.style.backgroundColor = '#333';
                node.style.borderColor = '#111';
                node.style.boxShadow = 'inset 0 0 3px rgba(0,0,0,0.8)';
            }
        });
    }

    if (freqSlider) {
        freqSlider.addEventListener('input', (e) => {
            updateFreqVisualizer(e.target.value);
        });
        
        // Initialize
        updateFreqVisualizer(freqSlider.value);
    }
});
