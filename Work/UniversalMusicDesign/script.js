// UMD Engineering Log Utility - Core Script

// Fields that will be saved and restored
const fields = [
    'session-date',
    'hours-worked',
    'location-workspace',
    'session-goals',
    'tasks-desc',
    'tools-details',
    'decisions-details',
    'prototype-name',
    'testing-performed',
    'test-results-worked',
    'test-results-failed',
    'test-learned',
    'ux-details',
    'creative-reflection',
    'deafjazz-contribution',
    'design-files',
    'prototype-files',
    'media-files',
    'issues-notes',
    'next-steps',
    'additional-notes'
];

const checkboxGroups = [
    'session-type',
    'work-completed',
    'tools-used',
    'decisions',
    'ux-reflections',
    'issues'
];

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
    loadSavedData();
    setupAutosave();
});

// Load saved data from localStorage
function loadSavedData() {
    const dataJSON = localStorage.getItem('umd-log-data');
    if (!dataJSON) return;

    try {
        const data = JSON.parse(dataJSON);
        
        // Restore text inputs and textareas
        fields.forEach(field => {
            if (data[field] !== undefined) {
                const el = document.getElementById(field);
                if (el) el.value = data[field];
            }
        });

        // Restore checkboxes
        checkboxGroups.forEach(groupName => {
            if (data[groupName] && Array.isArray(data[groupName])) {
                const checkboxes = document.querySelectorAll(`input[name="${groupName}"]`);
                checkboxes.forEach(cb => {
                    cb.checked = data[groupName].includes(cb.value);
                });
            }
        });
        
        showSaveStatus('Loaded saved draft');
    } catch (e) {
        console.error('Error parsing saved local storage data', e);
    }
}

// Setup Autosave listeners on form changes
function setupAutosave() {
    const form = document.getElementById('umd-log-form');
    if (!form) return;

    const saveFormState = () => {
        const data = {};
        
        // Gather text inputs and textareas
        fields.forEach(field => {
            const el = document.getElementById(field);
            if (el) data[field] = el.value;
        });

        // Gather checkbox groups
        checkboxGroups.forEach(groupName => {
            const checkedValues = [];
            const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
            checkboxes.forEach(cb => checkedValues.push(cb.value));
            data[groupName] = checkedValues;
        });

        localStorage.setItem('umd-log-data', JSON.stringify(data));
        showSaveStatus('Draft autosaved');
    };

    // Listen for input, change, and keyup events
    form.addEventListener('input', saveFormState);
    form.addEventListener('change', saveFormState);
}

// Helper to show saved status indicator
function showSaveStatus(text) {
    const statusEl = document.getElementById('save-status');
    if (!statusEl) return;
    
    statusEl.innerText = text;
    statusEl.style.opacity = '1';
}

// Reset Form & Clear Cache
function resetForm() {
    if (!confirm('Are you sure you want to clear the entire form? This will delete your current draft.')) {
        return;
    }
    
    document.getElementById('umd-log-form').reset();
    localStorage.removeItem('umd-log-data');
    showSaveStatus('Draft cleared');
}

// Export Form State to JSON file
function exportJSON() {
    const data = {};
    fields.forEach(field => {
        const el = document.getElementById(field);
        if (el) data[field] = el.value;
    });

    checkboxGroups.forEach(groupName => {
        const checkedValues = [];
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
        checkboxes.forEach(cb => checkedValues.push(cb.value));
        data[groupName] = checkedValues;
    });

    const dateVal = data['session-date'] || 'undated';
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `UMD_Engineering_Log_${dateVal}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Load Form State from JSON file
function loadJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Clear existing form first
            document.getElementById('umd-log-form').reset();

            // Populate form
            fields.forEach(field => {
                if (data[field] !== undefined) {
                    const el = document.getElementById(field);
                    if (el) el.value = data[field];
                }
            });

            checkboxGroups.forEach(groupName => {
                if (data[groupName] && Array.isArray(data[groupName])) {
                    const checkboxes = document.querySelectorAll(`input[name="${groupName}"]`);
                    checkboxes.forEach(cb => {
                        cb.checked = data[groupName].includes(cb.value);
                    });
                }
            });

            // Save to local storage
            localStorage.setItem('umd-log-data', JSON.stringify(data));
            showSaveStatus('Loaded log state successfully');
        } catch (err) {
            alert('Failed to parse JSON file: ' + err.message);
        }
    };
    reader.readAsText(file);
    
    // Clear value to allow loading the same file again
    event.target.value = '';
}

// Compile Markdown log output
function compileMarkdown() {
    const data = {};
    fields.forEach(field => {
        const el = document.getElementById(field);
        data[field] = el ? el.value.trim() : '';
    });

    const checks = {};
    checkboxGroups.forEach(groupName => {
        const checkedValues = [];
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
        checkboxes.forEach(cb => checkedValues.push(cb.value));
        checks[groupName] = checkedValues;
    });

    const dateVal = data['session-date'] || 'N/A';
    const hoursVal = data['hours-worked'] || 'N/A';
    const locationVal = data['location-workspace'] || 'N/A';

    return `# UMD Lead Design Engineer Development Log

* **Project**: Universal Music Design (#deafjazz / NEA Research Project)
* **Work Order**: 25-014 NEA
* **Project Director**: Shawn Trail, PhD
* **Date**: ${dateVal}
* **Hours Logged**: ${hoursVal} Hours
* **Location/Workspace**: ${locationVal}
* **Session Type**: ${checks['session-type'].join(', ') || 'N/A'}

---

## 1. Session Goals
${data['session-goals'] || 'No goals specified.'}

---

## 2. Work Completed
* **Tasks Completed**: ${checks['work-completed'].join(', ') || 'N/A'}
* **Details**:
${data['tasks-desc'] || 'No details provided.'}

---

## 3. Engineering & Design Notes
* **Tools/Systems Used**: ${data['tools-details'] || 'None'}
  * *Categories*: ${checks['tools-used'].join(', ') || 'N/A'}
* **Design Decisions**:
  * *Categories*: ${checks['decisions'].join(', ') || 'N/A'}
  * *Details*:
${data['decisions-details'] || 'No design decisions logged.'}

---

## 4. Testing & Prototype Notes
* **Prototype/System Tested**: ${data['prototype-name'] || 'None'}
* **Testing Performed**:
${data['testing-performed'] || 'N/A'}
* **Results / Observations**:
  * *What worked?*: ${data['test-results-worked'] || 'N/A'}
  * *What did not work?*: ${data['test-results-failed'] || 'N/A'}
  * *What was learned?*: ${data['test-learned'] || 'N/A'}

---

## 5. Reflections & Project Integration
* **Accessibility Alignment Goals**: ${checks['ux-reflections'].join(', ') || 'N/A'}
* **UX Reflection details**:
${data['ux-details'] || 'No reflections logged.'}
* **Creative / Artistic Reflection**:
${data['creative-reflection'] || 'No creative reflections logged.'}
* **Contribution to UMD / #deafjazz**:
${data['deafjazz-contribution'] || 'No project contributions logged.'}

---

## 6. Materials Created
* **Design Files**: ${data['design-files'] || 'None'}
* **Prototype Code/Docs**: ${data['prototype-files'] || 'None'}
* **Media/Test Documentation**: ${data['media-files'] || 'None'}

---

## 7. Next Steps & Issues Identified
* **Issues/Needs**: ${checks['issues'].join(', ') || 'N/A'}
  * *Notes*: ${data['issues-notes'] || 'None'}
* **Next Steps (Tasks to complete)**:
${data['next-steps'] || 'No next steps listed.'}
* **Additional Notes**:
${data['additional-notes'] || 'None'}
`;
}

// Show Export Modal with Compiled Markdown
function exportMarkdown() {
    const mdText = compileMarkdown();
    const modal = document.getElementById('export-modal');
    const textarea = document.getElementById('export-text');
    
    if (modal && textarea) {
        textarea.value = mdText;
        modal.style.display = 'flex';
    }
}

// Close Modal
function closeModal() {
    const modal = document.getElementById('export-modal');
    if (modal) modal.style.display = 'none';
}

// Copy Markdown to Clipboard
function copyToClipboard() {
    const textarea = document.getElementById('export-text');
    if (!textarea) return;

    textarea.select();
    document.execCommand('copy');
    
    const copyBtn = document.querySelector('.modal-footer .btn-secondary');
    if (copyBtn) {
        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => {
            copyBtn.innerText = originalText;
        }, 1500);
    }
}

// Download Markdown file
function downloadMarkdownFile() {
    const mdText = compileMarkdown();
    const dateVal = document.getElementById('session-date').value || 'undated';
    const blob = new Blob([mdText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `UMD_Engineering_Log_${dateVal}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
