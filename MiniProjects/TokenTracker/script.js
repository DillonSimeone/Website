/* script.js */
document.addEventListener('DOMContentLoaded', () => {
    const periodCards = document.querySelectorAll('.stat-period-card');
    const waterOutput = document.getElementById('water-output');
    const comparisonLabel = document.getElementById('comparison-label');
    const humanPercentage = document.getElementById('human-percentage');
    const waterBar = document.getElementById('water-bar');
    const tooltip = document.getElementById('chart-tooltip');
    const modelGrid = document.getElementById('model-breakdown-grid');
    const liveStatus = document.getElementById('live-status');
    const liveError = document.getElementById('live-error');

    const tokensTodayEl = document.getElementById('tokens-today');
    const tokensWeekEl = document.getElementById('tokens-week');
    const tokensMonthEl = document.getElementById('tokens-month');
    const tokensLifetimeEl = document.getElementById('tokens-lifetime');

    // Constants
    const ML_PER_TOKEN = 0.0003; // Google: ~0.3 mL per 1K tokens
    const HUMAN_DAILY_WATER_ML = 2500; // ~2.5 Liters

    const PROVIDER_COLORS = {
        antigravity: '#66fcf1',
        cursor: '#b388ff',
        other: '#ffd740',
    };

    let live = {
        periods: {
            today: { label: 'Today', total: 0, breakdown: [] },
            week: { label: 'Last 7 Days', total: 0, breakdown: [] },
            month: { label: 'Last 30 Days', total: 0, breakdown: [] },
            lifetime: { label: 'Lifetime', total: 0, breakdown: [] },
        },
        daily: [], // last 14 days: { dateKey, total, breakdown[] }
        lastScanTime: null,
    };

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

        const dailyData = live.daily || [];
        const width = 800;
        const height = 300;
        const paddingLeft = 60;
        const paddingRight = 20;
        const paddingTop = 30;
        const paddingBottom = 40;

        const chartHeight = height - paddingTop - paddingBottom;
        const chartWidth = width - paddingLeft - paddingRight;

        const maxVal = Math.max(1, ...dailyData.map(d => d.total));

        // Add gradients definition (provider keyed)
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="antigravity-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#66fcf1" />
                <stop offset="100%" stop-color="#00a896" />
            </linearGradient>
            <linearGradient id="cursor-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#b388ff" />
                <stop offset="100%" stop-color="#6200ea" />
            </linearGradient>
            <linearGradient id="other-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffd740" />
                <stop offset="100%" stop-color="#b58d00" />
            </linearGradient>
        `;
        svg.appendChild(defs);

        // Draw Y Axis Ticks and Grid lines
        const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(maxVal * p));
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
            text.textContent = tick === 0 ? '0' : formatTokens(tick);
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
        const numBars = dailyData.length || 1;
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

            if (day.total > 0) {
                const stacks = [
                    { key: 'other', grad: 'url(#other-grad)' },
                    { key: 'cursor', grad: 'url(#cursor-grad)' },
                    { key: 'antigravity', grad: 'url(#antigravity-grad)' },
                ];

                stacks.forEach(stack => {
                    const stackEntry = day.breakdown.find(m => m.name === stack.key);
                    const tokens = stackEntry ? stackEntry.tokens : 0;
                    if (tokens > 0) {
                        const h = (tokens / maxVal) * chartHeight;
                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', x);
                        rect.setAttribute('y', currentY - h);
                        rect.setAttribute('width', barWidth);
                        rect.setAttribute('height', h);
                        rect.setAttribute('fill', stack.grad);
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
            
            const period = card.getAttribute('data-period') || 'today';
            const label = card.getAttribute('data-label') || 'Selected Period';
            const tokens = (live.periods[period]?.total) || 0;
            calculateWaterForTokens(tokens, label);
            updateModelGrid(live.periods[period]?.breakdown || []);
        });
    });

    function startOfLocalDay(d) {
        const dt = new Date(d);
        dt.setHours(0, 0, 0, 0);
        return dt;
    }

    function isSameLocalDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    function parseEntries(cacheJson) {
        const entries = Array.isArray(cacheJson.entries) ? cacheJson.entries : [];
        const parsed = [];
        for (const e of entries) {
            if (!e || !e.timestamp) continue;
            const ts = new Date(e.timestamp);
            if (Number.isNaN(ts.getTime())) continue;
            const prompt = Number(e.prompt_tokens || 0);
            const output = Number(e.output_tokens || 0);
            const provider = e.provider || 'unknown';
            parsed.push({
                ts,
                provider,
                model: e.model || 'unknown',
                tokens: Math.max(0, prompt) + Math.max(0, output),
            });
        }
        return parsed;
    }

    function computeBreakdown(entries) {
        const byModel = new Map();
        let total = 0;
        for (const e of entries) {
            total += e.tokens;
            const key = `[${e.provider}] ${e.model}`;
            byModel.set(key, (byModel.get(key) || 0) + e.tokens);
        }
        const rows = Array.from(byModel.entries())
            .map(([name, tokens]) => ({ name, tokens, color: name.includes('[cursor]') ? PROVIDER_COLORS.cursor : PROVIDER_COLORS.antigravity }))
            .sort((a, b) => b.tokens - a.tokens);
        return { total, breakdown: rows };
    }

    function computeDaily(entries, days = 14) {
        const now = new Date();
        const cutoff = startOfLocalDay(now);
        cutoff.setDate(cutoff.getDate() - (days - 1));

        const buckets = new Map(); // dateKey -> { total, ag, cursor, other }
        for (const e of entries) {
            const localTs = new Date(e.ts);
            if (localTs < cutoff) continue;
            const d = startOfLocalDay(localTs);
            const dateKey = d.toISOString().slice(0, 10); // ok for ordering
            const b = buckets.get(dateKey) || { dateKey, total: 0, antigravity: 0, cursor: 0, other: 0 };
            b.total += e.tokens;
            if (e.provider === 'antigravity') b.antigravity += e.tokens;
            else if (e.provider === 'cursor') b.cursor += e.tokens;
            else b.other += e.tokens;
            buckets.set(dateKey, b);
        }

        // Fill missing days with zeros
        const out = [];
        for (let i = 0; i < days; i++) {
            const d = startOfLocalDay(cutoff);
            d.setDate(d.getDate() + i);
            const dateKey = d.toISOString().slice(0, 10);
            const b = buckets.get(dateKey) || { dateKey, total: 0, antigravity: 0, cursor: 0, other: 0 };
            out.push({
                date: dateKey.slice(5), // MM-DD
                dateKey,
                total: b.total,
                breakdown: [
                    { name: 'antigravity', tokens: b.antigravity, color: PROVIDER_COLORS.antigravity },
                    { name: 'cursor', tokens: b.cursor, color: PROVIDER_COLORS.cursor },
                    { name: 'other', tokens: b.other, color: PROVIDER_COLORS.other },
                ],
            });
        }
        return out;
    }

    function updatePeriodCards(periods) {
        if (tokensTodayEl) tokensTodayEl.textContent = formatTokens(periods.today.total);
        if (tokensWeekEl) tokensWeekEl.textContent = formatTokens(periods.week.total);
        if (tokensMonthEl) tokensMonthEl.textContent = formatTokens(periods.month.total);
        if (tokensLifetimeEl) tokensLifetimeEl.textContent = formatTokens(periods.lifetime.total);
    }

    async function loadLiveCache() {
        try {
            if (liveError) liveError.style.display = 'none';
            if (liveStatus) liveStatus.textContent = 'Loading live data from ./cache.json…';

            const resp = await fetch('./cache.json', { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const cacheJson = await resp.json();

            const entries = parseEntries(cacheJson);
            const now = new Date();

            const startToday = startOfLocalDay(now);
            const startWeek = startOfLocalDay(now); startWeek.setDate(startWeek.getDate() - 6);
            const startMonth = startOfLocalDay(now); startMonth.setDate(startMonth.getDate() - 29);

            const todayEntries = entries.filter(e => e.ts >= startToday);
            const weekEntries = entries.filter(e => e.ts >= startWeek);
            const monthEntries = entries.filter(e => e.ts >= startMonth);

            live.periods.today = { label: 'Today', ...computeBreakdown(todayEntries) };
            live.periods.week = { label: 'Last 7 Days', ...computeBreakdown(weekEntries) };
            live.periods.month = { label: 'Last 30 Days', ...computeBreakdown(monthEntries) };
            live.periods.lifetime = { label: 'Lifetime', ...computeBreakdown(entries) };
            live.daily = computeDaily(entries, 14);

            updatePeriodCards(live.periods);
            renderChart();

            // Initialize view from active card
            const initialActiveCard = document.querySelector('.stat-period-card.active');
            const period = initialActiveCard?.getAttribute('data-period') || 'today';
            const label = initialActiveCard?.getAttribute('data-label') || 'Today';
            calculateWaterForTokens(live.periods[period]?.total || 0, label);
            updateModelGrid(live.periods[period]?.breakdown || []);

            const lastScan = cacheJson.last_scan_time ? new Date(cacheJson.last_scan_time) : null;
            if (liveStatus) {
                liveStatus.textContent = lastScan
                    ? `Live data loaded. Last scan: ${lastScan.toLocaleString()}`
                    : 'Live data loaded.';
            }
        } catch (err) {
            if (liveStatus) liveStatus.textContent = 'Live data not available.';
            if (liveError) {
                liveError.style.display = 'block';
                liveError.textContent =
                    `Could not load ./cache.json. Make sure it exists and you are serving this folder with a web server (file:// cannot fetch local JSON reliably). Error: ${String(err)}`;
            }
            // fall back to empty rendering
            updatePeriodCards(live.periods);
            renderChart();
            calculateWaterForTokens(0, 'Today');
            updateModelGrid([]);
        }
    }

    loadLiveCache();
});
