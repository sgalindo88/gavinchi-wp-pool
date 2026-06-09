import { computeStandings, escapeHtml } from './leaderboard.js';

export function renderRosters(state) {
  const el = document.createElement('div');
  el.className = 'rosters-view';

  if (!state.participants.length) {
    el.innerHTML = '<h2>Rosters</h2><p class="muted">No participants yet — set them up in the Admin panel.</p>';
    return el;
  }

  const standings = computeStandings(state);
  const recordByPlayer = {};
  standings.forEach((s) => { recordByPlayer[s.playerId] = s; });

  const bySlot = state.participants.slice().sort((a, b) => Number(a.DraftSlot) - Number(b.DraftSlot));
  const cards = bySlot.map((p) => {
    const pid = String(p.PlayerId);
    const teams = (state.picksByPlayer[pid] || []);
    const rec = recordByPlayer[pid] || { w: 0, d: 0, l: 0, pts: 0 };
    const teamList = teams.map((t) => `
      <li><span class="badge">${escapeHtml(t.GroupLetter)}</span> ${t.FlagEmoji || ''} ${escapeHtml(t.Name)}</li>`).join('');
    return `<div class="roster-card">
      <div class="roster-head">
        <h3>${escapeHtml(p.Name)}</h3>
        <span class="record">${rec.w}W · ${rec.d}D · ${rec.l}L &nbsp;<strong>${rec.pts} pts</strong></span>
      </div>
      <ul class="roster-teams">${teamList || '<li class="muted">No teams yet.</li>'}</ul>
      <div class="roster-foot muted">${teams.length}/${state.teamsPerPlayer} teams</div>
    </div>`;
  }).join('');

  el.innerHTML = `<h2>Rosters</h2><div class="roster-grid">${cards}</div>`;
  return el;
}
