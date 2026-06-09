import { api } from './api.js';
import { refresh, getPassword, setPassword, clearPassword, lockAdmin } from './state.js';
import { DATA_BASE_URL, NUM_PLAYERS } from './config.js';
import { escapeHtml } from './leaderboard.js';

export function renderAdmin(state) {
  const el = document.createElement('div');
  el.className = 'admin-view';

  const bySlot = state.participants.slice().sort((a, b) => Number(a.DraftSlot) - Number(b.DraftSlot));
  const nameInputs = Array.from({ length: NUM_PLAYERS }, (_, i) => {
    const slot = i + 1;
    const existing = bySlot.find((p) => Number(p.DraftSlot) === slot);
    return `<label>Slot ${slot}
      <input class="pname" data-slot="${slot}" value="${existing ? escapeHtml(existing.Name) : ''}" placeholder="Player ${slot}" />
    </label>`;
  }).join('');

  const draftLocked = state.draftStatus !== 'not_started';

  el.innerHTML = `
    <h2>Admin</h2>

    <section class="admin-card">
      <h3>Admin password</h3>
      <p class="muted">Stored only in this browser tab. Required for every write action.</p>
      <div class="row">
        <input id="pw" type="password" value="${escapeHtml(getPassword())}" placeholder="admin password" />
        <button data-save-pw>Save</button>
        <button data-clear-pw class="ghost">Forget</button>
      </div>
    </section>

    <section class="admin-card">
      <h3>1 · Seed the sheet</h3>
      <p class="muted">One-time: creates tabs and loads the 45 teams + 63 group fixtures from
        <code>${escapeHtml(DATA_BASE_URL)}</code>.</p>
      <button data-seed>Seed teams &amp; fixtures</button>
    </section>

    <section class="admin-card">
      <h3>2 · Participants ${draftLocked ? '<span class="muted">(locked — draft started)</span>' : ''}</h3>
      <div class="pname-grid">${nameInputs}</div>
      <button data-save-participants ${draftLocked ? 'disabled' : ''}>Save participants</button>
    </section>

    <section class="admin-card">
      <h3>3 · Draft</h3>
      <p class="muted">Status: <strong>${escapeHtml(state.draftStatus)}</strong> ·
        Pick ${Math.min(state.currentPickNumber || 0, state.totalPicks)}/${state.totalPicks}</p>
      <div class="admin-controls">
        ${state.draftStatus === 'not_started' ? '<button data-act="start">Start draft</button>' : ''}
        ${state.draftStatus === 'in_progress' || state.draftStatus === 'complete' ? '<button data-act="undo">Undo last pick</button>' : ''}
        <button data-act="reset" class="danger">Reset draft</button>
      </div>
    </section>

    <section class="admin-card">
      <h3>Hide admin panel</h3>
      <p class="muted">Hides the Admin tab on this device. Re-open it any time by visiting the
        <code>#admin</code> link.</p>
      <button data-lock class="ghost">Hide admin</button>
    </section>

    <p id="admin-msg" class="admin-msg"></p>`;

  const msg = el.querySelector('#admin-msg');
  const say = (text, ok = true) => { msg.textContent = text; msg.className = 'admin-msg ' + (ok ? 'ok' : 'err'); };

  el.addEventListener('click', async (e) => {
    try {
      if (e.target.closest('[data-save-pw]')) {
        setPassword(el.querySelector('#pw').value.trim());
        say('Password saved for this tab.');
      } else if (e.target.closest('[data-clear-pw]')) {
        clearPassword();
        el.querySelector('#pw').value = '';
        say('Password cleared.');
      } else if (e.target.closest('[data-seed]')) {
        const pw = el.querySelector('#pw').value.trim() || getPassword();
        const r = await api.setupSheet({ password: pw, dataBaseUrl: DATA_BASE_URL });
        say(r.message || 'Seeded.');
        await refresh();
      } else if (e.target.closest('[data-save-participants]')) {
        const pw = el.querySelector('#pw').value.trim() || getPassword();
        const participants = Array.from(el.querySelectorAll('.pname')).map((inp) => ({
          slot: Number(inp.getAttribute('data-slot')),
          name: inp.value.trim(),
        }));
        const r = await api.setParticipants({ password: pw, participants });
        say(r.message || 'Saved.');
        await refresh();
      } else if (e.target.closest('[data-act]')) {
        const act = e.target.closest('[data-act]').getAttribute('data-act');
        const pw = el.querySelector('#pw').value.trim() || getPassword();
        if (act === 'start') {
          const r = await api.startDraft({ password: pw });
          say(r.message || 'Draft started.');
        } else if (act === 'undo') {
          const r = await api.undoPick({ password: pw });
          say(r.message || 'Undone.');
        } else if (act === 'reset') {
          if (!confirm('Reset the entire draft? All picks will be cleared.')) return;
          const r = await api.resetDraft({ password: pw });
          say(r.message || 'Reset.');
        }
        await refresh();
      } else if (e.target.closest('[data-lock]')) {
        lockAdmin();
        location.hash = 'leaderboard';
        location.reload();
      }
    } catch (err) {
      say(err.message || String(err), false);
    }
  });

  return el;
}
