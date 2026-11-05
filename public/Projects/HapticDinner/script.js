/**
 * Haptic Dinner Series — Client Scripts
 * Handles: Live Capacity Reading via Webhook, Secure Form Submission with Anti-Spam,
 * Mobile Staff Checklists, and Flyer View Toggles.
 */

// Deployed Google Apps Script Web App URL (handles both read & write securely)
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzkA7-pj1kwKJM4gccA-UopVfxB6H2dVkc2Qz5BXSHJvh0olmlrejRraz_OC56mPJne/exec';
const TOTAL_CAPACITY = 20;

document.addEventListener('DOMContentLoaded', () => {
  initSeatCounter();
  initRsvpForm();
  initStaffChecklist();
  initFlyerViews();
  initLiveRunOfShowHighlight();
});

/* --------------------------------------------------------------------------
   1. Live Capacity Reading
   -------------------------------------------------------------------------- */
async function fetchLiveCapacity() {
  if (!WEBHOOK_URL) return null;

  try {
    const res = await fetch(WEBHOOK_URL);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.status === 'success' && typeof data.remaining === 'number') {
      return data.remaining;
    }
  } catch (err) {
    console.warn('Live webhook read error, falling back to local tally:', err);
  }
  return null;
}

function getStoredLocalRsvps() {
  try {
    return JSON.parse(localStorage.getItem('haptic_dinner_rsvps')) || [];
  } catch (e) {
    return [];
  }
}

async function calculateRemainingSeats() {
  const liveRemaining = await fetchLiveCapacity();
  if (liveRemaining !== null) {
    return liveRemaining;
  }

  // Local fallback if offline
  const localRsvps = getStoredLocalRsvps();
  const localBooked = localRsvps.reduce((acc, curr) => acc + (parseInt(curr.seats, 10) || 1), 0);
  return Math.max(0, TOTAL_CAPACITY - localBooked);
}

async function initSeatCounter() {
  const counterEls = document.querySelectorAll('.dynamic-seat-count');
  if (!counterEls.length) return;

  const remaining = await calculateRemainingSeats();
  counterEls.forEach(el => {
    el.textContent = `${remaining} of ${TOTAL_CAPACITY} seats available`;
  });
}

/* --------------------------------------------------------------------------
   2. RSVP / Seat Reservation Form (ticket.html)
   -------------------------------------------------------------------------- */
function initRsvpForm() {
  const rsvpForm = document.getElementById('rsvp-seat-form');
  if (!rsvpForm) return;

  rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = rsvpForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying & Holding Seat...';
    }

    // Anti-spam honeypot check
    const honeypot = document.getElementById('rsvp-hp-check')?.value || '';
    if (honeypot.trim() !== '') {
      console.warn('Bot detected and dropped.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      return;
    }

    const name = document.getElementById('rsvp-name').value.trim();
    const email = document.getElementById('rsvp-email').value.trim();
    const tier = document.querySelector('input[name="ticket_tier"]:checked')?.value || 'Combined Experience ($80)';
    const seats = parseInt(document.getElementById('rsvp-seats').value, 10) || 1;
    const dietary = document.getElementById('rsvp-dietary').value;
    const notes = document.getElementById('rsvp-notes').value.trim();
    const aslNeeded = document.getElementById('rsvp-asl')?.checked || false;
    const wheelchairNeeded = document.getElementById('rsvp-wheelchair')?.checked || false;

    if (!name || !email) {
      alert('Please provide your name and email to hold your seat.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      return;
    }

    // Check capacity before posting
    const currentRemaining = await calculateRemainingSeats();
    if (seats > currentRemaining) {
      alert(`Only ${currentRemaining} seat(s) are currently available. Please adjust your party size or reach out to CymaSpace.`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      return;
    }

    // Generate confirmation code
    const confCode = 'HD-' + Math.floor(1000 + Math.random() * 9000);
    const timestamp = new Date().toISOString();

    const newRsvp = {
      timestamp,
      code: confCode,
      name,
      email,
      seats,
      tier,
      dietary,
      aslNeeded: aslNeeded ? 'Yes' : 'No',
      wheelchairNeeded: wheelchairNeeded ? 'Yes' : 'No',
      notes,
      hp_check: ''
    };

    // 1. Post to Google Apps Script Web App
    if (WEBHOOK_URL) {
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newRsvp),
          redirect: 'follow'
        });

        const result = await response.json();
        if (result && result.status === 'error') {
          alert('Reservation error: ' + (result.message || 'Could not complete reservation.'));
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
          return;
        }
      } catch (err) {
        console.warn('Webhook post notice:', err);
      }
    }

    // 2. Persist in local storage as backup
    const localRsvps = getStoredLocalRsvps();
    localRsvps.push(newRsvp);
    try {
      localStorage.setItem('haptic_dinner_rsvps', JSON.stringify(localRsvps));
    } catch (err) {}

    // Update seat counter
    initSeatCounter();

    // Show confirmation modal
    showConfirmationModal(newRsvp);
    rsvpForm.reset();

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });
}

function showConfirmationModal(rsvp) {
  const modal = document.getElementById('rsvp-confirmation-modal');
  if (!modal) {
    alert(`Reservation Confirmed.\nCode: ${rsvp.code}\nTier: ${rsvp.tier}\nSeats: ${rsvp.seats}\nPlease present this code at the CymaSpace cafe kiosk to complete ticket purchase.`);
    return;
  }

  document.getElementById('conf-code-val').textContent = rsvp.code;
  document.getElementById('conf-name-val').textContent = rsvp.name;
  document.getElementById('conf-tier-val').textContent = rsvp.tier;
  document.getElementById('conf-seats-val').textContent = `${rsvp.seats} Seat(s)`;
  document.getElementById('conf-dietary-val').textContent = rsvp.dietary;

  modal.style.display = 'flex';
}

window.closeConfirmationModal = function() {
  const modal = document.getElementById('rsvp-confirmation-modal');
  if (modal) modal.style.display = 'none';
};

/* --------------------------------------------------------------------------
   3. Staff Cheat Sheet Checklist (setUp.html)
   -------------------------------------------------------------------------- */
function initStaffChecklist() {
  const taskCheckboxes = document.querySelectorAll('.task-item input[type="checkbox"]');
  if (!taskCheckboxes.length) return;

  let savedTasks = {};
  try {
    savedTasks = JSON.parse(localStorage.getItem('haptic_dinner_staff_tasks')) || {};
  } catch (e) {
    savedTasks = {};
  }

  taskCheckboxes.forEach((cb, idx) => {
    const taskId = cb.id || `task_${idx}`;
    if (savedTasks[taskId]) {
      cb.checked = true;
      cb.closest('.task-item')?.classList.add('checked');
    }

    cb.addEventListener('change', () => {
      savedTasks[taskId] = cb.checked;
      if (cb.checked) {
        cb.closest('.task-item')?.classList.add('checked');
      } else {
        cb.closest('.task-item')?.classList.remove('checked');
      }
      try {
        localStorage.setItem('haptic_dinner_staff_tasks', JSON.stringify(savedTasks));
      } catch (e) {}
      updateStaffProgress();
    });
  });

  updateStaffProgress();

  // Accordion toggle
  const accordions = document.querySelectorAll('.accordion-toggle');
  accordions.forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.accordion-card');
      parent.classList.toggle('open');
    });
  });

  // Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const role = btn.dataset.role;
      const cards = document.querySelectorAll('.accordion-card');

      cards.forEach(card => {
        if (role === 'all' || card.dataset.role === role) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

function updateStaffProgress() {
  const total = document.querySelectorAll('.task-item input[type="checkbox"]').length;
  const checked = document.querySelectorAll('.task-item input[type="checkbox"]:checked').length;
  const progressText = document.getElementById('staff-progress-val');
  if (progressText && total > 0) {
    const pct = Math.round((checked / total) * 100);
    progressText.textContent = `${checked} / ${total} tasks ready (${pct}%)`;
  }
}

window.resetStaffChecklist = function() {
  if (confirm('Reset all checked tasks back to uncompleted?')) {
    localStorage.removeItem('haptic_dinner_staff_tasks');
    document.querySelectorAll('.task-item input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('.task-item')?.classList.remove('checked');
    });
    updateStaffProgress();
  }
};

/* --------------------------------------------------------------------------
   4. Live Run of Show Active Phase Tracker
   -------------------------------------------------------------------------- */
function initLiveRunOfShowHighlight() {
  const rows = document.querySelectorAll('.timeline-row');
  if (!rows.length) return;

  const now = new Date();
  const isEventDay = (now.getFullYear() === 2026 && now.getMonth() === 11 && now.getDate() === 12);
  
  if (isEventDay) {
    const timeMinutes = now.getHours() * 60 + now.getMinutes();

    rows.forEach(row => {
      const timeText = row.querySelector('.timeline-time')?.textContent || '';
      if (timeMinutes >= 930 && timeMinutes < 960 && timeText.includes('3:30')) row.classList.add('live-active');
      if (timeMinutes >= 960 && timeMinutes < 1020 && timeText.includes('4:00')) row.classList.add('live-active');
      if (timeMinutes >= 1020 && timeMinutes < 1035 && timeText.includes('5:00')) row.classList.add('live-active');
      if (timeMinutes >= 1035 && timeMinutes < 1080 && timeText.includes('5:15')) row.classList.add('live-active');
      if (timeMinutes >= 1080 && timeMinutes < 1130 && timeText.includes('6:00')) row.classList.add('live-active');
      if (timeMinutes >= 1130 && timeMinutes < 1140 && timeText.includes('6:50')) row.classList.add('live-active');
      if (timeMinutes >= 1140 && timeMinutes < 1185 && timeText.includes('7:00')) row.classList.add('live-active');
    });
  }
}

/* --------------------------------------------------------------------------
   5. Flyer View Toggle (flyer.html)
   -------------------------------------------------------------------------- */
function initFlyerViews() {
  const btnPoster = document.getElementById('btn-view-poster');
  const btnShareCard = document.getElementById('btn-view-sharecard');
  const posterSheet = document.getElementById('flyer-poster-sheet');
  const shareCardWrap = document.getElementById('flyer-sharecard-wrap');

  if (!btnPoster || !btnShareCard) return;

  btnPoster.addEventListener('click', () => {
    btnPoster.classList.add('active');
    btnShareCard.classList.remove('active');
    posterSheet.style.display = 'block';
    shareCardWrap.classList.remove('active');
  });

  btnShareCard.addEventListener('click', () => {
    btnShareCard.classList.add('active');
    btnPoster.classList.remove('active');
    posterSheet.style.display = 'none';
    shareCardWrap.classList.add('active');
  });
}
