let opportunities = [];
let filteredOpportunities = [];
let currentPage = 1;
const itemsPerPage = 32;

// DOM Elements
const comicGrid = document.getElementById("comic-grid");
const searchInput = document.getElementById("search-input");
const filterType = document.getElementById("filter-type");
const filterDate = document.getElementById("filter-date");
const totalCountElement = document.getElementById("total-count");

const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const pageInfo = document.getElementById("page-info");

// Modal DOM Elements
const detailModal = document.getElementById("detail-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const btnCloseModal = document.getElementById("btn-close-modal");

// Load opportunities from JSON
async function loadOpportunities() {
    try {
        const response = await fetch("datagov_opportunities.json");
        if (!response.ok) {
            throw new Error("Failed to load JSON");
        }
        const data = await response.json();
        opportunities = data.opportunities || [];
        filteredOpportunities = [...opportunities];
        
        // Update total counter
        totalCountElement.textContent = opportunities.length.toLocaleString();
        
        // Setup initial UI
        setupFilters();
        applyFiltersAndRender();
        
    } catch (error) {
        console.error("Error loading datagov_opportunities.json:", error);
        comicGrid.innerHTML = `
            <div class="no-results">
                <div class="no-results-title">JSON DATABASE NOT FOUND!</div>
                <p>Please make sure <strong>download_datagov.py</strong> has completed running to fetch the daily CSV from SAM.gov.</p>
            </div>
        `;
    }
}

// Dynamically populate filters based on actual types in the CSV if needed,
// but we already have hardcoded standard ones.
function setupFilters() {
    // We can extract unique types to debug if we want
    const types = new Set(opportunities.map(o => o.type).filter(Boolean));
    console.log("Found opportunity types:", Array.from(types));
}

// Apply Search & Option Filters
function applyFiltersAndRender() {
    const query = searchInput.value.toLowerCase().trim();
    const selectedType = filterType.value;
    const dateLimitDays = filterDate.value;
    
    let result = opportunities;
    
    // 1. Text Search Filter
    if (query) {
        result = result.filter(o => 
            (o.title && o.title.toLowerCase().includes(query)) ||
            (o.sol && o.sol.toLowerCase().includes(query)) ||
            (o.agency && o.agency.toLowerCase().includes(query)) ||
            (o.office && o.office.toLowerCase().includes(query)) ||
            (o.desc && o.desc.toLowerCase().includes(query))
        );
    }
    
    // 2. Type Filter
    if (selectedType) {
        result = result.filter(o => o.type === selectedType);
    }
    
    // 3. Date Filter (Assuming date format is YYYY-MM-DD)
    if (dateLimitDays) {
        const limitDays = parseInt(dateLimitDays, 10);
        // Find the maximum date in the dataset to act as "today"
        // (since it's a static snapshot from a crawler, using real today might hide data if the snapshot is older)
        let maxDateStr = opportunities.reduce((max, o) => o.date > max ? o.date : max, "1970-01-01");
        const baseDate = new Date(maxDateStr);
        
        result = result.filter(o => {
            if (!o.date) return false;
            const itemDate = new Date(o.date);
            const diffTime = Math.abs(baseDate - itemDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= limitDays;
        });
    }
    
    filteredOpportunities = result;
    totalCountElement.textContent = filteredOpportunities.length.toLocaleString();
    
    currentPage = 1;
    renderGrid();
}

// Render the active page on the Grid
function renderGrid() {
    comicGrid.innerHTML = "";
    
    if (filteredOpportunities.length === 0) {
        comicGrid.innerHTML = `
            <div class="no-results">
                <div class="no-results-title">NO MATCHES FOUND!</div>
                <p>Try refining your search terms or modifying the dropdown filters.</p>
            </div>
        `;
        updatePaginationControls(0);
        return;
    }
    
    const totalPages = Math.ceil(filteredOpportunities.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredOpportunities.length);
    
    const pageItems = filteredOpportunities.slice(startIndex, endIndex);
    
    pageItems.forEach(opp => {
        createOpportunityCard(opp);
    });
    
    updatePaginationControls(totalPages);
}

// Create Card elements
function createOpportunityCard(opp) {
    const card = document.createElement("div");
    card.className = "comic-panel";
    
    // Handle solicitation badge
    const solBadge = opp.sol ? `<div class="badge-sol">SOL: ${opp.sol}</div>` : "";
    
    // Classify notice types to pick dynamic colors
    let typeClass = "type-folder"; // Default yellow
    if (opp.type === "Solicitation") typeClass = "type-file"; // Magenta
    else if (opp.type === "Award Notice") typeClass = "type-folder"; // Yellow
    else if (opp.type === "Pre-solicitation") typeClass = "type-folder"; // Yellow
    
    card.innerHTML = `
        <div>
            <div class="panel-header">
                <span class="panel-type ${typeClass}">${opp.type || "Opportunity"}</span>
            </div>
            ${solBadge}
            <div class="panel-title" style="font-size: 1.4rem;">${opp.title || "No Title"}</div>
            
            <div class="opp-meta">
                <div><strong>Agency:</strong> ${opp.agency || "N/A"}</div>
                <div><strong>Office:</strong> ${opp.office || "N/A"}</div>
            </div>
            
            <div class="panel-desc" style="-webkit-line-clamp: 2;">${opp.desc || "Select details to view description..."}</div>
        </div>
        <div>
            <div class="panel-footer" style="margin-bottom: 10px;">
                <span>POSTED: ${opp.date || "N/A"}</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-download btn-details" style="flex: 1; font-size: 0.95rem; padding: 4px 8px;">DETAILS</button>
                <a href="${opp.link}" target="_blank" class="btn-download" style="flex: 1; font-size: 0.95rem; padding: 4px 8px; background: var(--primary-cyan); color: #000;">GO TO SAM</a>
            </div>
        </div>
    `;
    
    // Add detail modal event listener
    card.querySelector(".btn-details").addEventListener("click", (e) => {
        e.stopPropagation();
        openDetails(opp);
    });
    
    // Double click to open details
    card.addEventListener("click", () => {
        openDetails(opp);
    });
    
    comicGrid.appendChild(card);
}

// Update Pagination Bar
function updatePaginationControls(totalPages) {
    if (totalPages <= 1) {
        btnPrev.disabled = true;
        btnNext.disabled = true;
        pageInfo.textContent = `PAGE 1 OF ${totalPages || 1}`;
    } else {
        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;
        pageInfo.textContent = `PAGE ${currentPage} OF ${totalPages}`;
    }
}

// Open Details Modal
function openDetails(opp) {
    modalTitle.textContent = opp.title || "Opportunity Details";
    
    modalBody.innerHTML = `
        <span class="modal-field">SOLICITATION / ID</span>
        <p>${opp.sol || "N/A"}</p>
        
        <span class="modal-field">NOTICE TYPE</span>
        <p>${opp.type || "N/A"}</p>
        
        <span class="modal-field">POSTED DATE</span>
        <p>${opp.date || "N/A"}</p>
        
        <span class="modal-field">DEPARTMENT / AGENCY</span>
        <p>${opp.agency || "N/A"}</p>
        
        <span class="modal-field">OFFICE</span>
        <p>${opp.office || "N/A"}</p>
        
        <span class="modal-field">DESCRIPTION PREVIEW</span>
        <p>${opp.desc || "No description preview available."}</p>
        
        <div style="margin-top: 25px; display: flex; gap: 10px;">
            <a href="${opp.link}" target="_blank" class="btn-download" style="background: var(--comic-red); color: white;">VIEW FULL Solicitation ON SAM.GOV</a>
        </div>
    `;
    
    detailModal.style.display = "flex";
}

// Event Listeners
searchInput.addEventListener("input", applyFiltersAndRender);
filterType.addEventListener("change", applyFiltersAndRender);
filterDate.addEventListener("change", applyFiltersAndRender);

btnPrev.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

btnNext.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredOpportunities.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// Modal close triggers
btnCloseModal.addEventListener("click", () => {
    detailModal.style.display = "none";
});

window.addEventListener("click", (e) => {
    if (e.target === detailModal) {
        detailModal.style.display = "none";
    }
});

// Load everything
loadOpportunities();
