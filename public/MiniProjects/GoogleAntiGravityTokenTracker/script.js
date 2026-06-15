/* script.js */
document.addEventListener('DOMContentLoaded', () => {
    const periodCards = document.querySelectorAll('.stat-period-card');
    const waterOutput = document.getElementById('water-output');
    const comparisonLabel = document.getElementById('comparison-label');
    const humanPercentage = document.getElementById('human-percentage');
    const waterBar = document.getElementById('water-bar');
    const tooltip = document.getElementById('chart-tooltip');
    const modelGrid = document.getElementById('model-breakdown-grid');

    // Constants
    const ML_PER_TOKEN = 0.0003; // Google: ~0.3 mL per 1K tokens
    const HUMAN_DAILY_WATER_ML = 2500; // ~2.5 Liters

    // Model Colors mapping
    const modelColors = {
        'Gemini 3 Flash A': '#66fcf1', // Cyan
        'Claude Opus 4 6 Thinking': '#b388ff', // Purple
        'Gemini Pro Default': '#ffd740' // Amber
    };

    // Period model breakdowns matching screenshots
    const modelDataByPeriod = {
        'Today': [
            { name: 'Gemini 3 Flash A', tokens: 3500000, color: modelColors['Gemini 3 Flash A'] },
            { name: 'Claude Opus 4 6 Thinking', tokens: 150000, color: modelColors['Claude Opus 4 6 Thinking'] },
            { name: 'Gemini Pro Default', tokens: 70000, color: modelColors['Gemini Pro Default'] }
        ],
        'Week': [
            { name: 'Gemini 3 Flash A', tokens: 6450000, color: modelColors['Gemini 3 Flash A'] },
            { name: 'Claude Opus 4 6 Thinking', tokens: 320000, color: modelColors['Claude Opus 4 6 Thinking'] },
            { name: 'Gemini Pro Default', tokens: 160000, color: modelColors['Gemini Pro Default'] }
        ],
        'Month': [
            { name: 'Gemini 3 Flash A', tokens: 9690000, color: modelColors['Gemini 3 Flash A'] },
            { name: 'Claude Opus 4 6 Thinking', tokens: 442000, color: modelColors['Claude Opus 4 6 Thinking'] },
            { name: 'Gemini Pro Default', tokens: 184700, color: modelColors['Gemini Pro Default'] }
        ],
        'Lifetime': [
            { name: 'Gemini 3 Flash A', tokens: 9690000, color: modelColors['Gemini 3 Flash A'] },
            { name: 'Claude Opus 4 6 Thinking', tokens: 442000, color: modelColors['Claude Opus 4 6 Thinking'] },
            { name: 'Gemini Pro Default', tokens: 184700, color: modelColors['Gemini Pro Default'] }
        ]
    };

    // 30-day raw daily totals carefully selected so:
    // - Today (Jun 15) is exactly 3.72M
    // - Last 7 days (Jun 9 - Jun 15) sum is exactly 6.93M
    // - Last 30 days (May 17 - Jun 15) sum is exactly 10.31M
    const rawDailyTotals = [
        { date: 'May 17', total: 150000 },
        { date: 'May 18', total: 220000 },
        { date: 'May 19', total: 310000 },
        { date: 'May 20', total: 0 },
        { date: 'May 21', total: 120000 },
        { date: 'May 22', total: 80000 },
        { date: 'May 23', total: 0 },
        { date: 'May 24', total: 250000 },
        { date: 'May 25', total: 410000 },
        { date: 'May 26', total: 320000 },
        { date: 'May 27', total: 180000 },
        { date: 'May 28', total: 0 },
        { date: 'May 29', total: 90000 },
        { date: 'May 30', total: 140000 },
        { date: 'May 31', total: 0 },
        { date: 'Jun 01', total: 280000 },
        { date: 'Jun 02', total: 340000 },
        { date: 'Jun 03', total: 150000 },
        { date: 'Jun 04', total: 0 },
        { date: 'Jun 05', total: 110000 },
        { date: 'Jun 06', total: 90000 },
        { date: 'Jun 07', total: 0 },
        { date: 'Jun 08', total: 140000 },
        { date: 'Jun 09', total: 350000 },
        { date: 'Jun 10', total: 540000 },
        { date: 'Jun 11', total: 450000 },
        { date: 'Jun 12', total: 0 },
        { date: 'Jun 13', total: 620000 },
        { date: 'Jun 14', total: 1250000 },
        { date: 'Jun 15', total: 3720000 } // Today
    ];

    // Distribute daily totals dynamically among models with slight realistic variation
    const dailyData = rawDailyTotals.map(item => {
        const total = item.total;
        if (total === 0) {
            return {
                date: item.date,
                total: 0,
                breakdown: [
                    { name: 'Gemini 3 Flash A', tokens: 0, color: modelColors['Gemini 3 Flash A'] },
                    { name: 'Claude Opus 4 6 Thinking', tokens: 0, color: modelColors['Claude Opus 4 6 Thinking'] },
                    { name: 'Gemini Pro Default', tokens: 0, color: modelColors['Gemini Pro Default'] }
                ]
            };
        }

        // Base distributions: Gemini Flash (~93.9%), Claude (~4.3%), Pro (~1.8%)
        let pFlash = 0.939;
        let pClaude = 0.043;
        let pPro = 0.018;

        // Add minor variation based on date to make stacked bars look alive
        const charSum = item.date.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
        const variation = (charSum % 10 - 5) / 500; // -1% to +1%
        pFlash += variation;
        pClaude -= variation * 0.7;
        pPro -= variation * 0.3;

        const flashTokens = Math.round(total * pFlash);
        const claudeTokens = Math.round(total * pClaude);
        const proTokens = total - flashTokens - claudeTokens; // Perfect sum match

        return {
            date: item.date,
            total: total,
            breakdown: [
                { name: 'Gemini 3 Flash A', tokens: flashTokens, color: modelColors['Gemini 3 Flash A'] },
                { name: 'Claude Opus 4 6 Thinking', tokens: claudeTokens, color: modelColors['Claude Opus 4 6 Thinking'] },
                { name: 'Gemini Pro Default', tokens: proTokens, color: modelColors['Gemini Pro Default'] }
            ]
        };
    });

    // Helper: format token values
    function formatTokens(count) {
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(2)}M`;
        } else if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    }

    // Update Water footprint section details
    function calculateWaterForTokens(tokens, label) {
        const waterMl = tokens * ML_PER_TOKEN;
        const percentage = (waterMl / HUMAN_DAILY_WATER_ML) * 100;
        
        if (waterMl >= 1000) {
            waterOutput.textContent = `${(waterMl / 1000).toFixed(2)} L`;
        } else {
            waterOutput.textContent = `${waterMl.toFixed(1)} mL`;
        }
        
        comparisonLabel.textContent = `Water consumed for ${label}'s tokens`;
        humanPercentage.textContent = `${percentage.toFixed(1)}%`;
        
        const cappedPercentage = Math.min(percentage, 100);
        waterBar.style.width = `${cappedPercentage}%`;
    }

    // Update the dynamic Model Token Breakdown Grid
    function updateModelGrid(breakdown) {
        if (!modelGrid) return;
        modelGrid.innerHTML = '';
        
        const total = breakdown.reduce((sum, item) => sum + item.tokens, 0);
        const sorted = [...breakdown].sort((a, b) => b.tokens - a.tokens);

        sorted.forEach(model => {
            const pct = total > 0 ? ((model.tokens / total) * 100).toFixed(1) : '0.0';
            const card = document.createElement('div');
            card.className = 'model-card';
            card.innerHTML = `
                <div class="model-card-header">
                    <span class="model-card-name" style="color: ${model.color};">${model.name}</span>
                    <span class="model-card-pct" style="color: ${model.color};">${pct}%</span>
                </div>
                <div class="model-card-tokens">${formatTokens(model.tokens)}</div>
                <div class="model-card-bar-bg">
                    <div class="model-card-bar-fill" style="width: ${pct}%; background-color: ${model.color};"></div>
                </div>
            `;
            modelGrid.appendChild(card);
        });
    }

    // Tooltip management
    function showTooltip(day, event) {
        if (!tooltip) return;

        let breakdownHtml = '';
        day.breakdown.forEach(model => {
            const formattedVal = formatTokens(model.tokens);
            const pct = day.total > 0 ? ((model.tokens / day.total) * 100).toFixed(1) : '0.0';
            breakdownHtml += `
                <div class="chart-tooltip-model">
                    <span><span class="model-dot" style="background-color: ${model.color};"></span>${model.name}</span>
                    <strong>${formattedVal} (${pct}%)</strong>
                </div>
            `;
        });

        tooltip.innerHTML = `
            <div class="chart-tooltip-date">${day.date}</div>
            <div class="chart-tooltip-total">
                <span>Total Tokens:</span>
                <span>${formatTokens(day.total)}</span>
            </div>
            ${breakdownHtml}
        `;
        
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
        moveTooltip(event);
    }

    function moveTooltip(event) {
        if (!tooltip) return;
        const xOffset = 15;
        const yOffset = -100;
        
        let x = event.pageX + xOffset;
        let y = event.pageY + yOffset;
        
        const tooltipWidth = tooltip.offsetWidth;
        const windowWidth = window.innerWidth;
        if (x + tooltipWidth > windowWidth - 20) {
            x = event.pageX - tooltipWidth - xOffset;
        }

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    function hideTooltip() {
        if (!tooltip) return;
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
    }

    // Render SVG stacked bar chart
    function renderChart() {
        const svg = document.getElementById('trend-chart');
        if (!svg) return;

        // Clear svg contents
        svg.innerHTML = '';

        // Add gradients definition to support glowing fills
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="gemini-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#66fcf1" />
                <stop offset="100%" stop-color="#00a896" />
            </linearGradient>
            <linearGradient id="claude-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#b388ff" />
                <stop offset="100%" stop-color="#6200ea" />
            </linearGradient>
            <linearGradient id="pro-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffd740" />
                <stop offset="100%" stop-color="#b58d00" />
            </linearGradient>
        `;
        svg.appendChild(defs);

        const width = 800;
        const height = 300;
        const paddingLeft = 60;
        const paddingRight = 20;
        const paddingTop = 30;
        const paddingBottom = 40;

        const chartHeight = height - paddingTop - paddingBottom;
        const chartWidth = width - paddingLeft - paddingRight;

        // Scale Y-axis to 4.0M max total tokens
        const maxVal = 4000000;

        // Draw Y Axis Ticks and Grid lines
        const yTicks = [0, 1000000, 2000000, 3000000, 4000000];
        yTicks.forEach(tick => {
            const y = paddingTop + chartHeight - (tick / maxVal) * chartHeight;
            
            // Grid line
            const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            gridLine.setAttribute('x1', paddingLeft);
            gridLine.setAttribute('y1', y);
            gridLine.setAttribute('x2', width - paddingRight);
            gridLine.setAttribute('y2', y);
            gridLine.setAttribute('stroke', '#1f2833');
            gridLine.setAttribute('stroke-width', '1');
            gridLine.setAttribute('stroke-dasharray', '4 4');
            svg.appendChild(gridLine);

            // Label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', paddingLeft - 10);
            text.setAttribute('y', y + 4);
            text.setAttribute('fill', '#9aa0a6');
            text.setAttribute('font-size', '10');
            text.setAttribute('text-anchor', 'end');
            text.textContent = tick === 0 ? '0.0' : `${(tick / 1000000).toFixed(1)}M`;
            svg.appendChild(text);
        });

        // Axes lines
        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', paddingLeft);
        xAxis.setAttribute('y1', paddingTop + chartHeight);
        xAxis.setAttribute('x2', width - paddingRight);
        xAxis.setAttribute('y2', paddingTop + chartHeight);
        xAxis.setAttribute('stroke', '#2f3e46');
        xAxis.setAttribute('stroke-width', '2');
        svg.appendChild(xAxis);

        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', paddingLeft);
        yAxis.setAttribute('y1', paddingTop - 10);
        yAxis.setAttribute('x2', paddingLeft);
        yAxis.setAttribute('y2', paddingTop + chartHeight);
        yAxis.setAttribute('stroke', '#2f3e46');
        yAxis.setAttribute('stroke-width', '2');
        svg.appendChild(yAxis);

        // Draw stacked bars
        const numBars = dailyData.length;
        const barWidth = 14;
        const gap = (chartWidth - numBars * barWidth) / (numBars - 1);

        dailyData.forEach((day, index) => {
            const x = paddingLeft + index * (barWidth + gap);
            const yBase = paddingTop + chartHeight;
            let currentY = yBase;

            // Highlight group on hover
            const barGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            barGroup.setAttribute('class', 'stacked-bar-group');
            barGroup.style.transition = 'opacity 0.2s';
            if (day.date === 'Jun 15') {
                barGroup.classList.add('active-day');
            }

            if (day.total > 0) {
                // Models draw stack: Gemini Pro at the bottom, then Claude, then Gemini Flash at the top
                const models = [
                    { name: 'Gemini Pro Default', grad: 'url(#pro-grad)' },
                    { name: 'Claude Opus 4 6 Thinking', grad: 'url(#claude-grad)' },
                    { name: 'Gemini 3 Flash A', grad: 'url(#gemini-grad)' }
                ];

                models.forEach(modelInfo => {
                    const modelEntry = day.breakdown.find(m => m.name === modelInfo.name);
                    const tokens = modelEntry ? modelEntry.tokens : 0;
                    if (tokens > 0) {
                        const h = (tokens / maxVal) * chartHeight;
                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', x);
                        rect.setAttribute('y', currentY - h);
                        rect.setAttribute('width', barWidth);
                        rect.setAttribute('height', h);
                        rect.setAttribute('fill', modelInfo.grad);
                        rect.setAttribute('rx', '1');
                        rect.style.transition = 'filter 0.2s';
                        barGroup.appendChild(rect);
                        currentY -= h;
                    }
                });

                svg.appendChild(barGroup);
            }

            // Draw date labels on X axis for key intervals
            if (index % 5 === 0 || index === numBars - 1) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', x + barWidth / 2);
                text.setAttribute('y', yBase + 18);
                text.setAttribute('fill', '#9aa0a6');
                text.setAttribute('font-size', '9');
                text.setAttribute('text-anchor', 'middle');
                text.textContent = day.date;
                svg.appendChild(text);
            }

            // Draw transparent overlay bar for hover events
            const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            overlay.setAttribute('x', x - gap/2);
            overlay.setAttribute('y', paddingTop - 10);
            overlay.setAttribute('width', barWidth + gap);
            overlay.setAttribute('height', chartHeight + 20);
            overlay.setAttribute('class', 'chart-overlay-bar');
            overlay.setAttribute('fill', 'transparent');
            overlay.style.cursor = 'pointer';
            
            // Hover events
            overlay.addEventListener('mouseenter', (e) => {
                // Dim other bars
                document.querySelectorAll('.stacked-bar-group').forEach(bg => {
                    bg.style.opacity = '0.4';
                });
                barGroup.style.opacity = '1';
                // Add hover glow to children rects
                barGroup.querySelectorAll('rect').forEach(r => {
                    r.setAttribute('filter', 'drop-shadow(0 0 6px rgba(102, 252, 241, 0.6))');
                });
                showTooltip(day, e);
            });
            
            overlay.addEventListener('mousemove', (e) => {
                moveTooltip(e);
            });
            
            overlay.addEventListener('mouseleave', () => {
                // Reset opacities
                document.querySelectorAll('.stacked-bar-group').forEach(bg => {
                    bg.style.opacity = '1';
                    bg.querySelectorAll('rect').forEach(r => {
                        r.removeAttribute('filter');
                    });
                });
                hideTooltip();
            });

            overlay.addEventListener('click', () => {
                // Remove active styling from card grids
                periodCards.forEach(c => c.classList.remove('active'));
                
                // Update water section and model grid for this day
                calculateWaterForTokens(day.total, day.date);
                updateModelGrid(day.breakdown);
            });

            svg.appendChild(overlay);
        });
    }

    // Add click event listeners to period cards
    periodCards.forEach(card => {
        card.addEventListener('click', () => {
            periodCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const tokens = parseInt(card.getAttribute('data-tokens')) || 0;
            const label = card.getAttribute('data-label') || 'Selected Period';
            calculateWaterForTokens(tokens, label);

            // Update model breakdown grid based on selected period
            let periodKey = 'Today';
            if (label.includes('7 Days') || label.includes('Week')) {
                periodKey = 'Week';
            } else if (label.includes('30 Days') || label.includes('Month')) {
                periodKey = 'Month';
            } else if (label.includes('Lifetime')) {
                periodKey = 'Lifetime';
            }
            updateModelGrid(modelDataByPeriod[periodKey]);
        });
    });

    // Initialize chart
    renderChart();

    // Initialize with active card (Today)
    const initialActiveCard = document.querySelector('.stat-period-card.active');
    if (initialActiveCard) {
        const tokens = parseInt(initialActiveCard.getAttribute('data-tokens')) || 0;
        const label = initialActiveCard.getAttribute('data-label') || 'Today';
        calculateWaterForTokens(tokens, label);
        
        let periodKey = 'Today';
        if (label.includes('7 Days') || label.includes('Week')) {
            periodKey = 'Week';
        } else if (label.includes('30 Days') || label.includes('Month')) {
            periodKey = 'Month';
        } else if (label.includes('Lifetime')) {
            periodKey = 'Lifetime';
        }
        updateModelGrid(modelDataByPeriod[periodKey]);
    }
});
