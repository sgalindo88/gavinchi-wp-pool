import { api } from './api.js';
import { refresh, ensurePassword, teamName } from './state.js';
import { escapeHtml } from './leaderboard.js';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function renderDraft(state) {
  const el = document.createElement('div');
  el.className = 'draft-view';

  const status = state.draftStatus;
  const onClock = state.onClock;

  // --- Header / status ---
  let head = `<h2>Draft</h2>`;
  if (status === 'not_started') {
    head += `<p class="banner">Draft has not started.</p>`;
  } else if (status === 'complete') {
    head += `<p class="banner done">Draft complete — all ${state.totalPicks} picks made.</p>`;
  } else if (onClock) {
    head += `<p class="banner live">On the clock: <strong>${escapeHtml(onClock.playerName || '?')}</strong>
      &nbsp;·&nbsp; Pick ${onClock.pickNumber}/${state.totalPicks} &nbsp;·&nbsp; Round ${onClock.round}</p>`;
  }

  // --- Admin controls ---
  let controls = `<div class="admin-controls">`;
  if (status === 'not_started') {
    controls += `<button data-act="start">Start draft</button>`;
  }
  if (status === 'in_progress' || status === 'complete') {
    controls += `<button data-act="undo">Undo last pick</button>`;
  }
  controls += `<button data-act="reset" class="danger">Reset draft</button>`;
  controls += `</div>`;

  // --- Draft order (slots) ---
  const bySlot = state.participants.slice().sort((a, b) => Number(a.DraftSlot) - Number(b.DraftSlot));
  const order = bySlot.map((p) => {
    const isUp = onClock && String(onClock.playerId) === String(p.PlayerId);
    const count = (state.picksByPlayer[String(p.PlayerId)] || []).length;
    return `<li class="${isUp ? 'up' : ''}">
      <span class="slot">${p.DraftSlot}</span>
      <span class="pname">${escapeHtml(p.Name)}</span>
      <span class="cnt">${count}/${state.teamsPerPlayer}</span>
    </li>`;
  }).join('');

  // --- Available teams grouped by WC group ---
  const currentPlayerId = onClock ? String(onClock.playerId) : null;
  const ownedGroupsByCurrent = new Set();
  if (currentPlayerId) {
    (state.picksByPlayer[currentPlayerId] || []).forEach((t) => ownedGroupsByCurrent.add(t.GroupLetter));
  }

  const groupsHtml = GROUPS.map((g) => {
    const teams = state.teams.filter((t) => t.GroupLetter === g);
    if (!teams.length) return '';
    const currentOwnsGroup = ownedGroupsByCurrent.has(g);
    const cells = teams.map((t) => {
      const tid = String(t.TeamId);
      const ownerPid = state.ownerByTeamId[tid];
      if (ownerPid) {
        const owner = state.participantsById[ownerPid];
        return `<div class="team taken">
          <span>${t.FlagEmoji || ''} ${escapeHtml(t.Name)}</span>
          <span class="owner">${escapeHtml(owner ? owner.Name : '?')}</span>
        </div>`;
      }
      const canPick = status === 'in_progress' && currentPlayerId && !currentOwnsGroup;
      const reason = currentOwnsGroup ? 'already has Group ' + g : '';
      return `<div class="team ${canPick ? 'avail' : 'blocked'}" ${canPick ? `data-pick="${tid}"` : ''} title="${reason}">
        <span>${t.FlagEmoji || ''} ${escapeHtml(t.Name)}</span>
        ${reason ? `<span class="blocked-reason">⛔</span>` : ''}
      </div>`;
    }).join('');
    return `<div class="group ${currentOwnsGroup ? 'group-blocked' : ''}">
      <h4>Group ${g}${currentOwnsGroup ? ' · taken' : ''}</h4>${cells}</div>`;
  }).join('');

  // --- Pick log ---
  const log = state.picks
    .slice()
    .sort((a, b) => Number(b.PickNumber) - Number(a.PickNumber))
    .map((pk) => {
      const p = state.participantsById[String(pk.PlayerId)];
      return `<li><span class="pn">#${pk.PickNumber}</span> ${escapeHtml(p ? p.Name : '?')} → ${teamName(state, pk.TeamId)}</li>`;
    }).join('');

  el.innerHTML = `
    ${head}
    ${controls}
    <div class="draft-grid">
      <aside class="draft-side">
        <h3>Order</h3>
        <ul class="order">${order}</ul>
        <h3>Picks</h3>
        <ul class="picklog">${log || '<li class="muted">No picks yet.</li>'}</ul>
      </aside>
      <section class="board">${groupsHtml}</section>
    </div>`;

  // --- Wiring ---
  el.addEventListener('click', async (e) => {
    const pickEl = e.target.closest('[data-pick]');
    const actEl = e.target.closest('[data-act]');
    try {
      if (pickEl) {
        const teamId = pickEl.getAttribute('data-pick');
        const pw = ensurePassword();
        if (!pw) return;
        await api.makePick({ password: pw, playerId: currentPlayerId, teamId });
        await refresh();
      } else if (actEl) {
        const act = actEl.getAttribute('data-act');
        const pw = ensurePassword();
        if (!pw) return;
        if (act === 'start') {
          await api.startDraft({ password: pw });
        } else if (act === 'undo') {
          await api.undoPick({ password: pw });
        } else if (act === 'reset') {
          if (!confirm('Reset the entire draft? All picks will be cleared.')) return;
          await api.resetDraft({ password: pw });
        }
        await refresh();
      }
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  return el;
}
