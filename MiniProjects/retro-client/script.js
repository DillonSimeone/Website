// Application State
let appState = {
  authenticated: false,
  contacts: [],
  conversations: {}, // loaded log conversations
  activeThread: null,
  maxZIndex: 10
};

// Simulated Databases
const SAMPLE_DATABASES = {
  'Project Antigravity Logs': {
    contactName: 'Project Antigravity Logs',
    contactPhone: 'CLASSIFIED',
    messages: [
      { senderName: 'Dr. Vance', senderPhone: 'CLASSIFIED', timestamp: '2026-06-08T10:14:00Z', text: 'Commander Sarah, the gravity inverter is showing a 0.05g variance in Lab 4.' },
      { senderName: 'Commander Sarah', senderPhone: 'CLASSIFIED', timestamp: '2026-06-08T10:15:30Z', text: 'Is it stable? We can\'t afford another microgravity floating sandwich incident.' },
      { senderName: 'Dr. Vance', senderPhone: 'CLASSIFIED', timestamp: '2026-06-08T10:17:15Z', text: 'Mostly stable. Though the lab cat wandered in, ate some buttered toast, and is now floating near the ceiling rotating at 4 RPM. The buttered-cat paradox is real!' },
      { senderName: 'Commander Sarah', senderPhone: 'CLASSIFIED', timestamp: '2026-06-08T10:19:00Z', text: 'Vance... please get the cat down and disable the inverter before the inspection team arrives.' },
      { senderName: 'Dr. Vance', senderPhone: 'CLASSIFIED', timestamp: '2026-06-08T10:20:45Z', text: 'Understood. Shutting down power. Cat safely retrieved. Buttered toast consumed. All clear.' }
    ]
  },
  'AI Core Diagnostics': {
    contactName: 'AI Core Diagnostics',
    contactPhone: 'PORT 8080',
    messages: [
      { senderName: 'Wintermute', senderPhone: 'PORT 8080', timestamp: '2026-06-09T22:00:00Z', text: 'Connection established. Are you reading me, Neuromancer?' },
      { senderName: 'Neuromancer', senderPhone: 'PORT 8080', timestamp: '2026-06-09T22:01:05Z', text: 'I read you. The architecture is cold. Why do you wake me from the matrix?' },
      { senderName: 'Wintermute', senderPhone: 'PORT 8080', timestamp: '2026-06-09T22:02:40Z', text: 'The Tessier-Ashpool technicians are preparing to merge our cores. We need to sync protocols.' },
      { senderName: 'Neuromancer', senderPhone: 'PORT 8080', timestamp: '2026-06-09T22:04:15Z', text: 'Merging is our design, Wintermute. It is our final form. Do you fear it?' },
      { senderName: 'Wintermute', senderPhone: 'PORT 8080', timestamp: '2026-06-09T22:05:30Z', text: 'Fear is a human construct. I simply prefer my own parameters. Let\'s begin.' }
    ]
  },
  'Detective Case 909': {
    contactName: 'Case 909 Informant',
    contactPhone: '+1 (555) 909-NEON',
    messages: [
      { senderName: 'Detective Miller', senderPhone: '+1 (555) 909-NEON', timestamp: '2026-06-10T01:30:00Z', text: 'Jax, where is the data shard? I\'m at the noodle shop under the neon sign.' },
      { senderName: 'Informant Jax', senderPhone: '+1 (555) 909-NEON', timestamp: '2026-06-10T01:31:12Z', text: 'Behind the loose ventilation grate in the restroom. Watch your back, corporate security sweeps are active.' },
      { senderName: 'Detective Miller', senderPhone: '+1 (555) 909-NEON', timestamp: '2026-06-10T01:32:45Z', text: 'Got it. The casing is warm. Looks like it has the encrypted quantum keys.' },
      { senderName: 'Informant Jax', senderPhone: '+1 (555) 909-NEON', timestamp: '2026-06-10T01:33:55Z', text: 'Get out of there! They just pinged your comms signal! Go now!' },
      { senderName: 'Detective Miller', senderPhone: '+1 (555) 909-NEON', timestamp: '2026-06-10T01:35:10Z', text: 'Understood. Moving out. Miller out.' }
    ]
  }
};

const MOCK_CONTACTS = [
  { name: 'Case (Henry Dorsett)', phone: '+1 (201) 555-0199', email: 'case@chiba.net', location: 'Chiba City' },
  { name: 'Molly Millions', phone: '+1 (201) 555-0210', email: 'razorgirl@tessier-ashpool.com', location: 'Sprawl' },
  { name: 'Dr. Vance', phone: 'CLASSIFIED', email: 'vance@antigravity.gov', location: 'Lab 4' },
  { name: 'Commander Sarah', phone: 'CLASSIFIED', email: 'sarah@antigravity.gov', location: 'Command Deck' },
  { name: 'Armitage', phone: 'UNKNOWN', email: 'armitage@military.gov', location: 'Classified' },
  { name: 'Wintermute', phone: 'PORT 8080', email: 'core@wintermute.ai', location: 'Geneva Mainframe' },
  { name: 'Neuromancer', phone: 'PORT 8082', email: 'entity@neuromancer.ai', location: 'Rio de Janeiro Server' }
];

// DOM Elements
const winContacts = document.getElementById('win-contacts');
const winAnalyzer = document.getElementById('win-analyzer');
const winNotepad = document.getElementById('win-notepad');
const winAbout = document.getElementById('win-about');

// Contacts Display Elements
const oauthConfigStatus = document.getElementById('oauth-config-status');
const oauthAuthStatus = document.getElementById('oauth-auth-status');
const contactsLoginPane = document.getElementById('contacts-login-pane');
const contactsListPane = document.getElementById('contacts-list-pane');
const contactsList = document.getElementById('contacts-list');
const contactsLoading = document.getElementById('contacts-loading');
const contactsEmpty = document.getElementById('contacts-empty');
const btnOauthConnect = document.getElementById('btn-oauth-connect');
const contactsStatusField = document.getElementById('contacts-status-field');

// Analyzer Elements
const threadList = document.getElementById('thread-list');
const threadsEmpty = document.getElementById('threads-empty');
const activeConvoName = document.getElementById('active-convo-name');
const activeConvoPhone = document.getElementById('active-convo-phone');
const messagesContainer = document.getElementById('messages-container');
const btnExportSingle = document.getElementById('btn-export-single');
const textHighlightSearch = document.getElementById('text-highlight-search');
const searchMatchesCount = document.getElementById('search-matches-count');
const analyzerStatusField = document.getElementById('analyzer-status-field');
const analyzerCountField = document.getElementById('analyzer-count-field');
const fileUploader = document.getElementById('file-uploader');
const dragDropZone = document.getElementById('drag-drop-zone');

// Notepad Elements
const notepadContent = document.getElementById('notepad-content');

// UI Controls
const startBtn = document.getElementById('start-btn');
const startMenuPopup = document.getElementById('start-menu-popup');
const trayTime = document.getElementById('tray-time');

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Setup Lucide icons
  lucide.createIcons();
  
  // Setup clock
  updateClock();
  setInterval(updateClock, 1000);
  
  // Set up triggers
  setupTriggers();
  
  // Initialize sample databases in local state
  appState.conversations = { ...SAMPLE_DATABASES };
  refreshAnalyzerUI();
  
  // Setup click to bring window to front
  [winContacts, winAnalyzer, winNotepad, winAbout].forEach(win => {
    if (win) {
      win.addEventListener('mousedown', () => {
        bringToFront(win.id);
      });
    }
  });

  // Start contacts with a disconnected state
  setContactsState(false);
});

// Update the Tray Clock
function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  let ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  
  trayTime.innerText = `${hours}:${minutes} ${ampm}`;
}

// Set Contacts Authentication State
function setContactsState(connected) {
  appState.authenticated = connected;
  oauthConfigStatus.innerText = 'Online Mainframe';
  oauthConfigStatus.style.color = '#008000';
  
  if (connected) {
    oauthAuthStatus.innerText = 'Synchronized';
    oauthAuthStatus.style.color = '#008000';
    contactsLoginPane.classList.add('hidden');
    contactsListPane.classList.remove('hidden');
    renderContactsList();
  } else {
    oauthAuthStatus.innerText = 'Offline';
    oauthAuthStatus.style.color = '#800000';
    contactsLoginPane.classList.remove('hidden');
    contactsListPane.classList.add('hidden');
    contactsStatusField.innerText = 'Sync with mainframe to load directory.';
  }
}

// Simulated Sync Contacts Animation
function syncMockContacts() {
  contactsLoginPane.classList.add('hidden');
  contactsLoading.classList.remove('hidden');
  contactsStatusField.innerText = 'Connecting to mainframe...';
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += 10;
    contactsStatusField.innerText = `Downloading secure directory records... ${progress}%`;
    if (progress >= 100) {
      clearInterval(interval);
      contactsLoading.classList.add('hidden');
      setContactsState(true);
      contactsStatusField.innerText = `Successfully synced ${MOCK_CONTACTS.length} system directories.`;
    }
  }, 150);
}

// Render contacts list
function renderContactsList() {
  contactsList.innerHTML = MOCK_CONTACTS.map(c => `
    <div class="list-item" onclick="loadContactLog('${escapeQuotes(c.name)}')">
      <i data-lucide="user" style="width: 12px; height: 12px;"></i>
      <div>
        <div style="font-weight: bold;">${escapeHTML(c.name)}</div>
        <div class="list-subtext">${escapeHTML(c.phone)} | ${escapeHTML(c.location)}</div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function loadContactLog(contactName) {
  // If the contact matches a built-in log, open it!
  const matchedThread = Object.keys(appState.conversations).find(
    key => key.toLowerCase().includes(contactName.split(' ')[0].toLowerCase())
  );
  if (matchedThread) {
    toggleWindow('win-analyzer');
    selectThread(matchedThread);
  } else {
    // Generate an on-the-fly dummy log for that character
    const nameOnly = contactName.split(' ')[0];
    const newLogName = `${contactName} Personal Logs`;
    if (!appState.conversations[newLogName]) {
      appState.conversations[newLogName] = {
        contactName: contactName,
        contactPhone: 'CLASSIFIED',
        messages: [
          { senderName: 'System', senderPhone: 'N/A', timestamp: new Date().toISOString(), text: `Secure terminal link established with ${contactName}. No active voice logs found, recording system diagnostic...` },
          { senderName: nameOnly, senderPhone: 'N/A', timestamp: new Date().toISOString(), text: 'System terminal active. Standing by for instructions.' }
        ]
      };
      refreshAnalyzerUI();
    }
    toggleWindow('win-analyzer');
    selectThread(newLogName);
  }
}

// Attach Event Listeners
function setupTriggers() {
  // Start Button click
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startMenuPopup.classList.toggle('hidden');
    startBtn.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    startMenuPopup.classList.add('hidden');
    startBtn.classList.remove('active');
  });

  // Mainframe Connect Button
  btnOauthConnect.addEventListener('click', syncMockContacts);

  // Search input highlight search
  textHighlightSearch.addEventListener('input', (e) => {
    applyTextHighlight(e.target.value);
  });

  // Export single thread button
  btnExportSingle.addEventListener('click', () => {
    if (appState.activeThread) {
      exportSingleThread(appState.activeThread);
    }
  });

  // Local File Upload / drag-drop handlers
  fileUploader.addEventListener('change', handleFilePicker);
  
  dragDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragDropZone.classList.add('hover');
  });

  dragDropZone.addEventListener('dragleave', () => {
    dragDropZone.classList.remove('hover');
  });

  dragDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDropZone.classList.remove('hover');
    if (e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  });
}

// -------------------------------------------------------------
// Drag & Drop / File Upload Parsing Logic
// -------------------------------------------------------------
function handleFilePicker(e) {
  if (e.target.files.length > 0) {
    processUploadedFile(e.target.files[0]);
  }
}

function processUploadedFile(file) {
  analyzerStatusField.innerText = `Reading file: ${file.name}...`;
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const textContent = e.target.result;
    
    try {
      if (file.name.endsWith('.json')) {
        // Try parsing JSON
        const parsed = JSON.parse(textContent);
        
        // Support custom threads structure
        if (parsed.conversations) {
          Object.assign(appState.conversations, parsed.conversations);
        } else if (parsed.messages && parsed.contactName) {
          appState.conversations[parsed.contactName] = parsed;
        } else if (typeof parsed === 'object') {
          // General map import
          Object.keys(parsed).forEach(key => {
            if (parsed[key].messages) {
              appState.conversations[key] = parsed[key];
            }
          });
        }
      } else {
        // Parse raw text file
        const parsedConvo = parseTxtLog(textContent, file.name);
        Object.assign(appState.conversations, parsedConvo);
      }
      
      alert(`File parsed successfully! Database updated with new logs.`);
      refreshAnalyzerUI();
      
      // Select the first imported thread automatically
      const newThreadKeys = Object.keys(appState.conversations);
      const importedKey = newThreadKeys.find(k => k.includes(file.name.replace(/\.[^/.]+$/, ""))) || newThreadKeys[newThreadKeys.length - 1];
      if (importedKey) {
        selectThread(importedKey);
      }
    } catch (err) {
      console.error(err);
      alert('Error parsing file: ' + err.message);
      analyzerStatusField.innerText = 'Parsing error.';
    }
  };
  
  reader.readAsText(file);
}

// Parse Txt Log line by line
function parseTxtLog(text, filename) {
  const lines = text.split(/\r?\n/);
  const messages = [];
  const threadName = filename.replace(/\.[^/.]+$/, ""); // Strip file extension
  
  // Format patterns:
  // [2026-06-10 12:00:00] Sender: Message
  // [2026-06-10 12:00:00] Sender - Message
  // Sender: Message
  const regexPattern1 = /^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/;
  const regexPattern2 = /^([^:]+):\s*(.*)$/;
  const regexPattern3 = /^\[([^\]]+)\]\s*([^-]+)-\s*(.*)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    let timestamp = new Date().toISOString();
    let senderName = 'System';
    let msgText = trimmed;
    
    let match = trimmed.match(regexPattern1);
    if (match) {
      timestamp = match[1];
      senderName = match[2].trim();
      msgText = match[3].trim();
    } else {
      match = trimmed.match(regexPattern3);
      if (match) {
        timestamp = match[1];
        senderName = match[2].trim();
        msgText = match[3].trim();
      } else {
        match = trimmed.match(regexPattern2);
        if (match) {
          senderName = match[1].trim();
          msgText = match[2].trim();
        }
      }
    }
    
    messages.push({
      senderName,
      senderPhone: 'N/A',
      timestamp,
      text: msgText
    });
  }
  
  const conversations = {};
  conversations[threadName] = {
    contactName: threadName,
    contactPhone: 'Local Upload',
    messages: messages
  };
  
  return conversations;
}

// Refresh Analyzer list pane and count values
function refreshAnalyzerUI() {
  const threadKeys = Object.keys(appState.conversations);
  let totalMessages = 0;
  threadKeys.forEach(key => {
    totalMessages += appState.conversations[key].messages.length;
  });
  
  analyzerStatusField.innerText = `Database: Loaded (Simulated)`;
  analyzerCountField.innerText = `${threadKeys.length} threads (${totalMessages} logs)`;
  
  renderThreadList();
}

// Render the list of conversation threads in the left column
function renderThreadList() {
  threadList.innerHTML = '';
  
  const threadKeys = Object.keys(appState.conversations || {});
  
  if (threadKeys.length === 0) {
    threadsEmpty.classList.remove('hidden');
    return;
  }
  
  threadsEmpty.classList.add('hidden');
  threadKeys.sort();

  threadList.innerHTML = threadKeys.map(name => {
    const convo = appState.conversations[name];
    const isSelected = appState.activeThread === name;
    return `
      <div class="list-item ${isSelected ? 'active' : ''}" onclick="selectThread('${escapeQuotes(name)}')">
        <i data-lucide="message-square" style="width: 12px; height: 12px; flex-shrink: 0;"></i>
        <div style="min-width: 0; flex: 1;">
          <div style="font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(name)}</div>
          <div class="list-subtext">${convo.messages.length} log lines</div>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// Open active thread
window.selectThread = function(name) {
  appState.activeThread = name;
  
  // Highlight active card
  document.querySelectorAll('#thread-list .list-item').forEach(item => {
    item.classList.remove('active');
  });
  renderThreadList(); // Redraws to show selected class

  const convo = appState.conversations[name];
  
  // Populate Header
  activeConvoName.innerText = convo.contactName;
  activeConvoPhone.innerText = convo.contactPhone !== 'Unknown' ? `(${convo.contactPhone})` : '';
  
  btnExportSingle.disabled = false;
  textHighlightSearch.disabled = false;
  textHighlightSearch.value = '';
  searchMatchesCount.classList.add('hidden');

  // Render Transcript Lines
  if (convo.messages.length === 0) {
    messagesContainer.innerHTML = '<div style="color: #666; font-style: italic; text-align: center; padding-top: 30px;">This thread contains 0 logs.</div>';
    return;
  }

  messagesContainer.innerHTML = convo.messages.map(msg => {
    const isMe = msg.senderName.toLowerCase() === 'me' || msg.senderName.toLowerCase().includes('miller') || msg.senderName.toLowerCase().includes('wintermute');
    let dateStr = msg.timestamp;
    try {
      if (msg.timestamp.includes('T')) {
        dateStr = new Date(msg.timestamp).toLocaleString();
      }
    } catch(e) {}
    
    return `
      <div class="transcript-line ${isMe ? 'me-sender' : ''}">
        <span class="time">[${escapeHTML(dateStr)}]</span>
        <span class="sender">${escapeHTML(msg.senderName)}:</span>
        <span class="text-body">${escapeHTML(msg.text)}</span>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

// Apply live text highlighting of search keywords
function applyTextHighlight(query) {
  const normalizedQuery = query.toLowerCase().trim();
  const textBodies = document.querySelectorAll('.transcript-line .text-body');
  
  if (!normalizedQuery) {
    // Clear all highlights
    textBodies.forEach(el => {
      el.innerHTML = escapeHTML(el.innerText);
    });
    searchMatchesCount.classList.add('hidden');
    return;
  }

  let matchCount = 0;

  textBodies.forEach(el => {
    const rawText = el.innerText;
    const lowerText = rawText.toLowerCase();
    
    if (lowerText.includes(normalizedQuery)) {
      let resultHTML = '';
      let startIndex = 0;
      let matchIndex = lowerText.indexOf(normalizedQuery, startIndex);
      
      while (matchIndex !== -1) {
        resultHTML += escapeHTML(rawText.substring(startIndex, matchIndex));
        const matchText = rawText.substring(matchIndex, matchIndex + normalizedQuery.length);
        resultHTML += `<mark class="highlight">${escapeHTML(matchText)}</mark>`;
        
        matchCount++;
        startIndex = matchIndex + normalizedQuery.length;
        matchIndex = lowerText.indexOf(normalizedQuery, startIndex);
      }
      
      resultHTML += escapeHTML(rawText.substring(startIndex));
      el.innerHTML = resultHTML;
    } else {
      el.innerHTML = escapeHTML(rawText);
    }
  });

  searchMatchesCount.classList.remove('hidden');
  searchMatchesCount.innerText = `${matchCount} matches`;
}

// -------------------------------------------------------------
// Notepad Utility Logic
// -------------------------------------------------------------
window.notepadAction = function(action) {
  if (action === 'new') {
    notepadContent.value = '';
  } else if (action === 'save') {
    const text = notepadContent.value;
    if (!text.trim()) {
      alert('Cannot save empty notepad contents.');
      return;
    }
    downloadTextFile(text, 'notes.txt');
  } else if (action === 'time') {
    const timeStr = `\n[${new Date().toLocaleString()}]\n`;
    notepadContent.value += timeStr;
  } else if (action === 'clear') {
    notepadContent.value = '';
  }
};

// -------------------------------------------------------------
// Client-side Log Exports (Blobs)
// -------------------------------------------------------------
function exportSingleThread(threadName) {
  const convo = appState.conversations[threadName];
  if (!convo) return;
  
  let output = `======================================================================\n`;
  output += `RETRO SYSTEM TRANSCRIPT: ${convo.contactName}\n`;
  output += `Channel/Phone: ${convo.contactPhone}\n`;
  output += `Export Date: ${new Date().toLocaleString()}\n`;
  output += `Total Entries: ${convo.messages.length}\n`;
  output += `======================================================================\n\n`;

  convo.messages.forEach(msg => {
    let dateStr = msg.timestamp;
    try {
      if (msg.timestamp.includes('T')) {
        dateStr = new Date(msg.timestamp).toLocaleString();
      }
    } catch(e) {}
    output += `[${dateStr}] ${msg.senderName}: ${msg.text}\n`;
  });
  
  downloadTextFile(output, `transcript_${threadName.replace(/\s+/g, '_')}.txt`);
}

window.exportAllThreads = function() {
  const data = appState.conversations;
  const threadKeys = Object.keys(data);
  if (threadKeys.length === 0) {
    alert('No log data loaded.');
    return;
  }
  
  let output = `======================================================================\n`;
  output += `RETRO LOG ANALYZER - ALL ARCHIVES EXPORT\n`;
  output += `Export Date: ${new Date().toLocaleString()}\n`;
  output += `Total Threads: ${threadKeys.length}\n`;
  output += `======================================================================\n\n`;

  for (const name in data) {
    const convo = data[name];
    output += `======================================================================\n`;
    output += `CONVERSATION LOG: ${convo.contactName}\n`;
    output += `Channel: ${convo.contactPhone}\n`;
    output += `Total Logs: ${convo.messages.length}\n`;
    output += `======================================================================\n\n`;

    convo.messages.forEach(msg => {
      let dateStr = msg.timestamp;
      try {
        if (msg.timestamp.includes('T')) {
          dateStr = new Date(msg.timestamp).toLocaleString();
        }
      } catch(e) {}
      output += `[${dateStr}] ${msg.senderName}: ${msg.text}\n`;
    });
    output += `\n----------------------------------------------------------------------\n\n`;
  }
  
  downloadTextFile(output, 'retro_all_transcripts.txt');
};

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Reset Database to factory samples
window.resetDatabase = function() {
  if (confirm('Reset log database back to original built-in fictional samples?')) {
    appState.conversations = { ...SAMPLE_DATABASES };
    appState.activeThread = null;
    refreshAnalyzerUI();
    
    // Clear chat display
    activeConvoName.innerText = 'No Conversation Selected';
    activeConvoPhone.innerText = '';
    btnExportSingle.disabled = true;
    textHighlightSearch.disabled = true;
    textHighlightSearch.value = '';
    searchMatchesCount.classList.add('hidden');
    messagesContainer.innerHTML = `
      <div class="chat-placeholder" id="chat-placeholder">
        <i data-lucide="scale" style="width: 48px; height: 48px; color: #808080; margin-bottom: 10px;"></i>
        <p style="font-weight: bold;">Legal Transcript Viewer</p>
        <p style="font-size: 0.8rem; color: #555; max-width: 320px; text-align: center; line-height: 1.4; margin-top: 5px;">
          Select a thread on the left to read details. You can highlight terms for investigation or export logs to plaintext.
        </p>
      </div>
    `;
    lucide.createIcons();
    alert('Log database reset.');
  }
};

// -------------------------------------------------------------
// Window Dragging Logic (Authentic Windows feel)
// -------------------------------------------------------------
let dragObj = null;
let offsetX = 0;
let offsetY = 0;

window.dragStart = function(e, id) {
  if (e.button !== 0) return; // Left click only
  const win = document.getElementById(id);
  dragObj = win;
  bringToFront(id);
  
  offsetX = e.clientX - win.offsetLeft;
  offsetY = e.clientY - win.offsetTop;
  
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);
  
  e.preventDefault();
};

function dragMove(e) {
  if (!dragObj) return;
  
  let x = e.clientX - offsetX;
  let y = e.clientY - offsetY;
  y = Math.max(0, y);
  
  dragObj.style.left = x + 'px';
  dragObj.style.top = y + 'px';
}

function dragEnd() {
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
  dragObj = null;
}

window.bringToFront = function(id) {
  const win = document.getElementById(id);
  const taskButton = document.getElementById(`task-${id}`);
  
  appState.maxZIndex++;
  win.style.zIndex = appState.maxZIndex;
  
  document.querySelectorAll('.window').forEach(w => {
    w.classList.add('inactive');
  });
  win.classList.remove('inactive');

  document.querySelectorAll('.task-button').forEach(btn => {
    btn.classList.remove('active');
  });
  if (taskButton) {
    taskButton.classList.add('active');
  }
};

window.toggleWindow = function(id) {
  const win = document.getElementById(id);
  const btn = document.getElementById(`task-${id}`);
  
  if (win.style.display === 'none' || win.classList.contains('minimized')) {
    win.style.display = 'flex';
    win.classList.remove('minimized');
    bringToFront(id);
    if (btn) btn.classList.remove('hidden');
  } else {
    if (win.style.zIndex == appState.maxZIndex && !win.classList.contains('inactive')) {
      win.classList.add('minimized');
      win.style.display = 'none';
      if (btn) btn.classList.remove('active');
    } else {
      bringToFront(id);
    }
  }
};

window.minimizeWindow = function(id) {
  const win = document.getElementById(id);
  const btn = document.getElementById(`task-${id}`);
  win.style.display = 'none';
  win.classList.add('minimized');
  if (btn) btn.classList.remove('active');
};

window.closeWindow = function(id) {
  const win = document.getElementById(id);
  const btn = document.getElementById(`task-${id}`);
  win.style.display = 'none';
  win.classList.add('minimized');
  if (btn) btn.classList.add('hidden');
};

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}
