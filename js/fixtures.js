import { api } from './api.js';
import { refresh, ensurePassword, adminUnlocked } from './state.js';
import { escapeHtml } from './leaderboard.js';

const STAGE_LABEL = {
  group: 'Group', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarter-final', SF: 'Semi-final', ThirdPlace: '3rd place', Final: 'Final',
};
const KO_STAGES = ['R32', 'R16', 'QF', 'SF', 'ThirdPlace', 'Final'];

function ownerLabel(state, teamId) {
  const pid = state.ownerByTeamId[String(teamId)];
  const p = pid && state.participantsById[pid];
  return p ? p.Name : '—';
}

function teamCell(state, teamId, side) {
  const t = state.teamsById[String(teamId)];
  const name = t ? `${t.FlagEmoji || ''} ${t.Name}` : String(teamId);
  return `<div class="tcell ${side}">
    <span class="tname">${escapeHtml(name)}</span>
    <span class="towner">${escapeHtml(ownerLabel(state, teamId))}</span>
  </div>`;
}

function resultSummary(state, m) {
  if (String(m.Status) !== 'final') return '';
  const oH = state.ownerByTeamId[String(m.HomeTeamId)];
  const oA = state.ownerByTeamId[String(m.AwayTeamId)];
  const hs = Number(m.HomeScore), as = Number(m.AwayScore);
  if (oH && oA && oH === oA) return `<span class="hres muted">same owner · advances, no points</span>`;
  let winnerOwner = null;
  if (hs > as) winnerOwner = oH;
  else if (as > hs) winnerOwner = oA;
  else if (m.WinnerTeamId) winnerOwner = state.ownerByTeamId[String(m.WinnerTeamId)];
  if (!winnerOwner) return `<span class="hres draw">draw · 0 pts</span>`;
  const p = state.participantsById[winnerOwner];
  return `<span class="hres win">${escapeHtml(p ? p.Name : '?')} +3</span>`;
}

export function renderFixtures(state) {
  const el = document.createElement('div');
  el.className = 'fixtures-view';

  const admin = adminUnlocked(); // only admins see the editing controls

  const matches = (state.matches || []).slice().sort((a, b) => {
    const d = String(a.KickoffDate).localeCompare(String(b.KickoffDate));
    return d !== 0 ? d : String(a.MatchId).localeCompare(String(b.MatchId));
  });

  // group by date
  const byDate = {};
  matches.forEach((m) => {
    const key = m.KickoffDate || 'TBD';
    (byDate[key] = byDate[key] || []).push(m);
  });

  const sections = Object.keys(byDate).sort().map((date) => {
    const rows = byDate[date].map((m) => {
      const isFinal = String(m.Status) === 'final';
      const stage = STAGE_LABEL[m.Stage] || m.Stage;
      const tag = m.Stage === 'group' ? `${stage} ${m.GroupLetter}` : stage;
      const isKO = m.Stage !== 'group';
      const scoreCell = admin
        ? `<div class="score">
             <input type="number" min="0" class="sh" value="${isFinal ? Number(m.HomeScore) : ''}" />
             <span>–</span>
             <input type="number" min="0" class="sa" value="${isFinal ? Number(m.AwayScore) : ''}" />
           </div>`
        : `<div class="score readonly">${isFinal ? `${Number(m.HomeScore)} – ${Number(m.AwayScore)}` : '<span class="vs">vs</span>'}</div>`;

      const winnerSel = (admin && isKO)
        ? `<select class="winner" title="Winner if tied (knockouts)">
             <option value="">winner…</option>
             <option value="${m.HomeTeamId}" ${String(m.WinnerTeamId) === String(m.HomeTeamId) ? 'selected' : ''}>${escapeHtml(state.teamsById[String(m.HomeTeamId)]?.Name || m.HomeTeamId)}</option>
             <option value="${m.AwayTeamId}" ${String(m.WinnerTeamId) === String(m.AwayTeamId) ? 'selected' : ''}>${escapeHtml(state.teamsById[String(m.AwayTeamId)]?.Name || m.AwayTeamId)}</option>
           </select>`
        : '';

      const buttons = admin
        ? `<button class="save" data-save>Save</button>${isFinal ? '<button class="clear" data-clear>✕</button>' : ''}`
        : '';

      return `<div class="match" data-mid="${escapeHtml(String(m.MatchId))}">
        <span class="mtag">${escapeHtml(tag)}</span>
        ${teamCell(state, m.HomeTeamId, 'home')}
        ${scoreCell}
        ${teamCell(state, m.AwayTeamId, 'away')}
        ${winnerSel}
        ${buttons}
        ${resultSummary(state, m)}
      </div>`;
    }).join('');
    return `<div class="date-block"><h3>${escapeHtml(date)}</h3>${rows}</div>`;
  }).join('');

  // Add-knockout-match form
  const teamOpts = state.teams.slice()
    .sort((a, b) => String(a.GroupLetter).localeCompare(String(b.GroupLetter)))
    .map((t) => `<option value="${t.TeamId}">${escapeHtml(`${t.FlagEmoji || ''} ${t.Name} (${t.GroupLetter})`)}</option>`).join('');
  const stageOpts = KO_STAGES.map((s) => `<option value="${s}">${STAGE_LABEL[s]}</option>`).join('');

  const intro = admin
    ? 'Enter scores as matches finish. For a tied knockout, also choose the team that advanced.'
    : 'Results update live. Only the admin can enter scores.';

  const koForm = admin ? `
    <div class="ko-add">
      <h3>Add a knockout match</h3>
      <div class="ko-form">
        <select id="ko-stage">${stageOpts}</select>
        <select id="ko-home">${teamOpts}</select>
        <span>vs</span>
        <select id="ko-away">${teamOpts}</select>
        <input id="ko-date" type="date" />
        <button data-ko-add>Add match</button>
      </div>
    </div>` : '';

  el.innerHTML = `
    <h2>Fixtures &amp; Results</h2>
    <p class="muted">${intro}</p>
    ${sections || '<p class="muted">No matches loaded. Seed the sheet from the Admin panel.</p>'}
    ${koForm}`;

  // --- Wiring ---
  el.addEventListener('click', async (e) => {
    try {
      const saveBtn = e.target.closest('[data-save]');
      const clearBtn = e.target.closest('[data-clear]');
      const koAdd = e.target.closest('[data-ko-add]');

      if (saveBtn) {
        const row = saveBtn.closest('.match');
        const matchId = row.getAttribute('data-mid');
        const hs = row.querySelector('.sh').value;
        const as = row.querySelector('.sa').value;
        if (hs === '' || as === '') { alert('Enter both scores.'); return; }
        const winnerSel = row.querySelector('.winner');
        const pw = ensurePassword(); if (!pw) return;
        await api.enterResult({
          password: pw, matchId,
          homeScore: Number(hs), awayScore: Number(as),
          winnerTeamId: winnerSel ? winnerSel.value : '',
        });
        await refresh();
      } else if (clearBtn) {
        const row = clearBtn.closest('.match');
        const matchId = row.getAttribute('data-mid');
        const pw = ensurePassword(); if (!pw) return;
        await api.clearResult({ password: pw, matchId });
        await refresh();
      } else if (koAdd) {
        const pw = ensurePassword(); if (!pw) return;
        const stage = el.querySelector('#ko-stage').value;
        const home = el.querySelector('#ko-home').value;
        const away = el.querySelector('#ko-away').value;
        const date = el.querySelector('#ko-date').value;
        if (home === away) { alert('Pick two different teams.'); return; }
        await api.addKnockoutMatch({ password: pw, stage, homeTeamId: home, awayTeamId: away, date });
        await refresh();
      }
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  return el;
}
