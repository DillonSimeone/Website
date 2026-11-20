/**
 * The Haptic Petting Zoo: Project Ledger & Hours Command Center
 * Client-side script: loads ledger-data.json, calculates metrics, and populates tables.
 */

let ledgerState = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('./ledger-data.json');
    if (!res.ok) throw new Error('Could not load ledger-data.json');
    ledgerState = await res.json();
    initApp();
  } catch (err) {
    console.error('Failed to load ledger data:', err);
    document.getElementById('loading-indicator').innerHTML = `
      <div style="color: #f43f5e; padding: 20px; font-weight: bold;">
        ⚠️ Failed to load ledger data: ${err.message}. Please ensure ledger-data.json exists in this folder.
      </div>
    `;
  }
});

function initApp() {
  document.getElementById('loading-indicator').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';

  renderKPIs();
  renderBudgetCategories();
  renderPurchasesLog();
  renderDisbursements();
  renderActivitiesLog();
  renderProcurement();
  renderExternalSynergies();
  renderRawJSON();

  setupTabs();
  setupFilters();
  setupCopyJSON();
}

// -------------------------------------------------------------
// Render KPI Cards
// -------------------------------------------------------------
function renderKPIs() {
  const meta = ledgerState.metadata;
  
  // Total in-hand cash
  const inHandElem = document.getElementById('kpi-in-hand');
  if (inHandElem) inHandElem.textContent = `$${meta.disbursement_current_in_hand.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  // Artist Milestone Progress % & Value
  const artistCategory = ledgerState.budget_categories.find(c => c.line_number === 1);
  const artistProgressElem = document.getElementById('kpi-artist-progress');
  const artistProgressSub = document.getElementById('kpi-artist-sub');
  if (artistCategory && artistProgressElem) {
    artistProgressElem.textContent = `${artistCategory.progress_percent}%`;
    const totalHours = ledgerState.activities_log.reduce((acc, a) => acc + (a.hours || 0), 0);
    artistProgressSub.textContent = `$${artistCategory.committed_value.toLocaleString('en-US')} milestone progress (${totalHours} hrs logged)`;
  }

  // Actual Spent (Receipts)
  const actualSpentElem = document.getElementById('kpi-actual-spent');
  const actualSubElem = document.getElementById('kpi-actual-sub');
  if (actualSpentElem && ledgerState.purchases_log) {
    const totalSpent = ledgerState.purchases_log.reduce((sum, p) => sum + (p.zoo_charged_amount || 0), 0);
    const uniqueOrders = new Set(ledgerState.purchases_log.map(p => p.order_number)).size;
    actualSpentElem.textContent = `$${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (actualSubElem) {
      actualSubElem.textContent = `${ledgerState.purchases_log.length} items across ${uniqueOrders} orders`;
    }
  }

  // 11/11 Procurement Planned
  const procTargetElem = document.getElementById('kpi-procurement-target');
  if (procTargetElem && ledgerState.procurement_pipeline) {
    procTargetElem.textContent = `$${ledgerState.procurement_pipeline.target_spend_budget.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  // Next Milestone Target
  const nextMilestoneElem = document.getElementById('kpi-next-milestone');
  if (nextMilestoneElem) {
    const nextM = ledgerState.disbursements.find(d => d.status === 'pending');
    if (nextM) {
      nextMilestoneElem.textContent = nextM.target_date;
      document.getElementById('kpi-next-sub').textContent = `${nextM.title} ($${nextM.amount.toLocaleString('en-US')})`;
    }
  }
}

// -------------------------------------------------------------
// Render Exhibit B Budget Breakdown
// -------------------------------------------------------------
function renderBudgetCategories() {
  const tbody = document.getElementById('budget-table-body');
  if (!tbody) return;

  const cats = ledgerState.budget_categories;
  tbody.innerHTML = cats.map(c => `
    <tr>
      <td class="num-cell">#${c.line_number}</td>
      <td>
        <strong>${c.name}</strong>
        <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 2px;">${c.scope}</div>
      </td>
      <td class="num-cell">$${c.allocated.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td class="num-cell" style="color: ${c.actual_withdrawn > 0 ? 'var(--accent-amber)' : 'var(--text-dim)'};">$${c.actual_withdrawn.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td class="num-cell">$${c.committed_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td class="num-cell">$${c.remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>
        <div class="progress-container">
          <div class="progress-fill" style="width: ${Math.min(100, c.progress_percent)}%;"></div>
        </div>
        <span style="font-family: var(--font-mono); font-size: 0.8rem;">${c.progress_percent}%</span>
      </td>
      <td style="font-size: 0.82rem; color: var(--text-muted);">${c.notes || '-'}</td>
    </tr>
  `).join('');

  // Update Summary row
  const totalAllocated = cats.reduce((sum, c) => sum + c.allocated, 0);
  const totalActual = cats.reduce((sum, c) => sum + (c.actual_withdrawn || 0), 0);
  const totalCommitted = cats.reduce((sum, c) => sum + c.committed_value, 0);
  const totalRemaining = cats.reduce((sum, c) => sum + c.remaining, 0);

  document.getElementById('budget-total-allocated').textContent = `$${totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const totalActualEl = document.getElementById('budget-total-actual');
  if (totalActualEl) totalActualEl.textContent = `$${totalActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('budget-total-committed').textContent = `$${totalCommitted.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  document.getElementById('budget-total-remaining').textContent = `$${totalRemaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// -------------------------------------------------------------
// Render Verified Receipts & Purchases Log
// -------------------------------------------------------------
function renderPurchasesLog() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody || !ledgerState.purchases_log) return;

  const purchases = ledgerState.purchases_log;
  tbody.innerHTML = purchases.map(p => `
    <tr>
      <td class="num-cell">${p.purchase_id}</td>
      <td class="num-cell">${p.order_date}</td>
      <td>
        <strong>${p.vendor}</strong>
        <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-cyan); margin-top: 2px;">#${p.order_number}</div>
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">${p.payment_method}</div>
      </td>
      <td>
        <strong>${p.item_description}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 3px;">${p.purpose}</div>
        ${p.excluded_personal_amount > 0 ? `<div style="font-size: 0.75rem; color: var(--accent-amber); margin-top: 4px;">✂️ Split Receipt Note: ${p.excluded_note}</div>` : `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 3px;">📄 ${p.excluded_note}</div>`}
      </td>
      <td class="num-cell" style="text-align: right;">${p.quantity}</td>
      <td class="num-cell" style="text-align: right;">$${p.unit_cost.toFixed(2)}</td>
      <td class="num-cell" style="text-align: right; color: var(--accent-emerald);">$${p.zoo_charged_amount.toFixed(2)}</td>
      <td class="num-cell">Line #${p.budget_line}</td>
      <td>
        <div style="font-size: 0.78rem; color: var(--text-main); margin-bottom: 4px;">${p.status}</div>
        ${p.receipt_file ? `<a href="${p.receipt_file}" target="_blank" style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-indigo); text-decoration: none;">🖼️ View Receipt ↗</a>` : ''}
      </td>
    </tr>
  `).join('');

  const totalZoo = purchases.reduce((sum, p) => sum + p.zoo_charged_amount, 0);
  // Compute unique excluded amounts per order number so shared receipts don't double-count excluded items
  const excludedByOrder = {};
  purchases.forEach(p => {
    if (p.excluded_personal_amount > 0) {
      excludedByOrder[p.order_number] = p.excluded_personal_amount;
    }
  });
  const totalExcluded = Object.values(excludedByOrder).reduce((sum, v) => sum + v, 0);

  const totalZooEl = document.getElementById('purchases-total-zoo');
  const totalExclEl = document.getElementById('purchases-total-excluded');
  if (totalZooEl) totalZooEl.textContent = `$${totalZoo.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  if (totalExclEl) totalExclEl.textContent = `$${totalExcluded.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// -------------------------------------------------------------
// Render Disbursements & Milestones
// -------------------------------------------------------------
function renderDisbursements() {
  const tbody = document.getElementById('disbursements-table-body');
  if (!tbody) return;

  tbody.innerHTML = ledgerState.disbursements.map(d => `
    <tr>
      <td class="num-cell">M${d.milestone_number}</td>
      <td>
        <strong>${d.title}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">${d.conditions}</div>
      </td>
      <td class="num-cell">${d.target_date}</td>
      <td class="num-cell" style="color: var(--accent-emerald);">$${d.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>
        <span class="status-pill status-${d.status}">${d.status}</span>
        ${d.received_date ? `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 3px;">Rcvd: ${d.received_date}</div>` : ''}
      </td>
      <td style="font-size: 0.82rem; color: var(--text-muted);">${d.notes || '-'}</td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// Render Activities & Hours Log
// -------------------------------------------------------------
function renderActivitiesLog(filterText = '') {
  const tbody = document.getElementById('activities-table-body');
  if (!tbody) return;

  let activities = ledgerState.activities_log;
  if (filterText) {
    const q = filterText.toLowerCase();
    activities = activities.filter(a => 
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q)
    );
  }

  tbody.innerHTML = activities.map(a => {
    const linksHtml = (a.links && a.links.length)
      ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
          ${a.links.map(l => {
            const isTab = l.url.startsWith('#tab-');
            return `<a href="${l.url}" ${isTab ? `onclick="event.preventDefault(); document.querySelector('[data-tab=\\'${l.url.slice(1)}\\']').click();"` : 'target="_blank"'} style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 5px; font-family: var(--font-mono); font-size: 0.74rem; font-weight: 600; background: rgba(99, 102, 241, 0.14); border: 1px solid rgba(99, 102, 241, 0.35); color: #a5b4fc; text-decoration: none;">${l.label} ${isTab ? '→' : '↗'}</a>`;
          }).join('')}
        </div>`
      : '';
    return `
    <tr>
      <td class="num-cell">${a.id}</td>
      <td class="num-cell" style="font-size: 0.78rem;">${a.date}</td>
      <td><span class="badge badge-sponsor">${a.category}</span></td>
      <td>
        <strong>${a.title}</strong>
        <p style="font-size: 0.83rem; color: var(--text-muted); margin-top: 4px;">${a.description}</p>
        ${linksHtml}
      </td>
      <td class="num-cell" style="text-align: right; color: var(--accent-cyan);">${a.hours.toFixed(1)} hrs</td>
      <td class="num-cell" style="text-align: right;">M${a.target_milestone}</td>
      <td class="num-cell" style="text-align: right; color: var(--accent-emerald);">$${a.burn_credit_usd.toFixed(2)}</td>
    </tr>
  `}).join('');

  // Update total hours count
  const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);
  const totalBurn = activities.reduce((sum, a) => sum + a.burn_credit_usd, 0);
  document.getElementById('activities-total-hours').textContent = `${totalHours.toFixed(1)} hrs`;
  document.getElementById('activities-total-burn').textContent = `$${totalBurn.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// -------------------------------------------------------------
// Render 11/11 Procurement BOM Table
// -------------------------------------------------------------
function renderProcurement() {
  const tbody = document.getElementById('procurement-table-body');
  if (!tbody || !ledgerState.procurement_pipeline) return;

  const items = ledgerState.procurement_pipeline.items;
  tbody.innerHTML = items.map(item => `
    <tr>
      <td class="num-cell">${item.item_id}</td>
      <td>
        <strong>${item.description}</strong>
        <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 2px;">${item.intended_use}</div>
      </td>
      <td class="num-cell" style="text-align: right;">${item.quantity}</td>
      <td class="num-cell" style="text-align: right;">$${item.est_unit_cost.toFixed(2)}</td>
      <td class="num-cell" style="text-align: right; color: var(--accent-amber);">$${item.est_total_cost.toFixed(2)}</td>
      <td class="num-cell">Line #${item.budget_line}</td>
    </tr>
  `).join('');

  const totalProcCost = items.reduce((sum, i) => sum + i.est_total_cost, 0);
  document.getElementById('procurement-total-cost').textContent = `$${totalProcCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

// -------------------------------------------------------------
// Render External Grants & Synergies
// -------------------------------------------------------------
function renderExternalSynergies() {
  const container = document.getElementById('external-synergies-container');
  if (!container || !ledgerState.external_matching_pipelines) return;

  container.innerHTML = ledgerState.external_matching_pipelines.map(p => `
    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 18px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
        <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff;">${p.program}</h3>
        <span class="badge badge-grant">
          ${p.direct_funding_committed ? `Secured: $${p.direct_funding_committed.toLocaleString()}` : ''}
          ${p.potential_additional ? `(+ $${p.potential_additional.toLocaleString()} pending)` : ''}
          ${p.grant_request ? `Request: $${p.grant_request.toLocaleString()} / Match: $${p.matching_funds_committed.toLocaleString()}` : ''}
          ${p.status ? p.status : ''}
        </span>
      </div>
      <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 8px;"><strong>Focus:</strong> ${p.focus}</p>
      <p style="font-size: 0.84rem; color: var(--accent-cyan); line-height: 1.4;"><strong>Haptic Zoo Synergy:</strong> ${p.synergy}</p>
    </div>
  `).join('');
}

// -------------------------------------------------------------
// Render Raw JSON
// -------------------------------------------------------------
function renderRawJSON() {
  const box = document.getElementById('json-display');
  if (box && ledgerState) {
    box.textContent = JSON.stringify(ledgerState, null, 2);
  }
}

// -------------------------------------------------------------
// Tab Switching
// -------------------------------------------------------------
function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      buttons.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

// -------------------------------------------------------------
// Filter Search
// -------------------------------------------------------------
function setupFilters() {
  const searchInput = document.getElementById('activity-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderActivitiesLog(e.target.value);
    });
  }
}

// -------------------------------------------------------------
// Copy / Download JSON Utilities
// -------------------------------------------------------------
function setupCopyJSON() {
  const copyBtn = document.getElementById('copy-json-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(ledgerState, null, 2)).then(() => {
        copyBtn.textContent = '✅ Copied to Clipboard!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Raw JSON'; }, 2000);
      });
    });
  }

  const downloadBtn = document.getElementById('download-json-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(ledgerState, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'haptic_petting_zoo_ledger.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }
}
