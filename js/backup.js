// Moving Still's history between browsers. Pure functions only, like progress.js:
// a backup is a plain JSON file the user saves in one browser and imports in another.
// Importing merges, never replaces, so importing the same file twice changes nothing.
import { emptyProgress, dayKey, localOffset } from './progress.js';

export const BACKUP_KEYS = ['settings', 'prefs', 'parked', 'history', 'progress', 'firstUsed', 'lastSummary', 'seenWelcome'];

// Settings that belong to one install and must not travel with the file.
const LOCAL_ONLY_SETTINGS = ['googleClientId', 'walletApi', 'calendarConnected'];

export function makeBackup(stored, now) {
  const data = {};
  for (const k of BACKUP_KEYS) if (stored[k] != null) data[k] = stored[k];
  if (data.settings) {
    data.settings = Object.assign({}, data.settings);
    for (const k of LOCAL_ONLY_SETTINGS) delete data.settings[k];
  }
  return { app: 'still', type: 'backup', v: 1, exportedAt: now, data };
}

// Returns the data part of a backup file, or null when it isn't one.
export function readBackup(json) {
  let b = json;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return null; } }
  if (!b || b.app !== 'still' || b.type !== 'backup' || b.v !== 1 || !b.data || typeof b.data !== 'object') return null;
  return b.data;
}

function historyKey(h) {
  return h.sessionId || [h.kind || 'focus', h.task || '', h.endedAt || 0].join('|');
}

// The local day a scored history entry counted for (the day its timer started).
function entryDay(h) {
  const start = (h.endedAt || 0) - (h.scoredMinutes || h.minutesFocused || 0) * 60000;
  return dayKey(start, localOffset(start));
}

function mergeProgress(a, b, history) {
  const pa = a && a.v === 1 ? a : emptyProgress();
  const pb = b && b.v === 1 ? b : emptyProgress();
  const inA = new Set(pa.awarded), inB = new Set(pb.awarded);
  if (pb.awarded.every((id) => inA.has(id)) && Object.keys(pb.days).every((k) => pa.days[k])) return pa;
  if (pa.awarded.every((id) => inB.has(id)) && Object.keys(pa.days).every((k) => pb.days[k])) return Object.assign({}, pb, { last: pa.last || pb.last });
  // Both sides hold sessions the other lacks: add the days, then take back the
  // sessions both sides already counted so nothing is counted twice.
  const days = {};
  for (const src of [pa.days, pb.days]) {
    for (const [k, d] of Object.entries(src)) {
      const cur = days[k] || { points: 0, minutes: 0, sessions: 0 };
      days[k] = { points: cur.points + d.points, minutes: cur.minutes + d.minutes, sessions: cur.sessions + d.sessions };
    }
  }
  const taken = new Set();
  for (const h of history) {
    if (!h.sessionId || !h.eligible || !inA.has(h.sessionId) || !inB.has(h.sessionId) || taken.has(h.sessionId)) continue;
    taken.add(h.sessionId);
    const d = days[entryDay(h)];
    if (!d) continue;
    d.points = Math.max(0, d.points - (h.points || 0));
    d.minutes = Math.max(0, d.minutes - (h.scoredMinutes || 0));
    d.sessions = Math.max(0, d.sessions - 1);
  }
  const awarded = pa.awarded.concat(pb.awarded.filter((id) => !inA.has(id))).slice(-500);
  const totalPoints = Object.values(days).reduce((n, d) => n + d.points, 0);
  return { v: 1, totalPoints, days, awarded, last: pa.last || pb.last };
}

// Merges an imported backup into what this browser already has.
// Returns the values to write and counts for the message shown to the user.
export function mergeBackup(cur, inc) {
  const curHistory = cur.history || [];
  const seenH = new Set(curHistory.map(historyKey));
  const newHistory = (inc.history || []).filter((h) => h && !seenH.has(historyKey(h)));
  const history = curHistory.concat(newHistory).sort((x, y) => (x.endedAt || 0) - (y.endedAt || 0)).slice(-300);

  const curParked = cur.parked || [];
  const seenP = new Set(curParked.map((p) => p.id));
  const newParked = (inc.parked || []).filter((p) => p && p.id && !seenP.has(p.id));
  const parked = curParked.concat(newParked).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));

  const progress = mergeProgress(cur.progress, inc.progress, curHistory.concat(inc.history || []));

  const firsts = [cur.firstUsed, inc.firstUsed].filter((n) => n > 0);
  const firstUsed = firsts.length ? Math.min(...firsts) : 0;

  const settings = Object.assign({}, cur.settings || {});
  const sites = (settings.sites || []).slice();
  let newSites = 0;
  for (const s of (inc.settings && inc.settings.sites) || []) if (!sites.includes(s)) { sites.push(s); newSites += 1; }
  settings.sites = sites;

  const out = { history, parked, progress, firstUsed, settings, seenWelcome: !!(cur.seenWelcome || inc.seenWelcome) };
  if (!cur.lastSummary && inc.lastSummary) out.lastSummary = inc.lastSummary;
  return { values: out, added: { sessions: newHistory.length, thoughts: newParked.length, sites: newSites } };
}
