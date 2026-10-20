// Still service worker: owns the session timer, calendar-task site blocking,
// capture window, toolbar badge, audio routing and calendar nudges.
// The focus session (circle + timer) only primes the mind and never blocks.
// Sites are blocked from a synced calendar task's start to its end.
import { applySession, localOffset } from './js/progress.js';
import { getAll, patch, kindOf, uid, normalizeDomain, fmtTime, rupees, pledgeArmed, GOOGLE_CLIENT_ID, WALLET_API } from './js/lib.js';

const CAPTURE_W = 380;
const CAPTURE_H = 480;
const OVERRIDE_RULE_BASE = 9000;
const ICON = 'assets/icon-128.png';

// ---------- install / startup ----------

chrome.runtime.onInstalled.addListener(async (details) => {
  const all = await getAll();
  if (!all.settings.sitesV2) {
    // Instagram joined the default list when blocking moved to calendar tasks.
    if (!all.settings.sites.includes('instagram.com')) all.settings.sites.push('instagram.com');
    all.settings.sitesV2 = true;
  }
  await chrome.storage.local.set({ settings: all.settings, prefs: all.prefs, parked: all.parked });
  chrome.alarms.create('archive', { delayInMinutes: 1, periodInMinutes: 24 * 60 });
  await syncAfterWake();
  if (details.reason === 'install') chrome.tabs.create({ url: 'home.html' });
});

chrome.runtime.onStartup.addListener(syncAfterWake);

async function syncAfterWake() {
  const { session, calendar, block, settings } = await getAll();
  if (block && block.end > Date.now()) {
    await applyBlocking(blockSites(block, settings));
    chrome.alarms.create('block-end', { when: block.end });
  } else if (block) await endBlock();
  else await clearBlocking();
  if (session && session.phase === 'working' && session.endsAt <= Date.now()) await endSession('timeup');
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

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (changes.parked) updateBadge();
  if (changes.settings) {
    // Keep the live block in step with the Settings list and toggle. A task with a
    // live pledge keeps blocking until it ends: turning blocking off is not a way out.
    const { block, settings } = await getAll();
    if (block && !settings.calendarBlock && !pledgeArmed(block)) await endBlock();
    else if (block) await applyBlocking(blockSites(block, settings));
    else if (settings.calendarBlock) await checkBlockNow();
  }
});

// ---------- blocking ----------

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// While a pledge is live, sites removed from the list mid-task stay blocked.
function blockSites(block, settings) {
  if (!pledgeArmed(block)) return settings.sites;
  return Array.from(new Set((block.sites || []).concat(settings.sites)));
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
    blocked: [],
    impulses: 0,
    overrides: 0,
    parkedCount: 0,
    fromCalendar: !!cfg.fromCalendar
  };
  await chrome.storage.local.set({ session });
  await patch('prefs', { task: '', fromCalendar: false });
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

// One-click Exit from the focus circle: end quietly and go back to work.
async function exitCircle(tabId) {
  await chrome.storage.session.remove('circleTabId');
  await endSession('exit', { silent: true });
  if (tabId != null && !(await leaveTab(tabId))) {
    await chrome.tabs.update(tabId, { url: 'chrome://newtab/' }).catch(() => {});
  }
  return { ok: true };
}

async function setLength(min) {
  const { session } = await getAll();
  if (!session) return null;
  if (session.phase === 'working') return adjustTime(Math.round(min) - session.plannedMin);
  session.plannedMin = Math.max(1, Math.min(240, Math.round(min)));
  await chrome.storage.local.set({ session });
  return session;
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

// The session-end alarm and the wake-up check can both try to end the same session.
// Running ends one at a time means the second one finds no session and does nothing.
let ending = Promise.resolve();
function endSession(reason, opts) {
  const run = ending.then(() => endSessionNow(reason, opts));
  ending = run.catch(() => {});
  return run;
}

// Points come only from here, from the stored session, never from page state.
// applySession ignores a session id it has already seen, so a repeat is harmless.
async function scorePoints(session, reason) {
  const { progress } = await chrome.storage.local.get('progress');
  const offset = localOffset(session.startedAt || Date.now());
  return applySession(progress, session, reason, offset);
}

async function endSessionNow(reason, opts) {
  const { session, settings } = await getAll();
  chrome.alarms.clear('session-end');
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
    reason,
    sessionId: session.id
  };
  if (session.phase === 'working') {
    const { progress, result } = await scorePoints(session, reason);
    if (result) Object.assign(summary, { points: result.points, eligible: result.eligible, scoredMinutes: result.minutes });
    const { history } = await chrome.storage.local.get('history');
    const log = (history || []).concat(summary).slice(-300);
    // One write: the points and the end of the session land together or not at all.
    await chrome.storage.local.set({ session: null, lastSummary: summary, history: log, progress });
  } else {
    // Left from the circle before starting: nothing to log.
    await chrome.storage.local.set({ session: null });
  }
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
    left = Math.max(0, (w.left || 0) + (w.width || 1200) - CAPTURE_W - 24);
    top = Math.max(0, (w.top || 0) + 84);
  } catch (e) {}
  const opts = { url: 'capture.html' + (mode === 'list' ? '#list' : ''), type: 'popup', width: CAPTURE_W, height: CAPTURE_H, focused: true };
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
  const { block } = await getAll();
  if (!block) return { active: false };
  block.impulses += 1;
  await chrome.storage.local.set({ block });
  await addParked(url, 'block');
  return { active: true, impulses: block.impulses, parked: true };
}

async function allowOnce(url, tabId) {
  const { block } = await getAll();
  if (!block) return;
  block.overrides += 1;
  await chrome.storage.local.set({ block });
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

// ---------- calendar-task blocking ----------

// Starts (or extends) the block for a calendar task that is running now.
async function startBlock(e) {
  const { block, settings } = await getAll();
  if (!settings.calendarBlock || !(e.end > Date.now())) return block;
  if (block && block.end > Date.now()) {
    if (e.end > block.end) {
      block.end = e.end;
      await chrome.storage.local.set({ block });
      chrome.alarms.create('block-end', { when: block.end });
    }
    return block;
  }
  const next = {
    eventId: e.id,
    // One key per run of a task, so a recurring event can carry a fresh pledge each time.
    key: e.id + ':' + e.start,
    title: e.title,
    start: Math.min(e.start, Date.now()),
    end: e.end,
    impulses: 0,
    overrides: 0,
    test: !!e.test,
    sites: settings.sites.slice(),
    ...(await pledgeFor(e, settings))
  };
  await chrome.storage.local.set({ block: next });
  await applyBlocking(settings.sites);
  chrome.alarms.create('block-end', { when: next.end });
  const id = 'block|' + Date.now();
  const stake = next.pledge ? ' ' + rupees(next.pledge * 100) + ' is on the line.' : next.pledgeShort ? ' Your wallet is too low for the ' + rupees(next.pledgeShort * 100) + ' pledge, so none is set.' : '';
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: ICON,
    title: e.title + ' has started',
    message: 'Distracting sites are blocked until ' + fmtTime(next.end) + '.' + stake,
    silent: true,
    priority: 0
  });
  setTimeout(() => chrome.notifications.clear(id), 6000);
  return next;
}

async function endBlock() {
  chrome.alarms.clear('block-end');
  await clearBlocking();
  const { block } = await getAll();
  if (!block) return null;
  await chrome.storage.local.set({ block: null });
  if (!block.test) {
    const { history } = await chrome.storage.local.get('history');
    const entry = {
      kind: 'calendar',
      task: block.title,
      minutesFocused: Math.max(0, Math.round((Math.min(Date.now(), block.end) - block.start) / 60000)),
      plannedMin: Math.round((block.end - block.start) / 60000),
      blocked: [],
      impulses: block.impulses,
      overrides: block.overrides,
      pledge: block.pledge || 0,
      forfeited: !!block.forfeited,
      parkedCount: 0,
      endedAt: Date.now(),
      reason: 'calendar'
    };
    await chrome.storage.local.set({ history: (history || []).concat(entry).slice(-300) });
  }
  return block;
}

// Starts a block if one of the synced events is running right now.
async function checkBlockNow() {
  const { calEvents } = await chrome.storage.local.get('calEvents');
  const now = Date.now();
  const live = Object.values(calEvents || {}).filter((e) => e.start <= now + 1000 && e.end > now);
  for (const e of live) await startBlock(e);
}

// Lets the user see blocking work without waiting for a real event.
async function testBlock() {
  return startBlock({ id: 'test-block', title: 'Test task', start: Date.now(), end: Date.now() + 2 * 60000, test: true });
}

// ---------- focus wallet ----------
// A prepaid balance kept on the wallet server (backend/). The extension never moves
// money itself: it asks the server to take a task's pledge after the user confirms
// "Break the task" on the block page, and the server refuses to go below zero.

async function walletBase() {
  const { settings } = await getAll();
  return (settings.walletApi || WALLET_API || '').trim().replace(/\/+$/, '');
}

async function walletConfig() {
  const base = await walletBase();
  if (!base) throw new Error('The wallet server is not set up yet');
  const { walletCfg } = await chrome.storage.session.get('walletCfg');
  if (walletCfg && walletCfg.base === base) return walletCfg;
  const res = await fetch(base + '/api/config');
  if (!res.ok) throw new Error('Wallet server error ' + res.status);
  const cfg = Object.assign({ base }, await res.json());
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('The wallet server is missing its Supabase keys');
  await chrome.storage.session.set({ walletCfg: cfg });
  return cfg;
}

function saveAuth(params) {
  const auth = {
    access: params.access_token,
    refresh: params.refresh_token,
    exp: Date.now() + Number(params.expires_in || 3600) * 1000
  };
  return chrome.storage.local.set({ walletAuth: auth }).then(() => auth);
}

// Google sign-in through Supabase Auth. Supabase sends the session back in the
// redirect's hash, so the extension needs only its public URL and anon key.
async function walletSignIn() {
  try {
    const cfg = await walletConfig();
    const q = new URLSearchParams({ provider: 'google', redirect_to: chrome.identity.getRedirectURL('wallet') });
    const redirect = await chrome.identity.launchWebAuthFlow({ url: cfg.supabaseUrl + '/auth/v1/authorize?' + q, interactive: true });
    const params = Object.fromEntries(new URLSearchParams(new URL(redirect).hash.slice(1)));
    if (params.error) throw new Error(params.error_description || params.error);
    if (!params.access_token) throw new Error('Supabase did not return a session');
    await saveAuth(params);
    await walletRefresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function walletSignOut() {
  await chrome.storage.local.set({ walletAuth: null, wallet: { signedIn: false, email: '', balancePaise: 0, txns: [] } });
  return { ok: true };
}

async function walletToken() {
  const { walletAuth } = await chrome.storage.local.get('walletAuth');
  if (!walletAuth) throw new Error('Sign in to your wallet first');
  if (walletAuth.exp > Date.now() + 60000) return walletAuth.access;
  const cfg = await walletConfig();
  const res = await fetch(cfg.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: cfg.supabaseAnonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: walletAuth.refresh })
  });
  if (!res.ok) {
    await walletSignOut();
    throw new Error('Your wallet sign-in expired. Sign in again.');
  }
  return (await saveAuth(await res.json())).access;
}

async function walletFetch(path, body) {
  const cfg = await walletConfig();
  const res = await fetch(cfg.base + path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + (await walletToken()), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) await walletSignOut();
  if (!res.ok) {
    const err = new Error(data.error || 'Wallet server error ' + res.status);
    err.code = data.code;
    err.balancePaise = data.balancePaise;
    throw err;
  }
  return data;
}

async function walletRefresh() {
  try {
    const data = await walletFetch('/api/wallet');
    const wallet = { signedIn: true, email: data.email || '', balancePaise: data.balancePaise, owedPaise: data.owedPaise || 0, txns: data.txns || [], lastSync: Date.now() };
    await chrome.storage.local.set({ wallet });
    return { ok: true, wallet };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function walletOpen(hash) {
  const base = await walletBase();
  if (!base) return { ok: false, error: 'The wallet server is not set up yet' };
  await chrome.tabs.create({ url: base + '/wallet' + (hash ? '#' + hash : '') });
  return { ok: true };
}

// Decides a new task's pledge: its own amount if set on the Dashboard, else the default.
// Only armed when the wallet can cover it, so a pledge is never an empty threat.
async function pledgeFor(e, settings) {
  const { wallet, pledges } = await getAll();
  if (!wallet.signedIn) return { pledge: 0 };
  const want = e.id in pledges ? Number(pledges[e.id]) : Number(settings.pledge);
  if (!(want > 0)) return { pledge: 0 };
  const fresh = await walletRefresh();
  const balance = fresh.ok ? fresh.wallet.balancePaise : wallet.balancePaise;
  if (balance < want * 100) return { pledge: 0, pledgeShort: want };
  return { pledge: want, charity: settings.charity };
}

async function takePledge(block, site) {
  const r = await walletFetch('/api/forfeit', {
    amount: block.pledge,
    taskKey: block.key,
    taskTitle: block.title,
    site,
    charity: block.charity
  });
  const cur = (await getAll()).block;
  if (cur && cur.key === block.key) {
    cur.forfeited = true;
    cur.forfeitedAt = Date.now();
    await chrome.storage.local.set({ block: cur });
  }
  await walletRefresh();
  return r;
}

// "Break the task" on the block page, after its confirm step: take the pledge, then open the site once.
async function breakTask(url, tabId) {
  const { block } = await getAll();
  if (!pledgeArmed(block)) return { ok: false, error: 'No pledge on this task' };
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* keep empty */ }
  try {
    await takePledge(block, host);
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  }
  await allowOnce(url, tabId);
  return { ok: true };
}

// Stopping a pledged task early counts as breaking it, so it needs the same confirmation.
async function stopBlock(forfeit) {
  const { block } = await getAll();
  if (pledgeArmed(block)) {
    if (!forfeit) return { ok: false, needsConfirm: true, pledge: block.pledge };
    try {
      await takePledge(block, 'stopped early');
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    }
  }
  await endBlock();
  return { ok: true };
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
  const now = Date.now();
  const live = events.filter((e) => e.end > now);
  const upcoming = live.filter((e) => e.start > now);
  const store = {};
  const { nudged } = await chrome.storage.local.get('nudged');
  const done = nudged || {};
  const alarms = await chrome.alarms.getAll();
  alarms.filter((a) => a.name.startsWith('blockstart|')).forEach((a) => chrome.alarms.clear(a.name));
  for (const e of live) {
    store[e.id] = e;
    if (e.start > now) chrome.alarms.create('blockstart|' + e.id, { when: e.start });
  }
  for (const e of upcoming) {
    const when = e.start - settings.nudgeLeadMin * 60000;
    if (when > now && done[e.id] !== e.start) chrome.alarms.create('nudge|' + e.id, { when });
  }
  calendar.nextEvent = upcoming[0] || null;
  calendar.lastSync = now;
  await chrome.storage.local.set({ calendar, calEvents: store });
  await checkBlockNow();
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
    // The circle primes you for the time left before the task starts.
    const left = Math.round((e.start - Date.now()) / 60000);
    const mins = left >= 1 ? Math.min(60, left) : 5;
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
  alarms.filter((a) => a.name.startsWith('nudge|') || a.name.startsWith('blockstart|') || a.name === 'cal-poll').forEach((a) => chrome.alarms.clear(a.name));
  await endBlock();
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
      if (p.status === 'done' && (p.doneAt || p.createdAt) < cutoff) { p.status = 'archived'; changed = true; }
    });
    if (changed) await chrome.storage.local.set({ parked });
  } else if (alarm.name === 'cal-poll') {
    await pollCalendar();
  } else if (alarm.name.startsWith('nudge|')) {
    await fireNudge(alarm.name.slice(6));
  } else if (alarm.name.startsWith('blockstart|')) {
    const { calEvents } = await chrome.storage.local.get('calEvents');
    const e = (calEvents || {})[alarm.name.slice(11)];
    if (e) await startBlock(e);
  } else if (alarm.name === 'block-end') {
    const { block } = await getAll();
    if (block && block.end > Date.now() + 1000) chrome.alarms.create('block-end', { when: block.end });
    else await endBlock();
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
  exitCircle: (m, sender) => exitCircle(sender.tab ? sender.tab.id : null),
  setLength: (m) => setLength(Number(m.minutes) || 10),
  testBlock: () => testBlock(),
  endBlock: () => endBlock(),
  stopBlock: (m) => stopBlock(!!m.forfeit),
  breakTask: (m, sender) => breakTask(m.url, sender.tab.id),
  walletSignIn: () => walletSignIn(),
  walletSignOut: () => walletSignOut(),
  walletRefresh: () => walletRefresh(),
  walletOpen: (m) => walletOpen(m.hash),
  walletBase: () => walletBase(),
  openCapture: (m) => openCapture(m.mode),
  saveThought: async (m) => {
    const item = m.id ? await updateParked(m.id, m.text) : await addParked(m.text, m.source || 'capture');
    if (item && !m.quiet) toast(m.id ? 'Updated. Back to work.' : 'Saved to your Bucket. Back to work.');
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

