import { startPolling, subscribe, getError, refresh, adminUnlocked, unlockAdmin } from './state.js';
import { API_URL, PICK_SECONDS } from './config.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderDraft } from './draft.js';
import { renderRosters } from './rosters.js';
import { renderFixtures } from './fixtures.js';
import { renderAdmin } from './admin.js';

const VIEWS = {
  leaderboard: { label: 'Leaderboard', render: renderLeaderboard },
  draft: { label: 'Draft', render: renderDraft },
  rosters: { label: 'Rosters', render: renderRosters },
  fixtures: { label: 'Fixtures', render: renderFixtures },
  admin: { label: 'Admin', render: renderAdmin },
};

let active = 'leaderboard';

const tabsEl = document.getElementById('tabs');
const contentEl = document.getElementById('content');
const statusEl = document.getElementById('conn');

function renderTabs() {
  // The Admin tab is hidden from regular participants — it only appears once a
  // password has been entered in this browser. (Reach it the first time via the
  // secret #admin route.)
  const keys = Object.keys(VIEWS).filter((k) => k !== 'admin' || adminUnlocked());
  tabsEl.innerHTML = keys.map((k) =>
    `<button class="tab ${k === active ? 'active' : ''}" data-view="${k}">${VIEWS[k].label}</button>`
  ).join('');
}

function renderContent(state) {
  contentEl.innerHTML = '';
  if (!state) {
    contentEl.innerHTML = `<p class="muted">Loading…</p>`;
    return;
  }
  contentEl.appendChild(VIEWS[active].render(state));
  updateTimer();
}

// Shared per-pick countdown. The backend stamps pickStartedAt (epoch ms) when a
// pick's clock starts, so every device shows the same remaining time. Soft only:
// at 0 it just shows "time's up" — nothing is auto-picked.
function updateTimer() {
  const el = document.getElementById('pick-timer');
  if (!el) return;
  const s = window.__state;
  const startedAt = s ? Number(s.pickStartedAt || 0) : 0;
  if (!s || s.draftStatus !== 'in_progress' || !startedAt) { el.textContent = ''; return; }
  const remaining = Math.max(0, PICK_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(remaining / 60), sec = remaining % 60;
  el.textContent = `${m}:${String(sec).padStart(2, '0')}`;
  el.classList.toggle('expired', remaining === 0);
}

function renderStatus() {
  const err = getError();
  if (err) {
    statusEl.textContent = '⚠ ' + err;
    statusEl.className = 'conn err';
  } else {
    statusEl.textContent = '● live';
    statusEl.className = 'conn ok';
  }
}

// Signature of the data that views actually depend on. Used to skip needless
// re-renders during polling so typed-in form fields aren't wiped every tick.
function signature(s) {
  if (!s) return '';
  return JSON.stringify({
    d: s.draftStatus, c: s.currentPickNumber,
    p: s.participants, k: s.picks, m: s.matches,
  });
}

let lastSig = null;

// Hash-based routing so navigation works in-place (no reload). Visiting #admin
// unlocks the Admin panel for this tab.
function route() {
  if (location.hash === '#admin') unlockAdmin();
  let next = location.hash.replace('#', '') || 'leaderboard';
  if (!VIEWS[next] || (next === 'admin' && !adminUnlocked())) next = 'leaderboard';
  active = next;
  renderTabs();
  lastSig = signature(window.__state);
  renderContent(window.__state);
}

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  const view = btn.getAttribute('data-view');
  if (location.hash.replace('#', '') === view) return; // already there
  location.hash = view; // triggers route() via hashchange
});

window.addEventListener('hashchange', route);

subscribe((state) => {
  window.__state = state;
  const sig = signature(state);
  if (sig !== lastSig) {
    lastSig = sig;
    renderContent(state); // only re-render when the data changed
  }
  renderStatus();
});

// Tick the soft countdown once a second without rebuilding the view.
setInterval(updateTimer, 1000);

if (!API_URL || API_URL.startsWith('PASTE_')) {
  contentEl.innerHTML = `<div class="setup-warning">
    <h2>Not configured yet</h2>
    <p>Edit <code>js/config.js</code> and set <code>API_URL</code> to your Apps Script
    web-app URL (and <code>DATA_BASE_URL</code> to this site's <code>/docs</code> folder).
    See <code>docs/setup.md</code>.</p></div>`;
  route();
} else {
  route();
  startPolling();
}
