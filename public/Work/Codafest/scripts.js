const tiers = [
    {
        name: "Tier 0: Base Setup",
        price: 500,
        includes: []
    },
    {
        name: "Tier 1: Essential Production",
        price: 1350,
        includes: []
    },
    {
        name: "Tier 2: Ultra Festival Production",
        price: 2800,
        includes: ['battery-wled', 'extra-proj']
    }
];

const addons = [
    { id: 'extra-proj',  label: 'Extra Projection Mapping (+2 Nodes)', price: 400 },
    { id: 'battery-wled',label: 'Portable Battery WLED Stands',        price: 200 }
];

let selectedTierIndex = 1;

function selectTier(index) {
    selectedTierIndex = index;

    // Update card button styles
    for (let i = 0; i <= 2; i++) {
        const card = document.getElementById(`card-tier-${i}`);
        const btn = card.querySelector('.select-tier-btn');
        if (i === index) {
            btn.classList.add('active');
            btn.innerText = 'Selected';
        } else {
            btn.classList.remove('active');
            btn.innerText = `Select Tier ${i}`;
        }
    }

    const currentTier = tiers[index];

    // Update add-on toggle states: included items get locked, others unlocked
    addons.forEach(addon => {
        const optEl = document.getElementById(`opt-${addon.id}`);
        const chkEl = document.getElementById(`chk-${addon.id}`);
        const priceEl = optEl ? optEl.querySelector('.toggle-price') : null;
        if (!optEl || !chkEl) return;

        if (currentTier.includes.includes(addon.id)) {
            // Bundled in this tier — lock on and show INCLUDED price
            optEl.classList.add('included');
            chkEl.checked = true;
            chkEl.disabled = true;
            if (priceEl) {
                priceEl.innerText = 'INCLUDED';
                priceEl.style.color = '#A3B8B0';
            }
        } else {
            // Available as paid add-on
            optEl.classList.remove('included');
            chkEl.disabled = false;
            chkEl.checked = false;
            if (priceEl) {
                priceEl.innerText = `+$${addon.price}`;
                priceEl.style.color = 'var(--gold-primary)';
            }
        }
    });

    updateSummary();
}

function toggleAddon(addonId) {
    const optEl = document.getElementById(`opt-${addonId}`);
    if (optEl && optEl.classList.contains('included')) return; // Can't toggle bundled items

    const checkbox = document.getElementById(`chk-${addonId}`);
    if (event.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
    }
    updateSummary();
}

function updateSummary() {
    const listEl = document.getElementById('summary-list');
    listEl.innerHTML = '';

    const currentTier = tiers[selectedTierIndex];
    let total = currentTier.price;

    // Base tier line item
    const tierLi = document.createElement('li');
    tierLi.innerHTML = `<span>${currentTier.name}</span><span>$${currentTier.price.toLocaleString()}</span>`;
    listEl.appendChild(tierLi);

    // Process each add-on
    addons.forEach(addon => {
        const chkEl = document.getElementById(`chk-${addon.id}`);
        if (!chkEl || !chkEl.checked) return;

        const li = document.createElement('li');
        if (currentTier.includes.includes(addon.id)) {
            // Bundled — show as included, no extra cost
            li.innerHTML = `<span>${addon.label}</span><span style="color:var(--emerald-glow)">Included</span>`;
        } else {
            // Paid add-on
            total += addon.price;
            li.innerHTML = `<span>${addon.label}</span><span>+$${addon.price}</span>`;
        }
        listEl.appendChild(li);
    });

    document.getElementById('summary-total-price').innerText = `$${total.toLocaleString()}`;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    selectTier(1);
});
