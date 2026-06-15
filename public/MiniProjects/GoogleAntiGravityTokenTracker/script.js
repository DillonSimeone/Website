/* script.js */
document.addEventListener('DOMContentLoaded', () => {
    const periodCards = document.querySelectorAll('.stat-period-card');
    const waterOutput = document.getElementById('water-output');
    const comparisonLabel = document.getElementById('comparison-label');
    const humanPercentage = document.getElementById('human-percentage');
    const waterBar = document.getElementById('water-bar');
    const chartBars = document.querySelectorAll('.chart-bar');

    // Constants
    const ML_PER_TOKEN = 0.0003; // Google: ~0.3 mL per 1K tokens
    const HUMAN_DAILY_WATER_ML = 2500; // ~2.5 Liters

    function calculateWaterForTokens(tokens, label) {
        // Calculate LLM water footprint
        const waterMl = tokens * ML_PER_TOKEN;
        
        // Calculate human daily comparison percentage
        const percentage = (waterMl / HUMAN_DAILY_WATER_ML) * 100;
        
        // Update values in UI
        if (waterMl >= 1000) {
            waterOutput.textContent = `${(waterMl / 1000).toFixed(2)} L`;
        } else {
            waterOutput.textContent = `${waterMl.toFixed(1)} mL`;
        }
        
        comparisonLabel.textContent = `Water consumed for ${label}'s tokens`;
        humanPercentage.textContent = `${percentage.toFixed(1)}%`;
        
        // Update visual progress bar width
        const cappedPercentage = Math.min(percentage, 100);
        waterBar.style.width = `${cappedPercentage}%`;
    }

    function calculateWaterForCard(card) {
        const tokens = parseInt(card.getAttribute('data-tokens')) || 0;
        const label = card.getAttribute('data-label') || 'Selected Period';
        calculateWaterForTokens(tokens, label);
    }

    // Add click event listeners to period cards
    periodCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove active class from all cards
            periodCards.forEach(c => c.classList.remove('active'));
            chartBars.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked card
            card.classList.add('active');
            
            // Re-calculate
            calculateWaterForCard(card);
        });
    });

    // Add click event listeners to chart bars
    chartBars.forEach(bar => {
        bar.addEventListener('click', () => {
            // Remove active status from all cards and bars
            periodCards.forEach(c => c.classList.remove('active'));
            chartBars.forEach(b => b.classList.remove('active'));

            // Set clicked bar active
            bar.classList.add('active');

            // Retrieve token value from bar data
            const valStr = bar.getAttribute('data-val'); // e.g. "1.17M"
            let tokens = 0;
            if (valStr.endsWith('M')) {
                tokens = parseFloat(valStr) * 1,000,000;
            } else if (valStr.endsWith('K')) {
                tokens = parseFloat(valStr) * 1,000;
            } else {
                tokens = parseFloat(valStr);
            }
            
            const dateLabel = bar.getAttribute('data-date');
            calculateWaterForTokens(tokens, dateLabel);
        });
    });

    // Initialize with the active card (usually 'Today')
    const activeCard = document.querySelector('.stat-period-card.active');
    if (activeCard) {
        calculateWaterForCard(activeCard);
    }
});
