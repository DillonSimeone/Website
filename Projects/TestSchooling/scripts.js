// ─── STATE & DOM REFERENCES ──────────────────────────────────────────────────
const authOverlay = document.getElementById("auth-overlay");
const authForm = document.getElementById("auth-form");
const authInput = document.getElementById("auth-input");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authError = document.getElementById("auth-error");

const docTitle = document.getElementById("doc-title");
const orgBadge = document.getElementById("org-badge");
const appTitle = document.getElementById("app-title");
const appSubtitle = document.getElementById("app-subtitle");
const mobileTitle = document.getElementById("mobile-title");

const navSections = document.getElementById("nav-sections");
const sectionBadge = document.getElementById("section-badge");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const lockBtn = document.getElementById("lock-btn");

const readingWell = document.querySelector(".reading-well");
const documentContent = document.getElementById("document-content");

let activeCatalog = null;
let allCatalogItems = [];
let activeIndex = 0;
let isLoading = false;

// ─── AES-256-GCM WEBCRYPTO DECRYPTOR ─────────────────────────────────────────
async function decryptCatalog(base64Ciphertext, password) {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Decode base64 to byte buffer
    const binaryString = atob(base64Ciphertext);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);

    // Derive AES-GCM 256-bit key from password via PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 10000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    // Decrypt data with AES-GCM
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext
    );

    const jsonString = dec.decode(decryptedBuffer);
    return JSON.parse(jsonString);
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

// ─── AUTHENTICATION & UNLOCK CONTROLLER ─────────────────────────────────────
async function attemptUnlock(passkey) {
    const cleanPassword = (passkey || "").trim().toLowerCase();
    if (!cleanPassword) return;

    authSubmitBtn.disabled = true;
    authSubmitBtn.querySelector("span").textContent = "Decrypting...";
    authError.classList.remove("visible");

    try {
        const res = await fetch("catalog.enc");
        if (!res.ok) throw new Error("Could not fetch encrypted catalog file.");
        const encryptedData = await res.text();

        const catalog = await decryptCatalog(encryptedData, cleanPassword);
        
        // Save validated password in session storage for frictionless reloads
        sessionStorage.setItem("curriculum_vault_pass", cleanPassword);

        // Mount decrypted application state
        mountDecryptedCatalog(catalog);

        // Smoothly dismiss overlay
        authOverlay.classList.add("hidden");
        authInput.value = "";
    } catch (err) {
        console.error("Decryption failed:", err);
        authError.textContent = "Incorrect password. Access denied.";
        authError.classList.remove("visible");
        void authError.offsetWidth; // Force re-flow for shake animation
        authError.classList.add("visible");
        authInput.select();
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.querySelector("span").textContent = "Unlock & Decrypt";
    }
}

// Lock session handler
function lockSession() {
    sessionStorage.removeItem("curriculum_vault_pass");
    activeCatalog = null;
    allCatalogItems = [];
    documentContent.innerHTML = "";
    navSections.innerHTML = "";
    authOverlay.classList.remove("hidden");
    authInput.value = "";
    authError.classList.remove("visible");
    setTimeout(() => authInput.focus(), 200);
}

// ─── BUILD UI FROM DECRYPTED CATALOG ─────────────────────────────────────────
function mountDecryptedCatalog(catalog) {
    activeCatalog = catalog;
    allCatalogItems = [];

    // Update branding headers
    if (docTitle && catalog.title) docTitle.textContent = catalog.title;
    if (orgBadge && catalog.orgBadge) orgBadge.textContent = catalog.orgBadge;
    if (appTitle && catalog.mainTitle) appTitle.textContent = catalog.mainTitle;
    if (appSubtitle && catalog.subtitle) appSubtitle.textContent = catalog.subtitle;
    if (mobileTitle && catalog.mainTitle) mobileTitle.textContent = catalog.mainTitle;

    // Build sidebar navigation DOM
    navSections.innerHTML = "";
    let itemCounter = 0;

    catalog.groups.forEach(group => {
        const groupEl = document.createElement("div");
        groupEl.className = "nav-group";

        const titleEl = document.createElement("h3");
        titleEl.textContent = group.name;
        groupEl.appendChild(titleEl);

        group.items.forEach(item => {
            const index = itemCounter++;
            allCatalogItems.push(item);

            const a = document.createElement("a");
            a.href = "#";
            a.className = "nav-item" + (index === 0 ? " active" : "");
            a.dataset.index = index;

            const numSpan = document.createElement("span");
            numSpan.className = "num";
            numSpan.textContent = item.num;

            const labelSpan = document.createElement("span");
            labelSpan.className = "label";
            labelSpan.textContent = item.label;

            a.appendChild(numSpan);
            a.appendChild(labelSpan);

            a.addEventListener("click", (e) => {
                e.preventDefault();
                displayDocument(index);
            });

            groupEl.appendChild(a);
        });

        navSections.appendChild(groupEl);
    });

    // Display initial document
    displayDocument(0);
}

// ─── DOCUMENT READER CONTROLLER ─────────────────────────────────────────────
function displayDocument(targetIndex) {
    if (isLoading || !allCatalogItems[targetIndex]) return;
    isLoading = true;
    activeIndex = targetIndex;

    const item = allCatalogItems[targetIndex];

    // Fade out active document
    documentContent.classList.add("loading");

    setTimeout(() => {
        documentContent.innerHTML = parseMarkdown(item.content);

        if (readingWell) {
            readingWell.scrollTop = 0;
        }

        documentContent.classList.remove("loading");
        updateActiveNav(targetIndex);
        isLoading = false;
    }, 180);
}

function updateActiveNav(targetIndex) {
    const navLinks = navSections.querySelectorAll(".nav-item");
    navLinks.forEach((link, idx) => {
        link.classList.toggle("active", idx === targetIndex);
    });

    if (navLinks[targetIndex]) {
        navLinks[targetIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    const currentItem = allCatalogItems[targetIndex];
    if (currentItem && currentItem.file.includes("LESSON_PLANS")) {
        const matches = currentItem.file.match(/LP-(\d+)/);
        if (matches) {
            sectionBadge.textContent = `${matches[1]} / 12`;
        } else {
            sectionBadge.textContent = `Lesson`;
        }
    } else {
        sectionBadge.textContent = `Framework`;
    }

    prevBtn.disabled = activeIndex === 0;
    nextBtn.disabled = activeIndex === allCatalogItems.length - 1;
}

// ─── MOBILE DRAWER SETUP ────────────────────────────────────────────────────
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
}

// Close drawer on nav item click
navSections.addEventListener("click", (e) => {
    if (e.target.closest(".nav-item")) {
        sidebar.classList.remove("open");
        backdrop.classList.remove("active");
    }
});

// ─── EVENT LISTENERS ────────────────────────────────────────────────────────
authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    attemptUnlock(authInput.value);
});

lockBtn.addEventListener("click", () => {
    lockSession();
});

prevBtn.addEventListener("click", () => {
    if (activeIndex > 0 && !isLoading) {
        displayDocument(activeIndex - 1);
    }
});

nextBtn.addEventListener("click", () => {
    if (activeIndex < allCatalogItems.length - 1 && !isLoading) {
        displayDocument(activeIndex + 1);
    }
});

// ─── BOOTSTRAP CHECK ────────────────────────────────────────────────────────
// Check if user previously authenticated in this browser session
const savedPassword = sessionStorage.getItem("curriculum_vault_pass");
if (savedPassword) {
    attemptUnlock(savedPassword);
} else {
    setTimeout(() => authInput.focus(), 150);
}
