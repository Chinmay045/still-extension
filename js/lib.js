// Shared helpers for every Still page and the service worker.

export const DEFAULT_SITES = ['youtube.com', 'x.com', 'reddit.com'];

// The app owner's Google OAuth client ID ("Web application" type, redirect URI
// https://hjcpkhjkanikiahcjmhcblnnkloopnmc.chromiumapp.org/). With it set, users
// connect with one Google sign-in and never see any setup.
export const GOOGLE_CLIENT_ID = '287087142246-v8qephktt73vi27gacha358kc6ibvlkt.apps.googleusercontent.com';

export const DEFAULT_SETTINGS = {
  sites: DEFAULT_SITES.slice(),
  overrideWait: 30,
  chime: true,
  autoCircle: true,
  nightDim: true,
  calendarConnected: false,
  nudgeLeadMin: 10,
  googleClientId: ''
};

export const DEFAULT_PREFS = {
  task: '',
  plannedMin: 25,
  customMin: 90,
  theme: 'vortex',
  sound: 'ambient',
  volume: 70
};

export const SOUNDS = [
  { id: 'ambient', name: 'Ambient instrumental', desc: 'Music with no lyrics, safe for reading and code', tag: 'Default' },
  { id: 'gamma', name: 'Gamma 40 Hz binaural', desc: 'Starts in the focus circle. Needs headphones', tag: 'Headphones' },
  { id: 'beta', name: 'Beta pulse music', desc: 'Soft music with a 16 Hz pulse', tag: 'Pulse' },
  { id: 'cafe', name: 'Cafe murmur', desc: 'Moderate background chatter for creative work', tag: 'Ideas' },
  { id: 'off', name: 'Silence', desc: 'No sound', tag: '' }
];

export const THEMES = [
  { id: 'vortex', name: 'Vortex', desc: 'A turning tunnel of light' },
  { id: 'drift', name: 'Drift', desc: 'A soft galaxy swirl, rose to violet' },
  { id: 'halo', name: 'Halo', desc: 'Fine violet tunnel, warm edges' }
];

export const KINDS = {
  task: { label: 'Task', bg: '#F1E8FE', fg: '#6B2FD6' },
  link: { label: 'Link', bg: '#E8F0FE', fg: '#1F5FC8' },
  idea: { label: 'Idea', bg: '#FDEBF7', fg: '#B0308F' }
};

const TASK_VERBS = ['check', 'look', 'read', 'write', 'email', 'call', 'fix', 'book', 'buy', 'review', 'send', 'update', 'ask', 'schedule', 'plan', 'draft', 'research', 'follow'];

export function kindOf(text) {
  const t = String(text || '').trim().toLowerCase();
  if (/^(https?:\/\/|www\.)\S+$/.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(t)) return 'link';
  const first = t.split(/\s+/)[0].replace(/[^a-z]/g, '');
  return TASK_VERBS.includes(first) ? 'task' : 'idea';
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getAll() {
  const r = await chrome.storage.local.get(['settings', 'prefs', 'session', 'parked', 'lastSummary', 'calendar']);
  return {
    settings: Object.assign({}, DEFAULT_SETTINGS, r.settings || {}),
    prefs: Object.assign({}, DEFAULT_PREFS, r.prefs || {}),
    session: r.session || null,
    parked: r.parked || [],
    lastSummary: r.lastSummary || null,
    calendar: r.calendar || { connected: false, demo: false, nextEvent: null }
  };
}

export async function patch(key, values) {
  const cur = (await chrome.storage.local.get(key))[key] || {};
  const next = Object.assign({}, key === 'settings' ? DEFAULT_SETTINGS : key === 'prefs' ? DEFAULT_PREFS : {}, cur, values);
  await chrome.storage.local.set({ [key]: next });
  return next;
}

export function send(type, data) {
  return chrome.runtime.sendMessage(Object.assign({ type }, data || {})).catch(() => null);
}

export function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  if (!d) return '';
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[\/?#:\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

export function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtWhen(ts) {
  const d = new Date(ts), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  const time = fmtTime(ts);
  if (days === 0) return 'Today ' + time;
  if (days === 1) return 'Yesterday ' + time;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

export function ageDays(ts) {
  return (Date.now() - ts) / 86400000;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Wraps every standalone "Still" in a sentence with the brand word style.
export function stillify(s) {
  return esc(s).replace(/\bStill\b/g, '<span class="still-word">Still</span>');
}

export function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
