// Still service worker: owns the session timer, site blocking, capture window,
// toolbar badge, audio routing and calendar nudges.
import { getAll, patch, kindOf, uid, normalizeDomain, fmtTime, GOOGLE_CLIENT_ID } from './js/lib.js';

const CAPTURE_SIZE = 288;
const OVERRIDE_RULE_BASE = 9000;
const ICON = 'assets/icon-128.png';

// ---------- install / startup ----------

chrome.runtime.onInstalled.addListener(async (details) => {
  const all = await getAll();
  await chrome.storage.local.set({ settings: all.settings, prefs: all.prefs, parked: all.parked });
  chrome.alarms.create('archive', { delayInMinutes: 1, periodInMinutes: 24 * 60 });
  await syncAfterWake();
  if (details.reason === 'install') chrome.tabs.create({ url: 'home.html' });
});

chrome.runtime.onStartup.addListener(syncAfterWake);

async function syncAfterWake() {
  const { session, calendar } = await getAll();
  if (!session) await clearBlocking();
  else if (session.phase === 'working' && session.endsAt <= Date.now()) await endSession('timeup');
  if (calendar.connected) chrome.alarms.create('cal-poll', { delayInMinutes: 0.1, periodInMinutes: 5 });
  await updateBadge();
}

// ---------- badge ----------

async function updateBadge() {
  const { parked } = await chrome.storage.local.get('parked');
  const count = (parked || []).filter((p) => p.status === 'new').length;
  await chrome.action.setBadgeBackgroundColor({ color: '#7A2BF5' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.parked) updateBadge();
});

// ---------- blocking ----------

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function applyBlocking(sites) {
  await clearBlocking();
  const base = chrome.runtime.getURL('blocked.html');
  const rules = sites.map(normalizeDomain).filter(Boolean).map((d, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: base + '#\\0' } },
    condition: {
      regexFilter: '^https?://([^/?#]*\\.)?' + escapeRe(d) + '([/:?#].*)?$',
      resourceTypes: ['main_frame']
    }
  }));
  if (rules.length) await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
}

async function clearBlocking() {
  const dyn = await chrome.declarativeNetRequest.getDynamicRules();
  if (dyn.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: dyn.map((r) => r.id) });
  const ses = await chrome.declarativeNetRequest.getSessionRules();
  if (ses.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ses.map((r) => r.id) });
}

// ---------- audio (offscreen document) ----------

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Plays the focus sound during a Still session.'
    });
  } catch (e) {
    // Another call created it first.
  }
}

async function audio(type, data) {
  if (type === 'audio-stop') {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!contexts.length) return;
  } else {
    await ensureOffscreen();
  }
  return chrome.runtime.sendMessage(Object.assign({ target: 'offscreen', type }, data || {})).catch(() => null);
}

async function closeOffscreenLater(ms) {
  setTimeout(async () => {
    const { session } = await chrome.storage.local.get('session');
    if (session) return;
    try { await chrome.offscreen.closeDocument(); } catch (e) {}
  }, ms);
}

// ---------- session ----------

async function startSession(cfg) {
  const { settings, session: old } = await getAll();
  if (old) await endSession('replaced', { silent: true });
  const plannedMin = Math.max(1, Math.min(240, Math.round(Number(cfg.plannedMin) || 25)));
  const session = {
    id: uid(),
    task: String(cfg.task || '').trim() || 'One focused block',
    plannedMin,
    startedAt: null,
    endsAt: null,
    createdAt: Date.now(),
    phase: 'circle',
    theme: cfg.theme || 'vortex',
    sound: cfg.sound || 'ambient',
    volume: cfg.volume == null ? 70 : cfg.volume,
    blocked: (cfg.blocked || settings.sites).map(normalizeDomain).filter(Boolean),
    impulses: 0,
    overrides: 0,
    parkedCount: 0,
    fromCalendar: !!cfg.fromCalendar
  };
  await chrome.storage.local.set({ session });
  await patch('prefs', { task: '', fromCalendar: false });
  await applyBlocking(session.blocked);
  await audio('audio-play', { sound: session.sound, volume: session.volume });

  if (settings.autoCircle) {
    const tab = await chrome.tabs.create({ url: 'focus.html' });
    await chrome.storage.session.set({ circleTabId: tab.id });
  } else {
    await beginWork();
  }
  return session;
}

async function beginWork(fromTabId) {
  const { session } = await getAll();
  if (!session) return null;
  if (session.phase !== 'working') {
    session.phase = 'working';
    session.startedAt = Date.now();
    session.endsAt = session.startedAt + session.plannedMin * 60000;
    await chrome.storage.local.set({ session });
    chrome.alarms.create('session-end', { when: session.endsAt });
  }
  await chrome.storage.session.remove('circleTabId');
  if (fromTabId != null && !(await leaveTab(fromTabId))) {
    // Nothing to go back to: turn the circle tab into a fresh tab.
    await chrome.tabs.update(fromTabId, { url: 'chrome://newtab/' }).catch(() => {});
  }
  return session;
}

// Sends the user back to the tab they were working in, closing the given tab.
async function leaveTab(tabId) {
  let { workTab } = await chrome.storage.session.get('workTab');
  if (!workTab || workTab.tabId === tabId) {
    // Fall back to the most recently used web tab.
    const tabs = (await chrome.tabs.query({})).filter((t) => t.id !== tabId && isWorkUrl(t.url));
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    workTab = tabs.length ? { tabId: tabs[0].id, windowId: tabs[0].windowId } : null;
  }
  if (workTab && workTab.tabId !== tabId) {
    try {
      await chrome.tabs.update(workTab.tabId, { active: true });
    } catch (e) {
      return false; // The work tab is gone.
    }
    await chrome.windows.update(workTab.windowId, { focused: true }).catch(() => {});
    await chrome.tabs.remove(tabId).catch(() => {});
    return true;
  }
  return false;
}

async function adjustTime(deltaMin) {
  const { session } = await getAll();
  if (!session) return null;
  if (session.phase !== 'working') {
    session.plannedMin = Math.max(1, Math.min(240, session.plannedMin + deltaMin));
  } else {
    session.endsAt = Math.max(Date.now() + 60000, session.endsAt + deltaMin * 60000);
    session.plannedMin = Math.max(1, Math.round((session.endsAt - session.startedAt) / 60000));
    chrome.alarms.create('session-end', { when: session.endsAt });
  }
  await chrome.storage.local.set({ session });
  return session;
}

async function setSound(sound) {
  const { session } = await getAll();
  await patch('prefs', { sound });
  if (!session) return null;
  session.sound = sound;
  await chrome.storage.local.set({ session });
  if (sound === 'off') await audio('audio-stop');
  else await audio('audio-play', { sound, volume: session.volume });
  return session;
}

async function setVolume(volume) {
  const { session } = await getAll();
  await patch('prefs', { volume });
  if (!session) return null;
  session.volume = volume;
  await chrome.storage.local.set({ session });
  await audio('audio-volume', { volume });
  return session;
}

async function endSession(reason, opts) {
  const { session, settings } = await getAll();
  chrome.alarms.clear('session-end');
  await clearBlocking();
  if (!session) return null;
  const now = Date.now();
  const focusedMs = session.phase === 'working' ? Math.min(now, session.endsAt) - session.startedAt : 0;
  const summary = {
    task: session.task,
    minutesFocused: Math.max(0, Math.round(focusedMs / 60000)),
    plannedMin: session.plannedMin,
    blocked: session.blocked,
    impulses: session.impulses,
    overrides: session.overrides,
    parkedCount: session.parkedCount,
    endedAt: now,
    reason
  };
  await chrome.storage.local.set({ session: null, lastSummary: summary });
  await audio('audio-stop');
  if (reason === 'timeup' && settings.chime) await audio('audio-chime', { volume: Math.max(40, session.volume) });
  closeOffscreenLater(reason === 'timeup' ? 3000 : 800);

  const { circleTabId } = await chrome.storage.session.get('circleTabId');
  if (circleTabId != null) {
    chrome.tabs.remove(circleTabId).catch(() => {});
    chrome.storage.session.remove('circleTabId');
  }
  if (!(opts && opts.silent)) await openHome('summary');
  return summary;
}

// ---------- tabs ----------

async function openHome(hash) {
  const url = chrome.runtime.getURL('home.html') + (hash ? '#' + hash : '');
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('home.html') + '*' });
  if (tabs.length) {
    const t = tabs[0];
    await chrome.tabs.update(t.id, { url, active: true });
    await chrome.windows.update(t.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

function isWorkUrl(url) {
  return !!url && /^(https?|file):/.test(url);
}

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isWorkUrl(tab.url)) chrome.storage.session.set({ workTab: { tabId, windowId } });
  } catch (e) {}
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { circleTabId } = await chrome.storage.session.get('circleTabId');
  // Closing the focus circle tab counts as beginning work.
  if (circleTabId === tabId) await beginWork();
  const { captureWindowId } = await chrome.storage.session.get('captureWindowId');
  if (captureWindowId != null) {
    chrome.windows.get(captureWindowId).catch(() => chrome.storage.session.remove('captureWindowId'));
  }
});

// ---------- capture window ----------

async function openCapture(mode) {
  const { captureWindowId } = await chrome.storage.session.get('captureWindowId');
  if (captureWindowId != null) {
    try {
      await chrome.windows.update(captureWindowId, { focused: true });
      if (mode === 'list') chrome.runtime.sendMessage({ type: 'capture-mode', mode }).catch(() => {});
      return;
    } catch (e) {
      // The old window was closed.
    }
  }
  let left, top;
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    left = Math.max(0, (w.left || 0) + (w.width || 1200) - CAPTURE_SIZE - 24);
    top = Math.max(0, (w.top || 0) + 84);
  } catch (e) {}
  const opts = { url: 'capture.html' + (mode === 'list' ? '#list' : ''), type: 'popup', width: CAPTURE_SIZE, height: CAPTURE_SIZE, focused: true };
  let win;
  try {
    win = await chrome.windows.create(Object.assign({ left, top }, opts));
  } catch (e) {
    // The spot is off screen (odd monitor setups): let Chrome place it.
    win = await chrome.windows.create(opts);
  }
  await chrome.storage.session.set({ captureWindowId: win.id });
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { captureWindowId } = await chrome.storage.session.get('captureWindowId');
  if (captureWindowId === windowId) await chrome.storage.session.remove('captureWindowId');
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'park-thought') openCapture();
});

async function addParked(text, source) {
  const t = String(text || '').trim();
  if (!t) return null;
  const { parked, session } = await getAll();
  if (source === 'block' && parked.some((p) => p.status === 'new' && p.text === t)) return null;
  const item = { id: uid(), text: t, kind: kindOf(t), status: 'new', createdAt: Date.now(), source: source || 'manual' };
  parked.push(item);
  await chrome.storage.local.set({ parked });
  if (session && source !== 'block') {
    session.parkedCount += 1;
    await chrome.storage.local.set({ session });
  }
  return item;
}

async function updateParked(id, text) {
  const { parked } = await getAll();
  const item = parked.find((p) => p.id === id);
  if (!item) return null;
  item.text = String(text).trim();
  item.kind = kindOf(item.text);
  await chrome.storage.local.set({ parked });
  return item;
}

async function toast(text) {
  try {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const [tab] = await chrome.tabs.query({ active: true, windowId: w.id });
    if (tab && isWorkUrl(tab.url)) {
      const ok = await chrome.tabs.sendMessage(tab.id, { type: 'still-toast', text });
      if (ok) return;
    }
  } catch (e) {}
  const id = 'toast-' + Date.now();
  chrome.notifications.create(id, { type: 'basic', iconUrl: ICON, title: 'Still', message: text, silent: true, priority: -1 });
  setTimeout(() => chrome.notifications.clear(id), 2500);
}

// ---------- block page ----------

async function blockedHit(url) {
  const { session } = await getAll();
  if (!session) return { active: false };
  session.impulses += 1;
  await chrome.storage.local.set({ session });
  await addParked(url, 'block');
  return { active: true, impulses: session.impulses, parked: true };
}

async function allowOnce(url, tabId) {
  const { session } = await getAll();
  if (!session) return;
  session.overrides += 1;
  await chrome.storage.local.set({ session });
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return; }
  const id = OVERRIDE_RULE_BASE + (Date.now() % 1000);
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{ id, priority: 10, action: { type: 'allow' }, condition: { requestDomains: [host], resourceTypes: ['main_frame'], tabIds: [tabId] } }]
  });
  // The allow rule lives only until this one page load finishes.
  const drop = () => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
  const onUpdated = (tid, info) => {
    if (tid !== tabId || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    drop();
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpdated); drop(); }, 30000);
  await chrome.tabs.update(tabId, { url });
}

// ---------- calendar nudges ----------

const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

function demoEvent() {
  const d = new Date();
  d.setHours(15, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return { id: 'demo-onboarding-prd', title: 'Onboarding PRD review', start: d.getTime(), end: d.getTime() + 60 * 60000 };
}

// Google sign-in through chrome.identity.launchWebAuthFlow, using the OAuth client ID
// the user pastes in Settings (a "Web application" client whose redirect URI is
// chrome.identity.getRedirectURL()). No manifest editing needed.
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

async function getToken(interactive) {
  const cached = await chrome.storage.session.get(['calToken', 'calTokenExp']);
  if (cached.calToken && cached.calTokenExp > Date.now() + 60000) return cached.calToken;
  const { settings } = await getAll();
  const clientId = (settings.googleClientId || GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('Google sign-in is not set up in this build yet');
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: CAL_SCOPE,
    include_granted_scopes: 'true'
  });
  if (!interactive) q.set('prompt', 'none');
  const redirect = await chrome.identity.launchWebAuthFlow({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, interactive: !!interactive });
  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  if (params.get('error')) throw new Error(params.get('error'));
  const token = params.get('access_token');
  if (!token) throw new Error('Google did not return a token');
  const ttl = Number(params.get('expires_in') || 3600) * 1000;
  await chrome.storage.session.set({ calToken: token, calTokenExp: Date.now() + ttl });
  return token;
}

async function dropToken() {
  await chrome.storage.session.remove(['calToken', 'calTokenExp']);
}

async function fetchEvents() {
  const token = await getToken(false);
  const now = new Date();
  const max = new Date(Date.now() + 12 * 3600000);
  const q = new URLSearchParams({ timeMin: now.toISOString(), timeMax: max.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '10' });
  const res = await fetch(CAL_API + '?' + q, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 401) {
    await dropToken();
    throw new Error('Calendar token expired');
  }
  if (!res.ok) throw new Error('Calendar API error ' + res.status);
  const data = await res.json();
  return (data.items || [])
    .filter((e) => e.start && e.start.dateTime && e.status !== 'cancelled')
    .map((e) => ({ id: e.id, title: e.summary || 'Untitled event', start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) }));
}

async function pollCalendar() {
  const { calendar, settings } = await getAll();
  if (!calendar.connected) return;
  let events = [];
  if (calendar.demo) events = [demoEvent()];
  else {
    try { events = await fetchEvents(); } catch (e) { return; }
  }
  const upcoming = events.filter((e) => e.start > Date.now());
  const store = {};
  const { nudged } = await chrome.storage.local.get('nudged');
  const done = nudged || {};
  for (const e of upcoming) {
    store[e.id] = e;
    const when = e.start - settings.nudgeLeadMin * 60000;
    if (when > Date.now() && done[e.id] !== e.start) chrome.alarms.create('nudge|' + e.id, { when });
  }
  calendar.nextEvent = upcoming[0] || null;
  calendar.lastSync = Date.now();
  await chrome.storage.local.set({ calendar, calEvents: store });
}

async function fireNudge(eventId) {
  const { calEvents } = await chrome.storage.local.get('calEvents');
  const e = (calEvents || {})[eventId];
  if (!e) return;
  const { nudged } = await chrome.storage.local.get('nudged');
  await chrome.storage.local.set({ nudged: Object.assign({}, nudged, { [eventId]: e.start }) });
  chrome.notifications.create('nudge|' + eventId, {
    type: 'basic',
    iconUrl: ICON,
    title: e.title + ' starts at ' + fmtTime(e.start),
    message: 'Get ready for it. Still can set up a focus session with this task.',
    buttons: [{ title: 'Prepare my focus session' }, { title: 'Open dashboard' }],
    requireInteraction: true
  });
}

async function prepareFromEvent(eventId) {
  const { calEvents } = await chrome.storage.local.get('calEvents');
  const e = (calEvents || {})[eventId];
  if (e) {
    const mins = Math.max(1, Math.min(240, Math.round((e.end - e.start) / 60000)));
    await patch('prefs', { task: e.title, plannedMin: mins, customMin: mins, fromCalendar: true });
  }
  await openHome('setup');
}

chrome.notifications.onButtonClicked.addListener(async (id, idx) => {
  if (!id.startsWith('nudge|')) return;
  chrome.notifications.clear(id);
  if (idx === 0) await prepareFromEvent(id.slice(6));
  else await openHome('');
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith('nudge|')) return;
  chrome.notifications.clear(id);
  await openHome('');
});

async function connectCalendar(clientId) {
  if (clientId) {
    await patch('settings', { googleClientId: String(clientId).trim() });
    await dropToken();
  }
  try {
    await getToken(true);
    await fetchEvents();
  } catch (e) {
    return { ok: false, error: e.message };
  }
  await chrome.storage.local.set({ calendar: { connected: true, demo: false, nextEvent: null } });
  await patch('settings', { calendarConnected: true });
  chrome.alarms.create('cal-poll', { delayInMinutes: 5, periodInMinutes: 5 });
  await pollCalendar();
  return { ok: true };
}

async function connectDemo() {
  await chrome.storage.local.set({ calendar: { connected: true, demo: true, nextEvent: null } });
  await patch('settings', { calendarConnected: true });
  chrome.alarms.create('cal-poll', { delayInMinutes: 5, periodInMinutes: 5 });
  await pollCalendar();
  return { ok: true };
}

async function disconnectCalendar() {
  const { calendar } = await getAll();
  if (!calendar.demo) {
    const { calToken } = await chrome.storage.session.get('calToken');
    if (calToken) fetch('https://oauth2.googleapis.com/revoke?token=' + calToken, { method: 'POST' }).catch(() => {});
    await dropToken();
  }
  const alarms = await chrome.alarms.getAll();
  alarms.filter((a) => a.name.startsWith('nudge|') || a.name === 'cal-poll').forEach((a) => chrome.alarms.clear(a.name));
  await chrome.storage.local.set({ calendar: { connected: false, demo: false, nextEvent: null }, calEvents: {} });
  await patch('settings', { calendarConnected: false });
  return { ok: true };
}

async function testNudge() {
  const { calendar } = await getAll();
  let e = calendar.nextEvent;
  if (!e) {
    e = demoEvent();
  }
  const { calEvents } = await chrome.storage.local.get('calEvents');
  await chrome.storage.local.set({ calEvents: Object.assign({}, calEvents, { [e.id]: e }) });
  await fireNudge(e.id);
  return { ok: true };
}

// ---------- alarms ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'session-end') {
    const { session } = await getAll();
    if (session && session.phase === 'working') {
      if (session.endsAt > Date.now() + 1000) chrome.alarms.create('session-end', { when: session.endsAt });
      else await endSession('timeup');
    }
  } else if (alarm.name === 'archive') {
    const { parked } = await getAll();
    const cutoff = Date.now() - 8 * 86400000;
    let changed = false;
    parked.forEach((p) => {
      if (p.status === 'later' && p.createdAt < cutoff) { p.status = 'archived'; changed = true; }
    });
    if (changed) await chrome.storage.local.set({ parked });
  } else if (alarm.name === 'cal-poll') {
    await pollCalendar();
  } else if (alarm.name.startsWith('nudge|')) {
    await fireNudge(alarm.name.slice(6));
  }
});

// ---------- messages ----------

const handlers = {
  startSession: (m) => startSession(m.config || {}),
  beginWork: (m, sender) => beginWork(sender.tab ? sender.tab.id : null),
  adjustTime: (m) => adjustTime(Number(m.deltaMin) || 0),
  setSound: (m) => setSound(m.sound),
  setVolume: (m) => setVolume(Number(m.volume)),
  endSession: () => endSession('exit'),
  openCapture: (m) => openCapture(m.mode),
  saveThought: async (m) => {
    const item = m.id ? await updateParked(m.id, m.text) : await addParked(m.text, m.source || 'capture');
    if (item && !m.quiet) toast(m.id ? 'Updated. Back to work.' : 'Parked. Back to work.');
    return item;
  },
  blockedHit: (m) => blockedHit(m.url),
  allowOnce: (m, sender) => allowOnce(m.url, sender.tab.id),
  returnToWork: (m, sender) => leaveTab(sender.tab.id),
  openHome: (m) => openHome(m.hash || ''),
  calConnect: (m) => connectCalendar(m.clientId),
  redirectUrl: () => chrome.identity.getRedirectURL(),
  calDemo: () => connectDemo(),
  calDisconnect: () => disconnectCalendar(),
  calTestNudge: () => testNudge(),
  calRefresh: () => pollCalendar(),
  previewStop: () => null
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target === 'offscreen') return;
  const fn = handlers[msg.type];
  if (!fn) return;
  Promise.resolve(fn(msg, sender))
    .then((r) => reply(r == null ? null : r))
    .catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
  return true;
});

