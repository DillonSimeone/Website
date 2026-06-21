let ws;
let projects = [];
let selectedProject = null;
let currentTab = 'build';
const openFolders = new Set();
let isFlashing = false;

// DOM Elements
const projectListEl = document.getElementById('project-list');
const portSelectEl = document.getElementById('port-select');
const baudSelectEl = document.getElementById('baud-select');
const portDetailsEl = document.getElementById('port-details');
const workspaceCardEl = document.getElementById('workspace-card');
const activeProjectNameEl = document.getElementById('active-project-name');
const envSelectEl = document.getElementById('env-select');
const addEnvSelectEl = document.getElementById('add-env-select');
const libraryTagsEl = document.getElementById('library-tags');

// README Elements
const readmeContainerEl = document.getElementById('readme-container');
const readmeTitleEl = document.getElementById('readme-title');
const readmeBodyEl = document.getElementById('readme-body');
const btnEditReadme = document.getElementById('btn-edit-readme');

// Logs & Console Elements
const logBuildOutputEl = document.getElementById('log-build-output');
const logMonitorOutputEl = document.getElementById('log-monitor-output');
const consoleBuildEl = document.getElementById('console-build');
const consoleMonitorEl = document.getElementById('console-monitor');
const tabButtons = document.querySelectorAll('.tab-buttons .tab-btn');

// Buttons
const btnRefreshProjects = document.getElementById('btn-refresh-projects');
const btnRefreshPorts = document.getElementById('btn-refresh-ports');
const btnBuildFlash = document.getElementById('btn-build-flash');
const btnQuickFlash = document.getElementById('btn-quick-flash');
const btnKillActive = document.getElementById('btn-kill-active');
const btnClearConsole = document.getElementById('btn-clear-console');

let isEditingReadme = false;
let readmeCache = '';

// Connect to WebSockets
function connectWS() {
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${wsProto}//${window.location.host}`);

  ws.onopen = () => {
    console.log('[WS] Connected to backend');
    logBuildOutputEl.textContent = '[System] WebSocket connection established.\n';
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'log') {
      if (msg.stream === 'build') {
        logBuildOutputEl.textContent += msg.text;
        logBuildOutputEl.scrollTop = logBuildOutputEl.scrollHeight;
      } else if (msg.stream === 'monitor') {
        logMonitorOutputEl.textContent += msg.text;
        logMonitorOutputEl.scrollTop = logMonitorOutputEl.scrollHeight;
      }
    } else if (msg.type === 'status') {
      updateProcessStatus(msg.stream, msg.active);
    }
  };

  ws.onclose = () => {
    console.warn('[WS] Connection lost. Reconnecting in 3s...');
    setTimeout(connectWS, 3000);
  };
}

// Prepare UI for flashing (lock serial logs tab)
function prepareForFlash() {
  isFlashing = true;
  stopMonitor();
  
  const buildTabBtn = document.querySelector('[data-tab="build"]');
  const monitorTabBtn = document.querySelector('[data-tab="monitor"]');
  
  if (buildTabBtn) buildTabBtn.click();
  if (monitorTabBtn) {
    monitorTabBtn.classList.add('disabled');
    monitorTabBtn.title = "Serial monitor locked during flashing";
  }
}

// Unlock UI after flashing is done
function finishFlash() {
  isFlashing = false;
  const monitorTabBtn = document.querySelector('[data-tab="monitor"]');
  if (monitorTabBtn) {
    monitorTabBtn.classList.remove('disabled');
    monitorTabBtn.title = "";
  }
}

// Update UI depending on active processes
function updateProcessStatus(type, isActive) {
  if (type === 'monitor') {
    // Monitor status tracking
  } else if (type === 'build') {
    btnBuildFlash.disabled = isActive;
    btnQuickFlash.disabled = isActive;
    if (isActive) {
      btnBuildFlash.textContent = 'FLASHING...';
      prepareForFlash();
    } else {
      btnBuildFlash.textContent = 'BUILD & FLASH DEVICE';
      finishFlash();
      loadProjects();
    }
  }
}

// Load project catalog
async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    projects = await res.json();
    
    // Automatically open the first folder if none is open
    if (openFolders.size === 0 && projects.length > 0) {
      const firstFolder = projects[0].folder || '.';
      openFolders.add(firstFolder);
    }
    
    renderProjects();
  } catch (err) {
    projectListEl.innerHTML = `<p class="loading-text" style="color: var(--primary-pink);">Error: ${err.message}</p>`;
  }
}

// Render projects grouped by folder accordion
function renderProjects() {
  projectListEl.innerHTML = '';
  if (projects.length === 0) {
    projectListEl.innerHTML = '<p class="loading-text">No PlatformIO projects found.</p>';
    return;
  }

  // Group projects by folder
  const groups = {};
  projects.forEach(project => {
    const folder = project.folder || '.';
    if (!groups[folder]) {
      groups[folder] = [];
    }
    groups[folder].push(project);
  });

  // Render spoilers
  Object.keys(groups).sort().forEach(folderName => {
    const displayFolderName = folderName === '.' ? 'Root / General' : folderName;
    const isFolderOpen = openFolders.has(folderName);

    const spoiler = document.createElement('div');
    spoiler.className = `folder-spoiler ${isFolderOpen ? 'open' : ''}`;

    const header = document.createElement('div');
    header.className = 'folder-header';
    header.innerHTML = `
      <span>📁 ${displayFolderName} (${groups[folderName].length})</span>
      <span class="folder-icon">▶</span>
    `;

    const content = document.createElement('div');
    content.className = 'folder-content';

    const wrapper = document.createElement('div');
    wrapper.className = 'folder-projects-wrapper';

    groups[folderName].forEach(project => {
      const card = document.createElement('div');
      card.className = 'project-card';
      if (selectedProject && selectedProject.path === project.path) {
        card.classList.add('active');
      }

      const displayName = project.name.split('/').pop();
      card.innerHTML = `
        <h3>${displayName}</h3>
        <span class="board-tag">${project.board}</span>
        <p style="margin-top: 8px; opacity: 0.8; font-size: 0.8rem;">Envs: ${project.envs.join(', ')}</p>
      `;

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        selectProject(project);
        document.querySelectorAll('.project-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });

      wrapper.appendChild(card);
    });

    content.appendChild(wrapper);
    spoiler.appendChild(header);
    spoiler.appendChild(content);

    header.addEventListener('click', () => {
      if (spoiler.classList.contains('open')) {
        spoiler.classList.remove('open');
        openFolders.delete(folderName);
      } else {
        spoiler.classList.add('open');
        openFolders.add(folderName);
      }
    });

    projectListEl.appendChild(spoiler);
  });
}

// Select active project
function selectProject(project) {
  selectedProject = project;
  workspaceCardEl.style.display = 'block';
  activeProjectNameEl.textContent = project.name.split('/').pop().toUpperCase();
  
  // Reset Add Env dropdown
  addEnvSelectEl.value = "";

  // Populate Environments
  envSelectEl.innerHTML = '';
  project.envs.forEach(env => {
    const opt = document.createElement('option');
    opt.value = env;
    opt.textContent = env;
    envSelectEl.appendChild(opt);
  });

  // Verify firmware bin availability
  updateQuickFlashState();
  envSelectEl.removeEventListener('change', updateQuickFlashState);
  envSelectEl.addEventListener('change', updateQuickFlashState);

  // Render Libraries
  libraryTagsEl.innerHTML = '';
  if (project.libs && project.libs.length > 0) {
    project.libs.forEach(lib => {
      const cleanName = lib.split('@')[0].trim();
      const tag = document.createElement('a');
      tag.className = 'lib-tag';
      tag.href = `https://registry.platformio.org/search?q=${encodeURIComponent(cleanName)}`;
      tag.target = '_blank';
      tag.textContent = lib;
      libraryTagsEl.appendChild(tag);
    });
  } else {
    libraryTagsEl.innerHTML = '<span style="opacity: 0.6; font-size: 0.9rem;">No external libraries listed in platformio.ini</span>';
  }

  // Load README
  loadReadme(project);
}

// Check if pre-compiled bin exists for the active project env
function updateQuickFlashState() {
  if (!selectedProject) return;
  const env = envSelectEl.value;
  const status = selectedProject.firmwareStatus[env];

  if (status && status.exists) {
    btnQuickFlash.disabled = false;
    btnQuickFlash.title = `Flash pre-compiled firmware.bin from ${new Date(status.mtime).toLocaleString()}`;
    btnQuickFlash.textContent = `QUICK FLASH (${env})`;
  } else {
    btnQuickFlash.disabled = true;
    btnQuickFlash.title = 'No compiled firmware.bin found. Run Build & Flash first.';
    btnQuickFlash.textContent = 'QUICK FLASH (NO BIN)';
  }
}

// Fetch and render README.md
async function loadReadme(project) {
  readmeBodyEl.innerHTML = '<p style="opacity: 0.6;">Loading README...</p>';
  btnEditReadme.style.display = 'none';
  isEditingReadme = false;

  try {
    const res = await fetch(`/api/project/readme?projectPath=${encodeURIComponent(project.path)}`);
    const data = await res.json();
    
    if (data.exists) {
      readmeCache = data.content;
      renderReadmeHtml(data.content);
      btnEditReadme.style.display = 'block';
      btnEditReadme.textContent = 'EDIT';
    } else {
      readmeCache = '';
      renderReadmeEditor(project.path);
    }
  } catch (err) {
    readmeBodyEl.innerHTML = `<p style="color: var(--primary-pink);">Error loading README: ${err.message}</p>`;
  }
}

// Format Markdown content to HTML
function renderReadmeHtml(markdown) {
  if (!markdown.trim()) {
    readmeBodyEl.innerHTML = '<p style="opacity: 0.6;">Empty README.md file.</p>';
    return;
  }

  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Fenced Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Task lists / Checklist
    .replace(/- \[\ \]/g, '<input type="checkbox" disabled> ')
    .replace(/- \[x\]/g, '<input type="checkbox" checked disabled> ')
    // Paragraph lists
    .split(/\n\n+/)
    .map(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('<h') || trimmed.startsWith('<pre') || trimmed.startsWith('<input') || trimmed.startsWith('<ul>')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  readmeBodyEl.innerHTML = html;
}

// Display README edit text area
function renderReadmeEditor(projectPath, existingContent = '') {
  btnEditReadme.style.display = 'none';
  readmeBodyEl.innerHTML = `
    <div class="readme-status-empty">NO README.md FOUND FOR THIS PROJECT.</div>
    <textarea id="readme-input" class="readme-textarea" placeholder="Type project description, pin assignments, notes...">${existingContent}</textarea>
    <div class="readme-actions">
      ${existingContent ? `<button class="neo-btn neo-btn-pink btn-small" id="btn-cancel-readme-edit">CANCEL</button>` : ''}
      <button class="neo-btn neo-btn-green btn-small" id="btn-save-readme">SAVE README</button>
    </div>
  `;

  const saveBtn = document.getElementById('btn-save-readme');
  const inputEl = document.getElementById('readme-input');
  const cancelBtn = document.getElementById('btn-cancel-readme-edit');

  saveBtn.addEventListener('click', async () => {
    const content = inputEl.value;
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';

    try {
      const res = await fetch('/api/project/readme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectPath,
          content
        })
      });
      const result = await res.json();
      if (result.success) {
        loadReadme(selectedProject);
      } else {
        alert('Failed to save README');
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE README';
      }
    } catch (err) {
      alert('Error saving README: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE README';
    }
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      isEditingReadme = false;
      btnEditReadme.style.display = 'block';
      btnEditReadme.textContent = 'EDIT';
      renderReadmeHtml(readmeCache);
    });
  }
}

// Toggle Edit Readme
btnEditReadme.addEventListener('click', () => {
  if (!selectedProject) return;
  if (isEditingReadme) {
    isEditingReadme = false;
    btnEditReadme.textContent = 'EDIT';
    renderReadmeHtml(readmeCache);
  } else {
    isEditingReadme = true;
    btnEditReadme.textContent = 'CANCEL';
    renderReadmeEditor(selectedProject.path, readmeCache);
  }
});

// Load COM Ports list
async function loadPorts() {
  portSelectEl.innerHTML = '<option value="">Auto-Detect Port</option>';
  try {
    const res = await fetch('/api/ports');
    const ports = await res.json();
    
    ports.forEach(port => {
      const opt = document.createElement('option');
      opt.value = port.port;
      opt.textContent = `${port.port} - ${port.description || 'Unknown Device'}`;
      portSelectEl.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load ports:', err);
  }
}

// Start and Stop Serial Monitor WebSocket helper
function startMonitor() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    logMonitorOutputEl.textContent = '[System] Connecting serial monitor...\n';
    ws.send(JSON.stringify({
      type: 'start-monitor',
      payload: {
        projectDir: selectedProject ? selectedProject.path : null,
        port: portSelectEl.value,
        baud: parseInt(baudSelectEl.value, 10)
      }
    }));
  }
}

// Stop serial monitor
function stopMonitor() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'stop-monitor'
    }));
  }
}

// Tabs Logic
tabButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (btn.classList.contains('disabled')) {
      e.preventDefault();
      return;
    }

    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const newTab = btn.getAttribute('data-tab');
    if (newTab !== currentTab) {
      currentTab = newTab;
      if (currentTab === 'build') {
        consoleBuildEl.classList.add('active');
        consoleMonitorEl.classList.remove('active');
        stopMonitor();
      } else {
        consoleBuildEl.classList.remove('active');
        consoleMonitorEl.classList.add('active');
        startMonitor();
      }
    }
  });
});

// Auto-scan COM ports on click/focus
portSelectEl.addEventListener('focus', loadPorts);
portSelectEl.addEventListener('mousedown', loadPorts);

// Add environment listener
addEnvSelectEl.addEventListener('change', async () => {
  const selectedEnv = addEnvSelectEl.value;
  if (!selectedEnv || !selectedProject) return;

  if (!confirm(`Are you sure you want to add the [env:${selectedEnv}] configuration to this project's platformio.ini?`)) {
    addEnvSelectEl.value = "";
    return;
  }

  addEnvSelectEl.disabled = true;

  try {
    const res = await fetch('/api/project/env', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectPath: selectedProject.path,
        envName: selectedEnv
      })
    });
    const result = await res.json();
    
    if (result.success) {
      const currentPath = selectedProject.path;
      const currentEnv = selectedEnv;
      
      await loadProjects();
      
      const updatedProj = projects.find(p => p.path === currentPath);
      if (updatedProj) {
        selectProject(updatedProj);
        envSelectEl.value = currentEnv;
        updateQuickFlashState();
      }
    } else {
      alert('Failed to add environment: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error adding environment: ' + err.message);
  } finally {
    addEnvSelectEl.disabled = false;
    addEnvSelectEl.value = "";
  }
});

// Event Listeners
btnRefreshProjects.addEventListener('click', loadProjects);
btnRefreshPorts.addEventListener('click', loadPorts);

btnBuildFlash.addEventListener('click', () => {
  if (!selectedProject) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'run-upload',
      payload: {
        projectDir: selectedProject.path,
        env: envSelectEl.value,
        port: portSelectEl.value,
        quick: false
      }
    }));
  }
});

btnQuickFlash.addEventListener('click', () => {
  if (!selectedProject) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'run-upload',
      payload: {
        projectDir: selectedProject.path,
        env: envSelectEl.value,
        port: portSelectEl.value,
        quick: true
      }
    }));
  }
});

btnKillActive.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop-monitor' }));
    logBuildOutputEl.textContent += '\n[System] Terminating running operations...\n';
  }
});

btnClearConsole.addEventListener('click', () => {
  if (currentTab === 'build') {
    logBuildOutputEl.textContent = '';
  } else {
    logMonitorOutputEl.textContent = '';
  }
});

// Initialization
connectWS();
loadProjects();
loadPorts();
