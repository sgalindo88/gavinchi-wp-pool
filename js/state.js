import { api } from './api.js';
import { POLL_MS } from './config.js';

// Central store: latest server state + derived lookups, with a tiny pub/sub.

let state = null;
let listeners = [];
let pollTimer = null;
let lastError = null;

export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

function emit() {
  listeners.forEach((fn) => fn(state, lastError));
}

export async function refresh() {
  try {
    const data = await api.getState();
    if (!data.ok) throw new Error(data.error || 'getState failed');
    state = decorate(data);
    lastError = null;
  } catch (err) {
    lastError = err.message || String(err);
  }
  emit();
  return state;
}

export function startPolling() {
  if (pollTimer) return;
  refresh();
  pollTimer = setInterval(refresh, POLL_MS);
}

export function getStateNow() { return state; }
export function getError() { return lastError; }

// --- Admin password (kept only in this browser tab) ---------------------------

const PW_KEY = 'wc_admin_pw';
export function getPassword() { return sessionStorage.getItem(PW_KEY) || ''; }
export function setPassword(pw) { sessionStorage.setItem(PW_KEY, pw || ''); }
export function ensurePassword() {
  let pw = getPassword();
  if (!pw) {
    pw = window.prompt('Enter the admin password:') || '';
    if (pw) setPassword(pw);
  }
  return pw;
}
export function clearPassword() { sessionStorage.removeItem(PW_KEY); }

// Admin-panel visibility is separate from the password (players share the
// password to make picks). It "unlocks" only when the secret #admin route is
// visited, and stays unlocked for this browser tab.
const ADMIN_KEY = 'wc_admin_unlocked';
export function adminUnlocked() { return sessionStorage.getItem(ADMIN_KEY) === '1'; }
export function unlockAdmin() { sessionStorage.setItem(ADMIN_KEY, '1'); }
export function lockAdmin() { sessionStorage.removeItem(ADMIN_KEY); }

// --- Derived lookups ----------------------------------------------------------

function decorate(data) {
  const teamsById = {};
  data.teams.forEach((t) => { teamsById[String(t.TeamId)] = t; });

  const participantsById = {};
  data.participants.forEach((p) => { participantsById[String(p.PlayerId)] = p; });

  // ownerByTeamId: which player drafted each team.
  const ownerByTeamId = {};
  data.picks.forEach((p) => { ownerByTeamId[String(p.TeamId)] = String(p.PlayerId); });

  // picksByPlayer: teams each player owns (in pick order).
  const picksByPlayer = {};
  data.participants.forEach((p) => { picksByPlayer[String(p.PlayerId)] = []; });
  data.picks
    .slice()
    .sort((a, b) => Number(a.PickNumber) - Number(b.PickNumber))
    .forEach((pk) => {
      const list = picksByPlayer[String(pk.PlayerId)];
      if (list) list.push(teamsById[String(pk.TeamId)]);
    });

  return {
    ...data,
    teamsById,
    participantsById,
    ownerByTeamId,
    picksByPlayer,
  };
}

export function teamName(state, teamId) {
  const t = state.teamsById[String(teamId)];
  return t ? `${t.FlagEmoji || ''} ${t.Name}`.trim() : String(teamId);
}

export function ownerName(state, teamId) {
  const pid = state.ownerByTeamId[String(teamId)];
  const p = pid && state.participantsById[pid];
  return p ? p.Name : null;
}
