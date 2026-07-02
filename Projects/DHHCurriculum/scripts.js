// ─── STATE & ELEMENT SELECTORS ────────────────────────────────────────────────
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const sectionBadge = document.getElementById("section-badge");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

const readingWell = document.querySelector(".reading-well");
const documentContent = document.getElementById("document-content");

let activeIndex = 0;
let isLoading = false;

// ─── MOBILE COLLAPSIBLE DRAWER WIRING ───────────────────────────────────────
const backdrop = document.createElement("div");
backdrop.className = "sidebar-backdrop";
document.body.appendChild(backdrop);

const menuBtn = document.getElementById("menu-btn");
const sidebar = document.getElementById("sidebar");

if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        backdrop.classList.toggle("active");
    });
    
    backdrop.addEventListener("click", () => {
        sidebar.classList.remove("open");
        backdrop.classList.remove("active");
    });
    
    // Auto-close drawer when selecting any navigation link
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            sidebar.classList.remove("open");
            backdrop.classList.remove("active");
        });
    });
}

// ─── CUSTOM HIGH-SPEED MARKDOWN COMPILER ─────────────────────────────────────
function parseMarkdown(md) {
    let html = md;
    
    // Protect raw tags by escaping HTML
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Headers
    html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");
    html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
    html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
    
    // Bold & inline highlights
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/`(.*?)`/g, "<code>$1</code>");
    
    // High-contrast Anchor Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:var(--accent); text-decoration:underline;">$1</a>');
    
    // Table Parser
    const lines = html.split("\n");
    let inTable = false;
    let tableHtml = "";
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("|")) {
            if (!inTable) {
                inTable = true;
                tableHtml = "<table>";
            }
            const cells = line.split("|").slice(1, -1).map(c => c.trim());
            // Skip divider rows
            if (cells.every(c => c.startsWith("-"))) {
                continue;
            }
            const tag = tableHtml.includes("<th>") ? "td" : "th";
            tableHtml += "<tr>" + cells.map(c => `<${tag}>${c}</${tag}>`).join("") + "</tr>";
        } else {
            if (inTable) {
                tableHtml += "</table>";
                newLines.push(tableHtml);
                inTable = false;
                tableHtml = "";
            }
            newLines.push(lines[i]);
        }
    }
    if (inTable) {
        tableHtml += "</table>";
        newLines.push(tableHtml);
    }
    html = newLines.join("\n");
    
    // Bullet Lists
    html = html.replace(/^[\-\*] (.*?)$/gm, "<li>$1</li>");
    let inList = false;
    const lines2 = html.split("\n");
    const finalLines = [];
    for (let i = 0; i < lines2.length; i++) {
        const line = lines2[i].trim();
        if (line.startsWith("<li>")) {
            if (!inList) {
                finalLines.push("<ul>");
                inList = true;
            }
            finalLines.push(line);
        } else {
            if (inList) {
                finalLines.push("</ul>");
                inList = false;
            }
            finalLines.push(lines2[i]);
        }
    }
    if (inList) finalLines.push("</ul>");
    html = finalLines.join("\n");
    
    // Block Paragraph Packaging
    const blocks = html.split("\n\n");
    const parsedBlocks = blocks.map(b => {
        const trimmed = b.trim();
        if (!trimmed) return b;
        if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<ol") || trimmed.startsWith("<table") || trimmed.startsWith("<tr") || trimmed.startsWith("<ul>")) {
            return b;
        }
        return `<p>${trimmed}</p>`;
    });
    
    return parsedBlocks.join("\n\n");
}

// ─── DOCUMENT FETCH & LOAD CONTROLLER ────────────────────────────────────────
function loadDocument(fileUrl, targetIndex) {
    if (isLoading) return;
    isLoading = true;
    
    // Fade out active content smoothly
    documentContent.classList.add("loading");
    
    fetch(fileUrl)
        .then(res => {
            if (!res.ok) throw new Error("Document file could not be retrieved.");
            return res.text();
        })
        .then(md => {
            const compiledHtml = parseMarkdown(md);
            
            // Wait brief moment for fade out animation to finish before updating content
            setTimeout(() => {
                documentContent.innerHTML = compiledHtml;
                
                // Scroll reader container cleanly back to top
                if (readingWell) {
                    readingWell.scrollTop = 0;
                }
                
                // Fade back in
                documentContent.classList.remove("loading");
                updateActiveNav(targetIndex);
                isLoading = false;
            }, 220);
        })
        .catch(err => {
            console.error(err);
            setTimeout(() => {
                documentContent.innerHTML = `<h1>Error Retrieving Section</h1><p>The catalog file could not be retrieved from: <code>${fileUrl}</code></p>`;
                documentContent.classList.remove("loading");
                isLoading = false;
            }, 220);
        });
}

// ─── NAVIGATION SYNC ────────────────────────────────────────────────────────
function updateActiveNav(targetIndex) {
    activeIndex = targetIndex;
    navItems.forEach((item, idx) => {
        item.classList.toggle("active", idx === targetIndex);
    });
    
    // Keep active list item in view inside scrollable sidebar
    navItems[targetIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
    
    // Badge formatting: Lesson Index vs Research Framework Papers
    const file = navItems[targetIndex].dataset.file;
    if (file.includes("LESSON_PLANS")) {
        const matches = file.match(/LP-(\d+)/);
        if (matches) {
            sectionBadge.textContent = `${matches[1]} / 12`;
        }
    } else {
        sectionBadge.textContent = `Framework`;
    }
    
    // Footer button disable states
    prevBtn.disabled = activeIndex === 0;
    nextBtn.disabled = activeIndex === navItems.length - 1;
}

// Bind navigation click event listeners
navItems.forEach((item, idx) => {
    item.addEventListener("click", (e) => {
        e.preventDefault();
        if (idx === activeIndex || isLoading) return;
        loadDocument(item.dataset.file, idx);
    });
});

prevBtn.addEventListener("click", () => {
    if (activeIndex > 0 && !isLoading) {
        const prevIdx = activeIndex - 1;
        loadDocument(navItems[prevIdx].dataset.file, prevIdx);
    }
});

nextBtn.addEventListener("click", () => {
    if (activeIndex < navItems.length - 1 && !isLoading) {
        const nextIdx = activeIndex + 1;
        loadDocument(navItems[nextIdx].dataset.file, nextIdx);
    }
});

// ─── INITIAL APP LOAD ────────────────────────────────────────────────────────
// Load initial Curriculum Map on boot
fetch("CURRICULUM_MAP.md")
    .then(res => res.text())
    .then(md => {
        documentContent.innerHTML = parseMarkdown(md);
        updateActiveNav(0);
    })
    .catch(err => {
        console.error(err);
        documentContent.innerHTML = `<h1>Sonic Agency Framework</h1><p>Curriculum Map ready. Select any framework paper or lesson plan from the menu to begin.</p>`;
    });
