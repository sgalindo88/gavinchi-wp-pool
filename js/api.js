import { API_URL } from './config.js';

// GET requests are simple cross-origin requests (no preflight).
export async function getState() {
  const res = await fetch(`${API_URL}?action=getState`, { method: 'GET' });
  return res.json();
}

// POST as text/plain to avoid a CORS preflight (Apps Script can't answer one).
// The body is JSON; the backend parses e.postData.contents.
export async function post(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  getState,
  setupSheet: (p) => post('setupSheet', p),
  setParticipants: (p) => post('setParticipants', p),
  startDraft: (p) => post('startDraft', p),
  resetDraft: (p) => post('resetDraft', p),
  makePick: (p) => post('makePick', p),
  undoPick: (p) => post('undoPick', p),
  enterResult: (p) => post('enterResult', p),
  clearResult: (p) => post('clearResult', p),
  addKnockoutMatch: (p) => post('addKnockoutMatch', p),
};
