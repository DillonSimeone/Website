// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
    renderWorkspace();
});

async function loadSidebar() {
    const container = document.getElementById('sidebar-container');
    if (!container) return;

    try {
        const response = await fetch('tags/manifest.json');
        const manifest = await response.json();

        for (let i = 0; i < manifest.length; i++) {
            const catId = manifest[i];
            const catResponse = await fetch(`tags/${catId}.json`);
            const catData = await catResponse.json();
            renderCategory(catData, container, i === 0);
        }
    } catch (err) {
        console.error("Error loading sidebar:", err);
    }
}

function renderCategory(data, container, shouldOpen = false) {
    const spoiler = document.createElement('div');
    spoiler.className = `spoiler ${shouldOpen ? 'open' : ''}`;
    spoiler.id = data.id;

    const header = document.createElement('div');
    header.className = 'spoiler-header';
    header.onclick = () => toggleSpoiler(data.id);
    header.innerHTML = `
        <span class="spoiler-title">${data.title}</span>
        <span class="spoiler-icon">▼</span>
    `;

    const content = document.createElement('div');
    content.className = 'spoiler-content';

    const tagGrid = document.createElement('div');
    tagGrid.className = 'category-tags';

    data.tags.forEach(tag => {
        const tagDiv = document.createElement('div');
        tagDiv.className = `quick-tag ${tag.classes.join(' ')}`;
        tagDiv.setAttribute('data-tag', tag.id);
        tagDiv.innerText = tag.label;
        tagDiv.onclick = () => toggleTag(tag.id, tagDiv);
        tagGrid.appendChild(tagDiv);
    });

    content.appendChild(tagGrid);
    spoiler.appendChild(header);
    spoiler.appendChild(content);
    container.appendChild(spoiler);
}

// --- STATE ---
let activeTags = []; // Store objects now: { name, count }
const DEFAULT_NEGATIVE = "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, score_6, score_5, score_4";

// --- DOM ELEMENTS ---
const tagSearch = document.getElementById('tagSearch');
const suggestions = document.getElementById('suggestions');
const workspace = document.getElementById('workspace');
const finalNegative = document.getElementById('finalNegative');
const copyPromptBtn = document.getElementById('copyPromptBtn');
const copyNegBtn = document.getElementById('copyNegBtn');
const loadNegBtn = document.getElementById('loadNegBtn');
const negativeSection = document.getElementById('negativeSection');

// --- API FETCHING ---
let debounceTimer;
if (tagSearch) {
    tagSearch.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        clearTimeout(debounceTimer);
        if (query.length < 2) {
            suggestions.style.display = 'none';
            return;
        }
        debounceTimer = setTimeout(() => fetchTags(query), 400);
    });
}

async function fetchTags(query) {
    try {
        const url = `https://danbooru.donmai.us/tags.json?search[name_matches]=*${query}*&limit=15&only=name,post_count`;
        const response = await fetch(url);
        const data = response.ok ? await response.json() : [];
        showSuggestions(data);
    } catch (err) {
        console.error("Fetch Error:", err);
    }
}

async function getTagCount(tagName) {
    try {
        const url = `https://danbooru.donmai.us/tags.json?search[name]=${tagName}&only=post_count`;
        const response = await fetch(url);
        const data = await response.json();
        return data.length > 0 ? data[0].post_count : 0;
    } catch (err) {
        return 0;
    }
}

function showSuggestions(tags) {
    if (!suggestions) return;
    suggestions.innerHTML = '';
    if (tags.length === 0) {
        suggestions.style.display = 'none';
        return;
    }
    tags.forEach(tag => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<span>${tag.name.replace(/_/g, ' ')}</span> <small style="opacity:0.5; font-size: 0.7rem;">(${tag.post_count})</small>`;
        div.onclick = () => {
            toggleTag(tag.name, tag.post_count);
            tagSearch.value = '';
            suggestions.style.display = 'none';
        };
        suggestions.appendChild(div);
    });
    suggestions.style.display = 'block';
}

// --- CORE LOGIC ---
async function toggleTag(tagName, countOrElement = null) {
    const index = activeTags.findIndex(t => t.name === tagName);

    if (index > -1) {
        activeTags.splice(index, 1);
    } else {
        let count = null;

        if (typeof countOrElement === 'number') {
            count = countOrElement;
        } else if (countOrElement && countOrElement.classList) {
            // If passed 'this' (element) from sidebar, check classes to preserve color coding
            if (countOrElement.classList.contains('tag-popular')) count = 200000;
            else if (countOrElement.classList.contains('tag-uncommon')) count = 50000;
            else if (countOrElement.classList.contains('tag-rare')) count = 100;
        }

        // If count still null, fetch from API
        if (count === null) {
            count = await getTagCount(tagName);
        }
        activeTags.push({ name: tagName, count: count });
    }

    renderWorkspace();
    updateSidebarHighlights();
}

function removeTag(tagName) {
    activeTags = activeTags.filter(t => t.name !== tagName);
    renderWorkspace();
    updateSidebarHighlights();
}

function clearAll() {
    activeTags = [];
    renderWorkspace();
    updateSidebarHighlights();
}

function renderWorkspace() {
    if (!workspace) return;
    workspace.innerHTML = '';
    activeTags.forEach((tag, index) => {
        const chip = document.createElement('div');
        chip.className = `tag-chip ${getColorClass(tag.count)}`;
        chip.draggable = true;
        chip.dataset.index = index;

        chip.innerHTML = `${tag.name.replace(/_/g, ' ')} <span class="remove" onclick="event.stopPropagation(); removeTag('${tag.name}')">&times;</span>`;

        // Drag events
        chip.addEventListener('dragstart', handleDragStart);
        chip.addEventListener('dragover', handleDragOver);
        chip.addEventListener('drop', handleDrop);
        chip.addEventListener('dragend', handleDragEnd);

        workspace.appendChild(chip);
    });
}

function getColorClass(count) {
    // Corrected thresholds based on user request:
    // Popular: >= 100,000
    // Uncommon: >= 10,000
    // Rare: > 0
    if (count >= 100000) return 'tag-popular';
    if (count >= 10000) return 'tag-uncommon';
    if (count > 0) return 'tag-rare';
    return '';
}

function updateSidebarHighlights() {
    document.querySelectorAll('.quick-tag').forEach(el => {
        const tag = el.getAttribute('data-tag');
        if (activeTags.some(t => t.name === tag)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

// --- DRAG AND DROP ---
let dragSrcIndex = null;

function handleDragStart(e) {
    dragSrcIndex = this.dataset.index;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    e.stopPropagation();
    const targetIndex = this.dataset.index;

    if (dragSrcIndex !== targetIndex) {
        const movedTag = activeTags.splice(dragSrcIndex, 1)[0];
        activeTags.splice(targetIndex, 0, movedTag);
        renderWorkspace();
    }
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
}

// --- UI COMPONENTS ---
function toggleSpoiler(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.classList.contains('open');

    if (isOpen) return; // PROMPT REQ: Don't allow closing manually, only by opening another
    // Close others
    document.querySelectorAll('.spoiler').forEach(s => s.classList.remove('open'));
    el.classList.add('open');
}

function toggleNegative() {
    const isHidden = negativeSection.style.display === 'none';
    negativeSection.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        finalNegative.innerText = DEFAULT_NEGATIVE;
    }
}

if (loadNegBtn) loadNegBtn.onclick = toggleNegative;

// --- ACTIONS ---
if (copyPromptBtn) {
    copyPromptBtn.onclick = () => {
        const text = activeTags.map(t => t.name).join(', ');
        if (!text) return;
        copyToClipboard(text, copyPromptBtn);
    };
}

if (copyNegBtn) {
    copyNegBtn.onclick = () => {
        copyToClipboard(finalNegative.innerText, copyNegBtn);
    };
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<span style="color:var(--neon-cyan)">COPIED!</span>';
        setTimeout(() => {
            btn.innerHTML = originalContent;
        }, 1500);
    });
}

// Close dropdown on click outside
document.addEventListener('click', (e) => {
    if (tagSearch && !tagSearch.contains(e.target) && suggestions && !suggestions.contains(e.target)) {
        suggestions.style.display = 'none';
    }
});

