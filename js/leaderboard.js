// Head-to-head league standings, computed from final match results.
//
// Rule: a match counts only when its two teams have DIFFERENT owners.
//   - winner's owner: +3 (a "win")
//   - draw (group stage only): 0 to both (a "draw")
//   - knockout tie resolved by WinnerTeamId -> that owner wins
//   - same owner owns both teams (possible in knockouts): skipped, no points
// Tiebreaker: head-to-head points between the tied players, then goal diff.

export function computeStandings(state) {
  const stats = {};
  state.participants.forEach((p) => {
    stats[String(p.PlayerId)] = {
      playerId: String(p.PlayerId),
      name: p.Name,
      played: 0, w: 0, d: 0, l: 0,
      gf: 0, ga: 0, pts: 0,
      h2h: {}, // h2h[oppId] = points earned vs that opponent
    };
  });

  const addH2H = (a, b, points) => {
    if (!stats[a].h2h[b]) stats[a].h2h[b] = 0;
    stats[a].h2h[b] += points;
  };

  (state.matches || []).forEach((m) => {
    if (String(m.Status) !== 'final') return;
    const homeId = String(m.HomeTeamId);
    const awayId = String(m.AwayTeamId);
    const oH = state.ownerByTeamId[homeId];
    const oA = state.ownerByTeamId[awayId];
    if (!oH || !oA) return;       // an undrafted team — no head-to-head
    if (oH === oA) return;        // same owner — team just advances, no points

    const hs = Number(m.HomeScore);
    const as = Number(m.AwayScore);
    if (Number.isNaN(hs) || Number.isNaN(as)) return;

    const sH = stats[oH], sA = stats[oA];
    sH.played++; sA.played++;
    sH.gf += hs; sH.ga += as;
    sA.gf += as; sA.ga += hs;

    let winnerOwner = null;
    if (hs > as) winnerOwner = oH;
    else if (as > hs) winnerOwner = oA;
    else if (m.WinnerTeamId) winnerOwner = state.ownerByTeamId[String(m.WinnerTeamId)] || null;

    if (winnerOwner === oH) {
      sH.w++; sH.pts += 3; sA.l++;
      addH2H(oH, oA, 3);
    } else if (winnerOwner === oA) {
      sA.w++; sA.pts += 3; sH.l++;
      addH2H(oA, oH, 3);
    } else {
      sH.d++; sA.d++; // draw, 0 points each
    }
  });

  const rows = Object.values(stats).map((s) => ({ ...s, gd: s.gf - s.ga }));

  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    // head-to-head points between exactly these two players
    const aVsB = a.h2h[b.playerId] || 0;
    const bVsA = b.h2h[a.playerId] || 0;
    if (aVsB !== bVsA) return bVsA - aVsB;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });

  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function renderLeaderboard(state) {
  const el = document.createElement('div');
  if (!state.participants.length) {
    el.innerHTML = '<p class="muted">No participants yet.</p>';
    return el;
  }
  const rows = computeStandings(state);
  const body = rows.map((r) => `
    <tr>
      <td class="rank">${r.rank}</td>
      <td class="name">${escapeHtml(r.name)}</td>
      <td>${r.played}</td>
      <td>${r.w}</td>
      <td>${r.d}</td>
      <td>${r.l}</td>
      <td>${r.gf}</td>
      <td>${r.ga}</td>
      <td>${r.gd > 0 ? '+' : ''}${r.gd}</td>
      <td class="pts">${r.pts}</td>
    </tr>`).join('');

  el.innerHTML = `
    <h2>Leaderboard</h2>
    <p class="muted">Win = 3 · Draw = 0 · Tiebreaker: head-to-head, then goal difference.</p>
    <table class="standings">
      <thead>
        <tr><th>#</th><th>Player</th><th title="Played">P</th><th>W</th><th>D</th><th>L</th>
            <th title="Goals for">GF</th><th title="Goals against">GA</th><th>GD</th><th>Pts</th></tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
  return el;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
