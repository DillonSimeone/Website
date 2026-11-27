let samGovData = null;
let currentPath = ["Contract Opportunities"]; // Start path
let activeSearchQuery = "";

// DOM Elements
const comicGrid = document.getElementById("comic-grid");
const searchInput = document.getElementById("search-input");
const breadcrumbsContainer = document.getElementById("breadcrumbs");
const backButton = document.getElementById("back-button");
const totalCountElement = document.getElementById("total-count");

// Fetch the crawled data
async function loadData() {
    try {
        const response = await fetch("sam_gov_data.json");
        if (!response.ok) {
            throw new Error("Failed to load JSON file");
        }
        samGovData = await response.json();
        
        // Update stats
        if (samGovData.totalFiles) {
            totalCountElement.textContent = samGovData.totalFiles.toLocaleString();
        }
        
        // Render initial view
        render();
    } catch (error) {
        console.error("Error loading sam_gov_data.json:", error);
        comicGrid.innerHTML = `
            <div class="no-results">
                <div class="no-results-title">DATABASE NOT FOUND!</div>
                <p>Please make sure to run <strong>run.bat</strong> or <strong>sam_gov_spider.py</strong> to scrape the data from SAM.gov first.</p>
            </div>
        `;
    }
}

// Traverse the tree to get the current node based on currentPath
function getCurrentNode() {
    if (!samGovData || !samGovData.tree) return null;
    
    let currentNode = samGovData.tree;
    
    // Path: ["Contract Opportunities", "daily", "historical"]
    // Note: The root is "Contract Opportunities"
    for (let i = 1; i < currentPath.length; i++) {
        const targetName = currentPath[i];
        const nextNode = currentNode.folders.find(f => f.name === targetName);
        if (nextNode) {
            currentNode = nextNode;
        } else {
            // Path broken, reset to root
            currentPath = ["Contract Opportunities"];
            return samGovData.tree;
        }
    }
    
    return currentNode;
}

// Recursive helper to search all files in the tree matching a query
function defSearch(node, query, results = []) {
    // Check files at this node
    const filesMatch = node.files.filter(f => 
        f.name.toLowerCase().includes(query) || 
        (f.description && f.description.toLowerCase().includes(query)) ||
        f.key.toLowerCase().includes(query)
    );
    
    filesMatch.forEach(f => {
        results.push({ ...f, type: "file" });
    });
    
    // Check folders
    node.folders.forEach(subFolder => {
        if (subFolder.name.toLowerCase().includes(query)) {
            results.push({
                name: subFolder.name,
                key: subFolder.key,
                type: "folder",
                description: `Folder containing files. Path: ${subFolder.key}`
            });
        }
        // Recurse into subfolders
        defSearch(subFolder, query, results);
    });
    
    return results;
}

// Render the grid and breadcrumbs
function render() {
    if (!samGovData) return;
    
    // Handle back button visibility
    if (currentPath.length > 1 && !activeSearchQuery) {
        backButton.style.display = "block";
    } else {
        backButton.style.display = "none";
    }
    
    // Render breadcrumbs
    renderBreadcrumbs();
    
    comicGrid.innerHTML = "";
    
    if (activeSearchQuery) {
        // Search Mode
        const query = activeSearchQuery.toLowerCase();
        const searchResults = defSearch(samGovData.tree, query);
        
        if (searchResults.length === 0) {
            renderEmptyState(`NO ALIGNMENT WITH "${activeSearchQuery.toUpperCase()}"`, "Try checking your spelling, or search for 'csv', 'xml', or '2023'!");
            return;
        }
        
        searchResults.forEach(item => {
            if (item.type === "folder") {
                createFolderCard(item);
            } else {
                createFileCard(item);
            }
        });
    } else {
        // Folder Navigation Mode
        const currentNode = getCurrentNode();
        if (!currentNode) return;
        
        const hasContent = (currentNode.folders && currentNode.folders.length > 0) || (currentNode.files && currentNode.files.length > 0);
        
        if (!hasContent) {
            renderEmptyState("THIS PANEL IS EMPTY!", "No files or subfolders here, dynamic crawler has nothing to report.");
            return;
        }
        
        // Render Folders first
        if (currentNode.folders) {
            currentNode.folders.forEach(sub => {
                createFolderCard({
                    name: sub.name,
                    key: sub.key,
                    type: "folder",
                    description: sub.files && sub.files.length > 0 ? `Contains ${sub.files.length} data files.` : "Contains subdirectories."
                });
            });
        }
        
        // Render Files
        if (currentNode.files) {
            currentNode.files.forEach(file => {
                createFileCard(file);
            });
        }
    }
}

// Render breadcrumbs
function renderBreadcrumbs() {
    breadcrumbsContainer.innerHTML = "";
    
    if (activeSearchQuery) {
        const item = document.createElement("span");
        item.className = "breadcrumb-item";
        item.textContent = "SEARCH RESULTS";
        breadcrumbsContainer.appendChild(item);
        return;
    }
    
    currentPath.forEach((pathName, index) => {
        const item = document.createElement("span");
        item.className = "breadcrumb-item";
        item.textContent = pathName.toUpperCase();
        item.addEventListener("click", () => {
            currentPath = currentPath.slice(0, index + 1);
            render();
        });
        breadcrumbsContainer.appendChild(item);
        
        if (index < currentPath.length - 1) {
            const sep = document.createElement("span");
            sep.className = "breadcrumb-separator";
            sep.textContent = "/";
            breadcrumbsContainer.appendChild(sep);
        }
    });
}

// Render empty state
function renderEmptyState(title, text) {
    comicGrid.innerHTML = `
        <div class="no-results">
            <div class="no-results-title">${title}</div>
            <p>${text}</p>
        </div>
    `;
}

// Create Card for Folder
function createFolderCard(folder) {
    const card = document.createElement("div");
    card.className = "comic-panel";
    
    card.innerHTML = `
        <div>
            <div class="panel-header">
                <span class="panel-type type-folder">FOLDER</span>
            </div>
            <div class="panel-title">${folder.name}</div>
            <div class="panel-desc">${folder.description || "Folder containing government extracts."}</div>
        </div>
        <div class="panel-footer">
            <span style="color: #666;">Path: ${folder.key}</span>
        </div>
    `;
    
    card.addEventListener("click", () => {
        // Find the node path in the tree
        // E.g. if key is "Contract Opportunities/daily/historical/", path is ["Contract Opportunities", "daily", "historical"]
        const parts = folder.key.split("/").filter(p => p.length > 0);
        currentPath = parts;
        searchInput.value = "";
        activeSearchQuery = "";
        render();
    });
    
    comicGrid.appendChild(card);
}

// Create Card for File
function createFileCard(file) {
    const card = document.createElement("div");
    card.className = "comic-panel";
    
    const fileFormatStr = file.fileFormat ? `<span class="file-format">${file.fileFormat}</span>` : "";
    
    card.innerHTML = `
        <div>
            <div class="panel-header">
                <span class="panel-type type-file">FILE</span>
                ${fileFormatStr}
            </div>
            <div class="panel-title">${file.name}</div>
            <div class="panel-desc">${file.description || "No description provided by SAM.gov."}</div>
        </div>
        <div>
            <div class="panel-footer" style="margin-bottom: 12px;">
                <span>MODIFIED: ${file.dateModified || "Unknown"}</span>
                <span class="file-size">${file.size}</span>
            </div>
            <a href="${file.downloadUrl}" target="_blank" class="btn-download" style="width: 100%;">DOWNLOAD EXTRACT</a>
        </div>
    `;
    
    comicGrid.appendChild(card);
}

// Event Listeners
searchInput.addEventListener("input", (e) => {
    activeSearchQuery = e.target.value.trim();
    render();
});

backButton.addEventListener("click", () => {
    if (currentPath.length > 1) {
        currentPath.pop();
        render();
    }
});

// Start the app
loadData();
