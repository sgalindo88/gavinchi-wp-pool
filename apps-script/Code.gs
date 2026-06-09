/**
 * World Cup 2026 Draft Pool — Google Apps Script backend.
 *
 * Deploy this as a Web App (Deploy ▸ New deployment ▸ Web app):
 *   - Execute as:  Me
 *   - Who has access:  Anyone
 * Copy the resulting /exec URL into the front-end (js/config.js → API_URL).
 *
 * The bound spreadsheet is the database. Run `setupSheet` once (or POST
 * action=setupSheet) to create the tabs and seed Teams + Matches from the
 * JSON files served by the static site.
 *
 * All write actions require the admin password, which is checked here on the
 * server against the Config tab — never trust the client alone.
 */

var SHEETS = {
  CONFIG: 'Config',
  TEAMS: 'Teams',
  PARTICIPANTS: 'Participants',
  PICKS: 'Picks',
  MATCHES: 'Matches'
};

var NUM_PLAYERS = 5;
var TEAMS_PER_PLAYER = 9;
var TOTAL_PICKS = NUM_PLAYERS * TEAMS_PER_PLAYER; // 45

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getState';
  return dispatch(action, e.parameter || {});
}

function doPost(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return jsonOut({ ok: false, error: 'Invalid JSON body' });
  }
  var action = params.action || (e && e.parameter && e.parameter.action) || '';
  return dispatch(action, params);
}

function dispatch(action, params) {
  try {
    switch (action) {
      case 'getState':         return jsonOut(getState());
      case 'setupSheet':       return jsonOut(setupSheet(params));
      case 'setParticipants': return jsonOut(setParticipants(params));
      case 'startDraft':       return jsonOut(startDraft(params));
      case 'resetDraft':       return jsonOut(resetDraft(params));
      case 'makePick':         return jsonOut(makePick(params));
      case 'undoPick':         return jsonOut(undoPick(params));
      case 'enterResult':      return jsonOut(enterResult(params));
      case 'clearResult':      return jsonOut(clearResult(params));
      case 'addKnockoutMatch': return jsonOut(addKnockoutMatch(params));
      default:
        return jsonOut({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

function getState() {
  var teams = readObjects(SHEETS.TEAMS);
  var participants = readObjects(SHEETS.PARTICIPANTS)
    .sort(function (a, b) { return Number(a.DraftSlot) - Number(b.DraftSlot); });
  var picks = readObjects(SHEETS.PICKS)
    .sort(function (a, b) { return Number(a.PickNumber) - Number(b.PickNumber); });
  var matches = readObjects(SHEETS.MATCHES);
  var config = readConfig();

  var draftStatus = config.draftStatus || 'not_started';
  var currentPickNumber = Number(config.currentPickNumber || 0);

  var onClock = null;
  if (draftStatus === 'in_progress' && currentPickNumber >= 1 && currentPickNumber <= TOTAL_PICKS) {
    var slot = slotForPick(currentPickNumber);
    var who = participants.filter(function (p) { return Number(p.DraftSlot) === slot; })[0];
    onClock = {
      pickNumber: currentPickNumber,
      round: Math.ceil(currentPickNumber / NUM_PLAYERS),
      slot: slot,
      playerId: who ? who.PlayerId : null,
      playerName: who ? who.Name : null
    };
  }

  return {
    ok: true,
    draftStatus: draftStatus,
    currentPickNumber: currentPickNumber,
    totalPicks: TOTAL_PICKS,
    teamsPerPlayer: TEAMS_PER_PLAYER,
    onClock: onClock,
    teams: teams,
    participants: participants,
    picks: picks,
    matches: matches
  };
}

// ---------------------------------------------------------------------------
// Snake draft order
// ---------------------------------------------------------------------------

/** 1-indexed pick number -> draft slot (1..NUM_PLAYERS), snaking each round. */
function slotForPick(pickNumber) {
  var round = Math.ceil(pickNumber / NUM_PLAYERS);        // 1..9
  var indexInRound = (pickNumber - 1) % NUM_PLAYERS;      // 0..4
  return (round % 2 === 1)
    ? indexInRound + 1                                     // odd round: 1..5
    : NUM_PLAYERS - indexInRound;                          // even round: 5..1
}

// ---------------------------------------------------------------------------
// Draft lifecycle
// ---------------------------------------------------------------------------

/**
 * Replace the participant list. params.participants = [{name, slot}, ...].
 * Disallowed once the draft has started (would invalidate picks).
 */
function setParticipants(params) {
  requireAdmin(params);
  var config = readConfig();
  if ((config.draftStatus || 'not_started') !== 'not_started') {
    return { ok: false, error: 'Cannot change participants after the draft has started. Reset the draft first.' };
  }
  var list = params.participants || [];
  if (list.length !== NUM_PLAYERS) {
    return { ok: false, error: 'Need exactly ' + NUM_PLAYERS + ' participants.' };
  }
  ensureSheet(SHEETS.PARTICIPANTS, ['PlayerId', 'Name', 'DraftSlot']);
  clearDataRows(SHEETS.PARTICIPANTS);
  for (var i = 0; i < list.length; i++) {
    var slot = Number(list[i].slot) || (i + 1);
    var name = String(list[i].name || '').trim();
    if (!name) return { ok: false, error: 'Every participant needs a name.' };
    appendRow(SHEETS.PARTICIPANTS, { PlayerId: 'P' + slot, Name: name, DraftSlot: slot });
  }
  return { ok: true, message: 'Saved ' + list.length + ' participants.' };
}

function startDraft(params) {
  requireAdmin(params);
  var participants = readObjects(SHEETS.PARTICIPANTS);
  if (participants.length !== NUM_PLAYERS) {
    return { ok: false, error: 'Need exactly ' + NUM_PLAYERS + ' participants (found ' + participants.length + ').' };
  }
  var slots = participants.map(function (p) { return Number(p.DraftSlot); }).sort();
  for (var i = 0; i < NUM_PLAYERS; i++) {
    if (slots[i] !== i + 1) {
      return { ok: false, error: 'Participant DraftSlots must be exactly 1..' + NUM_PLAYERS + ' with no duplicates.' };
    }
  }
  setConfig('draftStatus', 'in_progress');
  setConfig('currentPickNumber', 1);
  return { ok: true, message: 'Draft started.' };
}

function resetDraft(params) {
  requireAdmin(params);
  clearDataRows(SHEETS.PICKS);
  setConfig('draftStatus', 'not_started');
  setConfig('currentPickNumber', 0);
  return { ok: true, message: 'Draft reset. Picks cleared.' };
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

function makePick(params) {
  requireAdmin(params);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var config = readConfig();
    if ((config.draftStatus || 'not_started') !== 'in_progress') {
      return { ok: false, error: 'Draft is not in progress.' };
    }
    var pickNumber = Number(config.currentPickNumber || 0);
    if (pickNumber < 1 || pickNumber > TOTAL_PICKS) {
      return { ok: false, error: 'Draft is complete.' };
    }

    var participants = readObjects(SHEETS.PARTICIPANTS);
    var slot = slotForPick(pickNumber);
    var who = participants.filter(function (p) { return Number(p.DraftSlot) === slot; })[0];
    if (!who) return { ok: false, error: 'No participant in draft slot ' + slot + '.' };

    if (params.playerId && String(params.playerId) !== String(who.PlayerId)) {
      return { ok: false, error: 'It is not that participant’s turn. On the clock: ' + who.Name + '.' };
    }

    var teamId = String(params.teamId || '');
    var teams = readObjects(SHEETS.TEAMS);
    var team = teams.filter(function (t) { return String(t.TeamId) === teamId; })[0];
    if (!team) return { ok: false, error: 'Unknown team: ' + teamId };

    var picks = readObjects(SHEETS.PICKS);
    var taken = picks.filter(function (p) { return String(p.TeamId) === teamId; })[0];
    if (taken) return { ok: false, error: team.Name + ' has already been drafted.' };

    // Group constraint: this participant may not already own a team in this group.
    var ownsSameGroup = picks.filter(function (p) {
      if (String(p.PlayerId) !== String(who.PlayerId)) return false;
      var t = teams.filter(function (x) { return String(x.TeamId) === String(p.TeamId); })[0];
      return t && t.GroupLetter === team.GroupLetter;
    })[0];
    if (ownsSameGroup) {
      return { ok: false, error: who.Name + ' already has a team in Group ' + team.GroupLetter + '.' };
    }

    var round = Math.ceil(pickNumber / NUM_PLAYERS);
    appendRow(SHEETS.PICKS, {
      PickNumber: pickNumber,
      Round: round,
      PlayerId: who.PlayerId,
      TeamId: teamId,
      Timestamp: new Date()
    });

    var next = pickNumber + 1;
    if (next > TOTAL_PICKS) {
      setConfig('currentPickNumber', TOTAL_PICKS + 1);
      setConfig('draftStatus', 'complete');
    } else {
      setConfig('currentPickNumber', next);
    }

    return { ok: true, message: who.Name + ' drafted ' + team.Name + '.', pickNumber: pickNumber };
  } finally {
    lock.releaseLock();
  }
}

function undoPick(params) {
  requireAdmin(params);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet(SHEETS.PICKS);
    var picks = readObjects(SHEETS.PICKS);
    if (!picks.length) return { ok: false, error: 'No picks to undo.' };

    // Highest PickNumber is the most recent pick.
    var maxPick = picks.reduce(function (m, p) { return Math.max(m, Number(p.PickNumber)); }, 0);

    // Delete the row whose PickNumber === maxPick.
    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var col = header.indexOf('PickNumber');
    for (var r = data.length - 1; r >= 1; r--) {
      if (Number(data[r][col]) === maxPick) {
        sheet.deleteRow(r + 1);
        break;
      }
    }

    setConfig('currentPickNumber', maxPick);
    setConfig('draftStatus', 'in_progress');
    return { ok: true, message: 'Undid pick #' + maxPick + '.', currentPickNumber: maxPick };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function enterResult(params) {
  requireAdmin(params);
  var matchId = String(params.matchId || '');
  var home = Number(params.homeScore);
  var away = Number(params.awayScore);
  if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
    return { ok: false, error: 'Scores must be non-negative numbers.' };
  }

  var sheet = getSheet(SHEETS.MATCHES);
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var idx = columnIndex(header, ['MatchId', 'Stage', 'HomeTeamId', 'AwayTeamId', 'HomeScore', 'AwayScore', 'WinnerTeamId', 'Status']);

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idx.MatchId]) === matchId) {
      var stage = String(data[r][idx.Stage]);
      var winner = String(params.winnerTeamId || '');

      // Knockout matches cannot end in a draw — a winner must advance.
      if (stage !== 'group' && home === away && !winner) {
        return { ok: false, error: 'A tied knockout match needs winnerTeamId (the team that advanced).' };
      }
      if (home !== away) winner = ''; // decisive result: winner derived from score

      var row = r + 1;
      sheet.getRange(row, idx.HomeScore + 1).setValue(home);
      sheet.getRange(row, idx.AwayScore + 1).setValue(away);
      sheet.getRange(row, idx.WinnerTeamId + 1).setValue(winner);
      sheet.getRange(row, idx.Status + 1).setValue('final');
      return { ok: true, message: 'Result saved for ' + matchId + '.' };
    }
  }
  return { ok: false, error: 'Unknown match: ' + matchId };
}

function clearResult(params) {
  requireAdmin(params);
  var matchId = String(params.matchId || '');
  var sheet = getSheet(SHEETS.MATCHES);
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var idx = columnIndex(header, ['MatchId', 'HomeScore', 'AwayScore', 'WinnerTeamId', 'Status']);
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idx.MatchId]) === matchId) {
      var row = r + 1;
      sheet.getRange(row, idx.HomeScore + 1).setValue('');
      sheet.getRange(row, idx.AwayScore + 1).setValue('');
      sheet.getRange(row, idx.WinnerTeamId + 1).setValue('');
      sheet.getRange(row, idx.Status + 1).setValue('scheduled');
      return { ok: true, message: 'Result cleared for ' + matchId + '.' };
    }
  }
  return { ok: false, error: 'Unknown match: ' + matchId };
}

function addKnockoutMatch(params) {
  requireAdmin(params);
  var stage = String(params.stage || '');
  var validStages = ['R32', 'R16', 'QF', 'SF', 'ThirdPlace', 'Final'];
  if (validStages.indexOf(stage) === -1) {
    return { ok: false, error: 'Stage must be one of: ' + validStages.join(', ') };
  }
  var teams = readObjects(SHEETS.TEAMS);
  var ids = teams.map(function (t) { return String(t.TeamId); });
  var home = String(params.homeTeamId || '');
  var away = String(params.awayTeamId || '');
  if (ids.indexOf(home) === -1 || ids.indexOf(away) === -1) {
    return { ok: false, error: 'Both teams must be valid team IDs.' };
  }
  // Generate a unique MatchId like K-R16-3
  var existing = readObjects(SHEETS.MATCHES)
    .filter(function (m) { return String(m.MatchId).indexOf('K-' + stage + '-') === 0; });
  var matchId = 'K-' + stage + '-' + (existing.length + 1);
  appendRow(SHEETS.MATCHES, {
    MatchId: matchId,
    Stage: stage,
    GroupLetter: '',
    HomeTeamId: home,
    AwayTeamId: away,
    KickoffDate: params.date || '',
    HomeScore: '',
    AwayScore: '',
    WinnerTeamId: '',
    Status: 'scheduled'
  });
  return { ok: true, message: 'Added ' + stage + ' match ' + matchId + '.', matchId: matchId };
}

// ---------------------------------------------------------------------------
// Setup / seeding
// ---------------------------------------------------------------------------

/**
 * Create tabs (if missing) and seed Teams + Matches from the static-site JSON.
 * params.dataBaseUrl should point at the folder serving teams-2026.json and
 * fixtures-2026.json (e.g. https://user.github.io/wc/docs). Falls back to the
 * Config value `dataBaseUrl` if not supplied.
 */
function setupSheet(params) {
  requireAdmin(params);
  ensureSheet(SHEETS.CONFIG, ['Key', 'Value']);
  ensureSheet(SHEETS.TEAMS, ['TeamId', 'Name', 'GroupLetter', 'FlagEmoji']);
  ensureSheet(SHEETS.PARTICIPANTS, ['PlayerId', 'Name', 'DraftSlot']);
  ensureSheet(SHEETS.PICKS, ['PickNumber', 'Round', 'PlayerId', 'TeamId', 'Timestamp']);
  ensureSheet(SHEETS.MATCHES, ['MatchId', 'Stage', 'GroupLetter', 'HomeTeamId', 'AwayTeamId', 'KickoffDate', 'HomeScore', 'AwayScore', 'WinnerTeamId', 'Status']);

  // Config defaults (do not clobber an existing password).
  var config = readConfig();
  if (!config.adminPassword) setConfig('adminPassword', String(params.password || 'changeme'));
  if (!config.draftStatus) setConfig('draftStatus', 'not_started');
  if (config.currentPickNumber === undefined) setConfig('currentPickNumber', 0);

  var base = params.dataBaseUrl || config.dataBaseUrl;
  if (!base) {
    return { ok: false, error: 'Provide dataBaseUrl (folder serving teams-2026.json & fixtures-2026.json).' };
  }
  base = base.replace(/\/$/, '');
  setConfig('dataBaseUrl', base);

  var teams = JSON.parse(UrlFetchApp.fetch(base + '/teams-2026.json').getContentText());
  var fixtures = JSON.parse(UrlFetchApp.fetch(base + '/fixtures-2026.json').getContentText());

  // Repopulate Teams.
  clearDataRows(SHEETS.TEAMS);
  teams.forEach(function (t) {
    appendRow(SHEETS.TEAMS, { TeamId: t.id, Name: t.name, GroupLetter: t.group, FlagEmoji: t.flag || '' });
  });

  // Repopulate Matches (group stage only; knockout added later).
  clearDataRows(SHEETS.MATCHES);
  fixtures.forEach(function (m) {
    appendRow(SHEETS.MATCHES, {
      MatchId: m.id,
      Stage: m.stage,
      GroupLetter: m.group || '',
      HomeTeamId: m.home,
      AwayTeamId: m.away,
      KickoffDate: m.date || '',
      HomeScore: '',
      AwayScore: '',
      WinnerTeamId: '',
      Status: 'scheduled'
    });
  });

  return { ok: true, message: 'Seeded ' + teams.length + ' teams and ' + fixtures.length + ' fixtures.' };
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name) {
  var sheet = ss().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab: ' + name + '. Run setupSheet first.');
  return sheet;
}

function ensureSheet(name, header) {
  var sheet = ss().getSheetByName(name);
  if (!sheet) {
    sheet = ss().insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}

/** Read a tab as an array of objects keyed by the header row. */
function readObjects(name) {
  var sheet = getSheet(name);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0];
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (row.join('') === '') continue; // skip blank rows
    var obj = {};
    for (var c = 0; c < header.length; c++) {
      obj[header[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function appendRow(name, obj) {
  var sheet = getSheet(name);
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = header.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sheet.appendRow(row);
}

/** Delete all rows below the header. */
function clearDataRows(name) {
  var sheet = getSheet(name);
  var last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
}

function columnIndex(header, names) {
  var idx = {};
  names.forEach(function (n) { idx[n] = header.indexOf(n); });
  return idx;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readConfig() {
  var sheet = ss().getSheetByName(SHEETS.CONFIG);
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var cfg = {};
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === '' && data[r][1] === '') continue;
    cfg[String(data[r][0])] = data[r][1];
  }
  return cfg;
}

function setConfig(key, value) {
  var sheet = ensureSheet(SHEETS.CONFIG, ['Key', 'Value']);
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === key) {
      sheet.getRange(r + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function requireAdmin(params) {
  var cfg = readConfig();
  var expected = String(cfg.adminPassword || '');
  if (!expected) throw new Error('Admin password not set. Run setupSheet first.');
  if (String((params && params.password) || '') !== expected) {
    throw new Error('Wrong admin password.');
  }
}
