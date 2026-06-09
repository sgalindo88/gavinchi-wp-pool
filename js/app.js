import { startPolling, subscribe, getError, refresh } from './state.js';
import { API_URL } from './config.js';
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

let active = location.hash.replace('#', '') || 'leaderboard';
if (!VIEWS[active]) active = 'leaderboard';

const tabsEl = document.getElementById('tabs');
const contentEl = document.getElementById('content');
const statusEl = document.getElementById('conn');

function renderTabs() {
  tabsEl.innerHTML = Object.keys(VIEWS).map((k) =>
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

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  active = btn.getAttribute('data-view');
  location.hash = active;
  renderTabs();
  lastSig = signature(window.__state);
  renderContent(window.__state);
});

subscribe((state) => {
  window.__state = state;
  const sig = signature(state);
  if (sig !== lastSig) {
    lastSig = sig;
    renderContent(state); // only re-render when the data changed
  }
  renderStatus();
});

if (!API_URL || API_URL.startsWith('PASTE_')) {
  contentEl.innerHTML = `<div class="setup-warning">
    <h2>Not configured yet</h2>
    <p>Edit <code>js/config.js</code> and set <code>API_URL</code> to your Apps Script
    web-app URL (and <code>DATA_BASE_URL</code> to this site's <code>/docs</code> folder).
    See <code>docs/setup.md</code>.</p></div>`;
  renderTabs();
} else {
  renderTabs();
  startPolling();
}
