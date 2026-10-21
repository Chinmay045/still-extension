// Shared helpers for every Still page and the service worker.

export const DEFAULT_SITES = ['youtube.com', 'x.com', 'instagram.com', 'reddit.com'];

// The app owner's Google OAuth client ID ("Web application" type, redirect URI
// https://hjcpkhjkanikiahcjmhcblnnkloopnmc.chromiumapp.org/). With it set, users
// connect with one Google sign-in and never see any setup.
export const GOOGLE_CLIENT_ID = '287087142246-v8qephktt73vi27gacha358kc6ibvlkt.apps.googleusercontent.com';

// Focus wallet and charity pledges are parked for a later version. While this is false the
// wallet is hidden from Settings, no task carries a pledge and the block page never asks for
// money. The code (and backend/) stays so it can come back by flipping this to true.
export const WALLET_ENABLED = false;

// The focus wallet server (the Next.js app in backend/), for example
// https://still-wallet.vercel.app. Empty until it is deployed; Settings can also hold one.
export const WALLET_API = '';

export const PLEDGES = [0, 20, 50, 100, 200];
export const CHARITIES = ['Akshaya Patra', 'GiveIndia', 'CRY'];

export const DEFAULT_SETTINGS = {
  sites: DEFAULT_SITES.slice(),
  overrideWait: 30,
  chime: true,
  autoCircle: true,
  nightDim: true,
  calendarConnected: false,
  nudgeLeadMin: 10,
  nudgeSound: true,
  calendarBlock: true,
  sessionBlock: true,
  googleClientId: '',
  walletApi: '',
  pledge: 50,
  charity: CHARITIES[0]
};

export const DEFAULT_PREFS = {
  task: '',
  plannedMin: 10,
  customMin: 25,
  theme: 'vortex',
  sound: 'ambient',
  volume: 70,
  blockMin: 25,     // Block now: 25, 60, 0 (no limit) or -1 (other)
  blockOther: 30,
  blockStrict: false
};

export const SOUNDS = [
  { id: 'ambient', name: 'Ambient instrumental', desc: 'Music with no lyrics, safe for reading and code', tag: 'Default' },
  { id: 'gamma', name: 'Gamma 40 Hz binaural', desc: 'Starts in the focus circle. Needs headphones', tag: 'Headphones' },
  { id: 'beta', name: 'Beta pulse music', desc: 'Soft music with a 16 Hz pulse', tag: 'Pulse' },
  { id: 'cafe', name: 'Cafe murmur', desc: 'Moderate background chatter for creative work', tag: 'Ideas' },
  { id: 'white', name: 'White noise', desc: 'Even hiss across every pitch, masks sharp sounds', tag: 'Noise' },
  { id: 'pink', name: 'Pink noise', desc: 'Softer than white, like steady rain', tag: 'Noise' },
  { id: 'brown', name: 'Brown noise', desc: 'Deep and low, like a distant waterfall', tag: 'Noise' },
  { id: 'off', name: 'Silence', desc: 'No sound', tag: '' }
];

export const THEMES = [
  { id: 'vortex', name: 'Vortex', desc: 'A turning tunnel of light' },
  { id: 'drift', name: 'Drift', desc: 'A soft galaxy swirl, rose to violet' },
  { id: 'halo', name: 'Halo', desc: 'Fine violet tunnel, warm edges' },
  { id: 'ripple', name: 'Ripple', desc: 'Soft rings that turn around a bright centre' },
  { id: 'radiant', name: 'Radiant', desc: 'Fine rays from a single point' },
  { id: 'lotus', name: 'Lotus', desc: 'Layered petals, calm and even' },
  { id: 'orbit', name: 'Orbit', desc: 'Looping orbits, slow and hypnotic' },
  { id: 'orb', name: 'Orb', desc: 'A glowing sphere with a warm core' }
];

export const KINDS = {
  task: { label: 'Task', bg: '#F1E8FE', fg: '#6B2FD6' },
  link: { label: 'Link', bg: '#E8F0FE', fg: '#1F5FC8' },
  idea: { label: 'Idea', bg: '#FDEBF7', fg: '#B0308F' }
};

const TASK_VERBS = ['check', 'look', 'read', 'write', 'email', 'call', 'fix', 'book', 'buy', 'review', 'send', 'update', 'ask', 'schedule', 'plan', 'draft', 'research', 'follow'];

export function kindOf(text) {
  // Notes can start with a list marker from the capture toolbar; classify the words after it.
  const t = String(text || '').trim().toLowerCase().replace(/^(?:[☐☑•]|\d+\.)\s*/, '');
  if (/^(https?:\/\/|www\.)\S+$/.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(t)) return 'link';
  const first = t.split(/\s+/)[0].replace(/[^a-z]/g, '');
  return TASK_VERBS.includes(first) ? 'task' : 'idea';
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getAll() {
  const r = await chrome.storage.local.get(['settings', 'prefs', 'session', 'parked', 'lastSummary', 'calendar', 'history', 'seenWelcome', 'block', 'wallet', 'pledges', 'calEvents', 'progress', 'firstUsed']);
  return {
    settings: Object.assign({}, DEFAULT_SETTINGS, r.settings || {}),
    prefs: Object.assign({}, DEFAULT_PREFS, r.prefs || {}),
    session: r.session || null,
    parked: r.parked || [],
    lastSummary: r.lastSummary || null,
    calendar: r.calendar || { connected: false, demo: false, nextEvent: null },
    history: r.history || (r.lastSummary ? [r.lastSummary] : []),
    seenWelcome: !!r.seenWelcome,
    firstUsed: r.firstUsed || 0,
    block: r.block || null,
    wallet: r.wallet || { signedIn: false, email: '', balancePaise: 0, txns: [] },
    pledges: r.pledges || {},
    calEvents: r.calEvents || {},
    progress: r.progress || null
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

export function rupees(paise) {
  return '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// A calendar task's pledge is live once the block starts with enough money in the wallet.
export function pledgeArmed(block) {
  return !!(WALLET_ENABLED && block && block.pledge > 0 && !block.forfeited);
}

export function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Bump when background.js changes. Pages compare it with the running service worker,
// because after a git pull Chrome serves the new pages but keeps the old worker until
// the extension is reloaded.
export const BUILD = '2026-10-21b';

// A block with no end ("until I stop it") uses this as its end time.
export const NO_END = 8.64e15;

// "until 3:40 pm", or "until you stop it" for a block with no end.
export function untilText(end) {
  return end >= NO_END ? 'until you stop it' : 'until ' + fmtTime(end);
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
