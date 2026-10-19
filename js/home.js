import { GOOGLE_CLIENT_ID, WALLET_API, PLEDGES, CHARITIES, rupees, pledgeArmed, getAll, patch, send, esc, stillify, fmtWhen, fmtTime, ageDays, normalizeDomain, reducedMotion, KINDS, SOUNDS, THEMES } from './lib.js';
import { mountVolume } from './volume.js';
import { mountSession } from './session-ui.js';
import { SoundEngine } from './audio.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['dashboard', 'home', 'setup', 'bucket', 'settings', 'summary'];
let state = await getAll();
let reviewed = 0;

// ---------- router ----------

function route() {
  const name = current();
  VIEWS.forEach((v) => { $('view-' + v).hidden = v !== name; });
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = name === 'home' ? 'Still' : 'Still · ' + name[0].toUpperCase() + name.slice(1);
  // The tour shows on first open; every open after that lands on the dashboard.
  if (name === 'home' && !state.seenWelcome) chrome.storage.local.set({ seenWelcome: true });
  if (name !== 'setup') stopPreview();
  if (name === 'bucket') reviewed = 0;
  renderView(name);
  window.scrollTo(0, 0);
  if (name !== 'home') $('main').focus({ preventScroll: true });
}

function renderView(name) {
  const w = state.wallet;
  if ((name === 'dashboard' || name === 'settings') && w.signedIn && !(Date.now() - (w.lastSync || 0) < 60000)) send('walletRefresh');
  if (name === 'dashboard') renderDashboard();
  if (name === 'home') renderHome();
  if (name === 'setup') renderSetup();
  if (name === 'bucket') renderBucket();
  if (name === 'settings') renderSettings();
  if (name === 'summary') renderSummary();
}

function current() {
  const h = location.hash.slice(1);
  if (VIEWS.includes(h)) return h;
  return state.seenWelcome ? 'dashboard' : 'home';
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- nav ----------

function renderNav() {
  const fresh = state.parked.filter((p) => p.status === 'new').length;
  $('nav-badge').hidden = !fresh;
  $('nav-badge').textContent = fresh;
  $('nav-badge').setAttribute('aria-label', fresh + ' new');
  const cal = state.calendar;
  const btn = $('cal-btn');
  btn.classList.remove('synced', 'upcoming');
  if (!cal.connected) {
    $('cal-label').textContent = 'Connect Calendar';
  } else if (cal.nextEvent && cal.nextEvent.start > Date.now()) {
    btn.classList.add('upcoming');
    $('cal-label').textContent = 'Upcoming task: ' + fmtTime(cal.nextEvent.start);
    btn.title = cal.nextEvent.title;
  } else {
    btn.classList.add('synced');
    $('cal-label').textContent = 'Calendar synced';
  }
}

$('cal-btn').addEventListener('click', async () => {
  const cal = state.calendar;
  if (cal.connected && cal.nextEvent && cal.nextEvent.start > Date.now()) {
    const e = cal.nextEvent;
    const mins = Math.max(1, Math.min(240, Math.round((e.end - e.start) / 60000)));
    state.prefs = await patch('prefs', { task: e.title, plannedMin: mins, customMin: mins, fromCalendar: true });
    location.hash = 'setup';
  } else {
    location.hash = 'settings';
    setTimeout(() => $('integrations').scrollIntoView({ block: 'center' }), 50);
  }
});

// ---------- home ----------

const TASKS = ['Write the PRD for onboarding', 'Synthesize 8 user interviews', 'Prioritize the roadmap with RICE', 'Draft the launch plan', 'System matters'];
let typingStarted = false;

function renderHome() {
  if (typingStarted) return;
  typingStarted = true;
  const el = $('typing');
  if (reducedMotion()) {
    let i = 0;
    el.textContent = TASKS[0];
    setInterval(() => { i = (i + 1) % TASKS.length; el.textContent = TASKS[i]; }, 4000);
    return;
  }
  let i = 0, n = 0, deleting = false;
  const step = () => {
    const word = TASKS[i];
    if (!deleting) {
      n++;
      el.textContent = word.slice(0, n);
      if (n === word.length) { deleting = true; return setTimeout(step, 1700); }
      return setTimeout(step, 55 + Math.random() * 40);
    }
    n--;
    el.textContent = word.slice(0, n);
    if (n === 0) { deleting = false; i = (i + 1) % TASKS.length; return setTimeout(step, 350); }
    return setTimeout(step, 24);
  };
  step();
}

$('to-compare').addEventListener('click', () => {
  $('compare').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  $('vs-range').focus({ preventScroll: true });
});
$('vs-range').addEventListener('input', (e) => { $('vs').style.setProperty('--split', e.target.value + '%'); });

// ---------- dashboard ----------

const DAY = 86400000;

function minutesLabel(m) {
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}

function row(title, sub, right) {
  return `<div class="dash-row"><div class="dash-text"><b>${title}</b>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>${right || ''}</div>`;
}

function group(title, rows) {
  return `<section class="dash-group"><h2 class="h2">${title}</h2><div class="card dash-list">${rows}</div></section>`;
}

function renderDashboard() {
  const { session, history, parked, calendar, settings } = state;
  const now = new Date();
  const hour = now.getHours();
  $('dash-hello').textContent = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
  $('dash-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '. Everything you control in Still, in one place.';

  const startToday = new Date(now.toDateString()).getTime();
  const weekAgo = Date.now() - 7 * DAY;
  const today = history.filter((s) => s.endedAt >= startToday);
  const week = history.filter((s) => s.endedAt >= weekAgo);
  const sum = (list, k) => list.reduce((n, s) => n + (Number(s[k]) || 0), 0);
  const fresh = parked.filter((p) => p.status === 'new').sort((a, b) => b.createdAt - a.createdAt);

  const nowRows = session
    ? row('Focusing on ' + esc(session.task), session.phase === 'working' ? 'Ends at ' + fmtTime(session.endsAt) : 'Waiting in the focus circle', '<a class="btn btn-sm" href="#setup">Open session</a>')
    : row('No session running', 'Name one task and pick how long.', '<a class="btn btn-sm btn-primary" href="#setup">Set up a session</a>');

  const focusRows =
    row('Focus time today', today.length + (today.length === 1 ? ' session' : ' sessions'), `<span class="dash-val">${minutesLabel(sum(today, 'minutesFocused'))}</span>`) +
    row('This week', week.length + (week.length === 1 ? ' session' : ' sessions') + ' in the last 7 days', `<span class="dash-val">${minutesLabel(sum(week, 'minutesFocused'))}</span>`) +
    row('Distractions stopped this week', 'Times a blocked site tried to pull you away', `<span class="dash-val">${sum(week, 'impulses')}</span>`) +
    row('Thoughts parked this week', 'Saved to the bucket instead of switching tabs', `<span class="dash-val">${sum(week, 'parkedCount')}</span>`);

  const bucketRows =
    row(fresh.length ? fresh.length + (fresh.length === 1 ? ' thought waiting' : ' thoughts waiting') : 'Bucket is empty', fresh.length ? 'Review them in about a minute.' : 'Press Alt+P anytime to park a thought.', fresh.length ? '<a class="btn btn-sm" href="#bucket">Review bucket</a>' : '') +
    fresh.slice(0, 3).map((p) => row(esc(p.text), fmtWhen(p.createdAt), `<span class="kind kind-${p.kind}">${KINDS[p.kind].label}</span>`)).join('');

  const next = calendar.connected && calendar.nextEvent && calendar.nextEvent.start > Date.now() ? calendar.nextEvent : null;
  const accountRows = calendar.connected
    ? row(calendar.demo ? 'Demo calendar connected' : 'Google Calendar connected', 'Read-only. Nudges you before events and blocks sites while they run.', '<button class="btn btn-sm btn-ghost" type="button" data-dash="disconnect">Disconnect</button>') +
      row('Next event', next ? esc(next.title) + ' at ' + fmtTime(next.start) : 'Nothing coming up', '') +
      row('Nudge timing', settings.nudgeLeadMin + ' minutes before each event', '<a class="btn btn-sm" href="#settings">Change</a>')
    : row('Google Calendar not connected', 'Connect to get a nudge before meetings. Read-only.', '<button class="btn btn-sm btn-google" type="button" data-dash="connect"><span class="g-mark" aria-hidden="true">G</span>Sign in with Google</button>');

  const sites = settings.sites || [];
  const blockRows =
    (state.block ? row('Blocking now', esc(state.block.title) + ' runs until ' + fmtTime(state.block.end) + (pledgeArmed(state.block) ? ' · ' + rupees(state.block.pledge * 100) + ' on the line' : ''), stopButton('btn-ghost')) : '') +
    row(sites.length + (sites.length === 1 ? ' site blocked' : ' sites blocked') + ' during calendar tasks', sites.length ? sites.map(esc).join(', ') : 'Add the sites that pull you away most.', '<a class="btn btn-sm" href="#settings">Edit</a>') +
    row('"Open anyway" wait', settings.overrideWait + ' seconds before a blocked site opens once', '');

  const walletRows = renderWalletRows();

  const recent = history.slice(-5).reverse();
  const recentRows = recent.length
    ? recent.map((s) => row(esc(s.task || 'Focus session'), fmtWhen(s.endedAt), `<span class="dash-val">${minutesLabel(s.minutesFocused)}</span>`)).join('')
    : row('No sessions yet', 'Your sessions show up here after they end.', '');

  $('dash').innerHTML =
    group('Right now', nowRows) +
    group('Your focus', focusRows) +
    group('Bucket', bucketRows) +
    group('Google account', accountRows) +
    group('Blocking', blockRows) +
    group('Focus wallet', walletRows) +
    group('Recent sessions', recentRows);
}

function walletReady() {
  return !!(state.settings.walletApi || WALLET_API);
}

function pledgeSelect(eventId, value) {
  const opts = PLEDGES.map((p) => `<option value="${p}"${p === value ? ' selected' : ''}>${p ? rupees(p * 100) : 'No pledge'}</option>`).join('');
  return `<select class="pledge-pick" data-pledge-event="${esc(eventId)}" aria-label="Pledge for this task">${opts}</select>`;
}

function renderWalletRows() {
  const { wallet, settings, pledges, block } = state;
  if (!walletReady()) {
    return row('Put money on your tasks', 'Pledge a small amount on each calendar task. Needs the wallet server set up once.', '<a class="btn btn-sm" href="#settings" data-goto="wallet">Set up</a>');
  }
  if (!wallet.signedIn) {
    return row('Put money on your tasks', 'Sign in to your prepaid wallet, add money, and pledge it on each calendar task.', '<button class="btn btn-sm btn-google" type="button" data-wallet="signin"><span class="g-mark" aria-hidden="true">G</span>Sign in with Google</button>');
  }
  const now = Date.now();
  const { calEvents } = state;
  const upcoming = Object.values(calEvents || {}).filter((e) => e.end > now && !(block && block.eventId === e.id)).sort((a, b) => a.start - b.start).slice(0, 4);
  const pick = (e) => (e.id in pledges ? Number(pledges[e.id]) : Number(settings.pledge));
  const forfeits = (wallet.txns || []).filter((t) => t.kind === 'forfeit').slice(0, 3);
  return row('Balance', wallet.email ? 'Signed in as ' + esc(wallet.email) : 'Prepaid, test mode', `<span class="dash-val">${rupees(wallet.balancePaise)}</span>`) +
    row('Add money', 'UPI or card through Razorpay, on the wallet page.', '<button class="btn btn-sm" type="button" data-wallet="open">Add money</button>') +
    (block ? row(esc(block.title) + ' (now)', pledgeArmed(block) ? rupees(block.pledge * 100) + ' on the line until ' + fmtTime(block.end) : block.forfeited ? 'Broken. ' + rupees(block.pledge * 100) + ' set aside for ' + esc(block.charity) : 'No pledge on this task', '') : '') +
    (upcoming.length
      ? upcoming.map((e) => row(esc(e.title), fmtWhen(e.start) + ' to ' + fmtTime(e.end), pledgeSelect(e.id, pick(e)))).join('')
      : row('No calendar tasks coming up', 'New tasks get ' + (settings.pledge ? rupees(settings.pledge * 100) : 'no pledge') + ' unless you change it here.', '<a class="btn btn-sm" href="#settings" data-goto="wallet">Default</a>')) +
    forfeits.map((t) => row('Broke ' + esc(t.task_title || 'a task'), fmtWhen(Date.parse(t.created_at)) + ' · ' + esc(t.charity || ''), `<span class="dash-val minus">−${rupees(t.amount_paise)}</span>`)).join('');
}

// Stopping a pledged block early costs the pledge, so the button says so and asks twice.
function stopButton(extra) {
  const b = state.block;
  const label = pledgeArmed(b) ? 'Stop and lose ' + rupees(b.pledge * 100) : 'Stop';
  return `<button class="btn btn-sm ${extra || ''}" type="button" data-stop="1">${label}</button>`;
}

async function stopClicked(b) {
  b.disabled = true;
  const res = await send('stopBlock', { forfeit: b.dataset.confirm === '1' });
  b.disabled = false;
  if (res && res.needsConfirm) {
    b.dataset.confirm = '1';
    b.textContent = 'Tap again to lose ' + rupees(res.pledge * 100);
    b.classList.add('btn-lose');
  } else if (res && res.ok === false) {
    toast(res.code === 'insufficient' ? 'Your wallet is too low to cover the pledge.' : 'Could not reach your wallet. Nothing was taken.');
  }
}

async function walletAction(kind, b) {
  $('wallet-err').hidden = true;
  if (b) b.disabled = true;
  const res = await send({ signin: 'walletSignIn', signout: 'walletSignOut', open: 'walletOpen', refresh: 'walletRefresh' }[kind]);
  if (b) b.disabled = false;
  if (res && res.ok === false) {
    if (current() === 'settings') {
      $('wallet-err').textContent = 'Could not ' + (kind === 'signin' ? 'sign in' : 'reach your wallet') + ' (' + res.error + ').';
      $('wallet-err').hidden = false;
    } else toast(res.error);
  }
}

document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-stop]');
  if (s) return stopClicked(s);
  const w = e.target.closest('[data-wallet]');
  if (w) return walletAction(w.dataset.wallet, w);
  const g = e.target.closest('[data-goto]');
  if (g) setTimeout(() => $(g.dataset.goto).scrollIntoView({ block: 'center' }), 50);
});

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-pledge-event]');
  if (!sel) return;
  const pledges = Object.assign({}, state.pledges, { [sel.dataset.pledgeEvent]: Number(sel.value) });
  await chrome.storage.local.set({ pledges });
  toast(Number(sel.value) ? rupees(sel.value * 100) + ' pledged on this task.' : 'No pledge on this task.');
});

$('dash').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dash]');
  if (!b) return;
  b.disabled = true;
  const res = await send({ connect: 'calConnect' }[b.dataset.dash] || 'calDisconnect');
  b.disabled = false;
  if (res && res.ok === false) {
    toast('Could not connect. Opening Settings to try again.');
    location.hash = 'settings';
  }
});

// ---------- setup ----------

let sessionUi = null;
let volumeUi = null;
const previewEngine = new SoundEngine();
let previewing = null;
let previewTimer = null;

function stopPreview() {
  previewEngine.stop();
  previewing = null;
  clearTimeout(previewTimer);
  document.querySelectorAll('.preview').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = '▶'; });
}

function renderSetup() {
  const { session, prefs, settings } = state;
  $('setup-running').hidden = !session;
  $('setup-form').hidden = !!session;
  if (session) {
    if (!sessionUi) sessionUi = mountSession($('setup-sess'));
    sessionUi.update(session);
    return;
  }
  const task = $('task');
  if (document.activeElement !== task) task.value = prefs.task || '';
  $('from-cal').hidden = !prefs.fromCalendar;

  const isCustom = ![25, 50].includes(prefs.plannedMin);
  document.querySelectorAll('[data-len]').forEach((b) => {
    const on = b.dataset.len === 'custom' ? isCustom : Number(b.dataset.len) === prefs.plannedMin;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $('custom-wrap').hidden = !isCustom;
  if (document.activeElement !== $('custom-min')) $('custom-min').value = isCustom ? prefs.plannedMin : prefs.customMin;

  $('themes').innerHTML = THEMES.map((t) => `
    <button type="button" class="theme" role="radio" aria-checked="${t.id === prefs.theme}" tabindex="${t.id === prefs.theme ? 0 : -1}" data-theme="${t.id}">
      <img src="assets/${t.id}-thumb.jpg" alt="">
      <b>${t.name}${t.id === 'vortex' ? ' <span class="muted small">· default</span>' : ''}</b>
      <span>${t.desc}</span>
    </button>`).join('');

  $('sounds').innerHTML = SOUNDS.map((s) => `
    <div class="sound" data-checked="${s.id === prefs.sound}">
      <button type="button" class="sound-pick" role="radio" aria-checked="${s.id === prefs.sound}" tabindex="${s.id === prefs.sound ? 0 : -1}" data-sound="${s.id}">
        <span class="radio"></span>
        <span><b>${esc(s.name)}</b><span class="d">${esc(s.desc)}</span></span>
      </button>
      ${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ''}
      ${s.id !== 'off' ? `<button type="button" class="preview" data-preview="${s.id}" aria-pressed="${previewing === s.id}" aria-label="Preview ${esc(s.name)}">${previewing === s.id ? '■' : '▶'}</button>` : ''}
    </div>`).join('');

  if (!volumeUi) {
    volumeUi = mountVolume($('volume'), prefs.volume, async (v, commit) => {
      previewEngine.setVolume(v);
      state.prefs.volume = v;
      if (commit) await patch('prefs', { volume: v });
    });
  } else volumeUi.set(prefs.volume);
  previewEngine.setVolume(prefs.volume);

  renderChips($('setup-sites'), settings.sites);
  $('start-note').textContent = settings.autoCircle ? 'The focus circle opens first. Click it to begin.' : 'Work starts right away.';
}

function renderChips(el, sites) {
  el.innerHTML = sites.length
    ? sites.map((s) => `<span class="chip">${esc(s)}<button type="button" data-remove="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></span>`).join('')
    : '<span class="muted small">No sites blocked.</span>';
}

// Re-rendering replaces buttons, so keep keyboard focus on the same option.
function focusKey() {
  const a = document.activeElement;
  if (!a || !a.dataset) return null;
  const k = Object.keys(a.dataset)[0];
  return k ? '[data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + '="' + a.dataset[k] + '"]' : null;
}

async function setPrefs(values) {
  const key = focusKey();
  state.prefs = await patch('prefs', values);
  renderSetup();
  if (key) { const el = document.querySelector(key); if (el) el.focus(); }
}

// Arrow keys move between options in a radio group.
function radioKeys(container, selector) {
  container.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    const items = [...container.querySelectorAll(selector)];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next.focus();
    next.click();
  });
}

$('task').addEventListener('input', (e) => { state.prefs.task = e.target.value; patch('prefs', { task: e.target.value, fromCalendar: false }); });
$('len-seg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-len]');
  if (!b) return;
  if (b.dataset.len === 'custom') {
    const c = [25, 50].includes(state.prefs.customMin) ? 90 : (state.prefs.customMin || 90);
    setPrefs({ plannedMin: c, customMin: c });
  } else setPrefs({ plannedMin: Number(b.dataset.len) });
});
radioKeys($('len-seg'), '[data-len]');
$('custom-min').addEventListener('change', (e) => {
  const v = Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 1)));
  e.target.value = v;
  setPrefs({ plannedMin: v, customMin: v });
});
$('themes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]');
  if (b) setPrefs({ theme: b.dataset.theme });
});
radioKeys($('themes'), '[data-theme]');
$('sounds').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-sound]');
  const prev = e.target.closest('[data-preview]');
  if (pick) setPrefs({ sound: pick.dataset.sound });
  if (prev) {
    const id = prev.dataset.preview;
    if (previewing === id) { stopPreview(); return; }
    stopPreview();
    previewEngine.setVolume(state.prefs.volume);
    previewEngine.play(id);
    previewing = id;
    prev.setAttribute('aria-pressed', 'true');
    prev.textContent = '■';
    previewTimer = setTimeout(stopPreview, 8000);
  }
});
radioKeys($('sounds'), '[data-sound]');

async function addSite(input) {
  const d = normalizeDomain(input.value);
  if (!d) { toast('Type a site like instagram.com'); return; }
  if (!state.settings.sites.includes(d)) state.settings = await patch('settings', { sites: state.settings.sites.concat([d]) });
  input.value = '';
  renderSetup();
  renderSettings();
}
async function removeSite(d) {
  state.settings = await patch('settings', { sites: state.settings.sites.filter((s) => s !== d) });
  renderSetup();
  renderSettings();
}
[['setup-site-input', 'setup-site-add'], ['set-site-input', 'set-site-add']].forEach(([inp, btn]) => {
  $(btn).addEventListener('click', () => addSite($(inp)));
  $(inp).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSite($(inp)); } });
});
[$('setup-sites'), $('set-sites')].forEach((el) => el.addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (b) removeSite(b.dataset.remove);
}));

$('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const task = $('task').value.trim();
  if (!task) {
    $('task').focus();
    $('start-note').textContent = 'Name the one thing first.';
    return;
  }
  stopPreview();
  $('start').disabled = true;
  const p = state.prefs;
  await send('startSession', { config: { task, plannedMin: p.plannedMin, theme: p.theme, sound: p.sound, volume: p.volume, blocked: state.settings.sites, fromCalendar: !!p.fromCalendar } });
  $('start').disabled = false;
});

// ---------- bucket ----------

function linkify(text) {
  const t = text.trim();
  const href = /^https?:\/\//i.test(t) ? t : 'https://' + t;
  return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(t)}</a>`;
}

function renderBucket() {
  const items = state.parked;
  const fresh = items.filter((p) => p.status === 'new').sort((a, b) => a.createdAt - b.createdAt);
  const review = $('review');
  if (fresh.length) {
    const p = fresh[0];
    const total = reviewed + fresh.length;
    const k = KINDS[p.kind] || KINDS.idea;
    review.innerHTML = `
      <div class="card review">
        <div class="rev-top"><b>Review</b><span class="rev-pos">${reviewed + 1} of ${total}</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${reviewed}" aria-label="Review progress"><i style="width:${(reviewed / total) * 100}%"></i></div>
        <div class="rev-meta"><span class="kind kind-${p.kind}">${k.label}</span><span>Parked ${esc(fmtWhen(p.createdAt))}${p.source === 'block' ? ' · from block page' : ''}</span></div>
        <div class="rev-text">${p.kind === 'link' ? linkify(p.text) : esc(p.text)}</div>
        <div class="rev-actions">
          <button class="btn btn-primary" data-rev="next" data-id="${esc(p.id)}">Next task</button>
          <button class="btn" data-rev="later" data-id="${esc(p.id)}">Later</button>
          <button class="btn btn-ghost" data-rev="delete" data-id="${esc(p.id)}">Delete</button>
        </div>
      </div>`;
  } else {
    review.innerHTML = `
      <div class="all-clear" role="status">
        <img src="assets/ring.png" alt="">
        <div><b>All clear</b><span class="muted small">${reviewed ? 'Every new thought has a place now.' : 'Nothing new to review. Park thoughts with Alt+P while you work.'}</span></div>
      </div>`;
  }

  const later = items.filter((p) => p.status === 'later').sort((a, b) => b.createdAt - a.createdAt);
  if (!later.length) { $('later').innerHTML = ''; return; }
  const groups = [['task', 'Tasks'], ['link', 'Links'], ['idea', 'Ideas']];
  $('later').innerHTML = `
    <div class="later-head"><b>Later</b><span class="muted small">Sorted for you · items older than 8 days archive themselves</span></div>
    ${groups.map(([kind, title]) => {
      const list = later.filter((p) => p.kind === kind);
      if (!list.length) return '';
      return `<div class="group"><h3>${title} · ${list.length}</h3>${list.map((p) => {
        const old = ageDays(p.createdAt) >= 7;
        return `<div class="item${old ? ' old' : ''}">
          <div class="item-text"><span>${kind === 'link' ? linkify(p.text) : esc(p.text)}</span><small>${esc(fmtWhen(p.createdAt))}${old ? ' · archives tomorrow' : ''}</small></div>
          <button class="btn" data-rev="next" data-id="${esc(p.id)}">Next task</button>
          <button class="btn btn-ghost" data-rev="delete" data-id="${esc(p.id)}" aria-label="Delete">Delete</button>
        </div>`;
      }).join('')}</div>`;
    }).join('')}`;
}

async function reviewAction(act, id) {
  const parked = state.parked.slice();
  const item = parked.find((p) => p.id === id);
  if (!item) return;
  const wasNew = item.status === 'new';
  if (act === 'later') item.status = 'later';
  const next = act === 'later' ? parked : parked.filter((p) => p.id !== id);
  await chrome.storage.local.set({ parked: next });
  state.parked = next;
  if (wasNew) reviewed++;
  if (act === 'next') {
    state.prefs = await patch('prefs', { task: item.text, fromCalendar: false });
    toast('Set as your next task.');
    location.hash = 'setup';
    return;
  }
  renderBucket();
  renderNav();
  const first = document.querySelector('#review [data-rev]');
  if (first) first.focus();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rev]');
  if (b) reviewAction(b.dataset.rev, b.dataset.id);
});

async function addThought() {
  const t = $('bucket-add').value.trim();
  if (!t) return;
  await send('saveThought', { text: t, source: 'manual', quiet: true });
  $('bucket-add').value = '';
}
$('bucket-add-btn').addEventListener('click', addThought);
$('bucket-add').addEventListener('keydown', (e) => { if (e.key === 'Enter') addThought(); });

// ---------- settings ----------

function setRadio(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => {
    const on = String(b.dataset[attr]) === String(value);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function renderSettings() {
  const { settings, calendar } = state;
  renderChips($('set-sites'), settings.sites);
  setRadio('[data-ow]', 'ow', settings.overrideWait);
  const blk = state.block;
  $('block-state').textContent = blk
    ? 'Blocking now for ' + blk.title + ', until ' + fmtTime(blk.end) + '.'
    : calendar.connected ? 'On from the start to the end of each event.' : 'Connect Google Calendar below to turn this on.';
  if (pledgeArmed(blk)) $('block-state').textContent += ' ' + rupees(blk.pledge * 100) + ' is pledged, so blocking runs to the end even if you switch it off.';
  $('block-actions').innerHTML = blk
    ? stopButton()
    : '<button class="btn btn-sm" type="button" data-blk="test">Test blocking for 2 minutes</button>';
  renderWalletSettings();
  setRadio('[data-lead]', 'lead', settings.nudgeLeadMin);
  document.querySelectorAll('[data-toggle]').forEach((b) => b.setAttribute('aria-checked', String(!!settings[b.dataset.toggle])));

  const act = $('cal-actions');
  if (calendar.connected) {
    const next = calendar.nextEvent && calendar.nextEvent.start > Date.now() ? calendar.nextEvent : null;
    $('cal-state').textContent = (calendar.demo ? 'Demo calendar connected. ' : 'Connected, read-only. ') +
      (next ? 'Next: ' + next.title + ' at ' + fmtTime(next.start) + '.' : 'Nothing coming up.');
    act.innerHTML = '<button class="btn btn-sm" data-cal="test">Send a test nudge</button><button class="btn btn-sm btn-ghost" data-cal="disconnect">Disconnect</button>';
  } else {
    $('cal-state').textContent = 'Not connected. Read-only access, used for nudges and to block sites while a task runs.';
    act.innerHTML = '<button class="btn btn-sm btn-google" data-cal="connect"><span class="g-mark" aria-hidden="true">G</span>Sign in with Google</button><button class="btn btn-sm" data-cal="demo">Try a demo event</button>';
  }
  if (calendar.connected) $('cal-setup').hidden = true;
  if (document.activeElement !== $('client-id')) $('client-id').value = settings.googleClientId || '';
}

function renderWalletSettings() {
  const { wallet, settings } = state;
  const ready = walletReady();
  $('wallet-setup').hidden = !!WALLET_API;
  if (document.activeElement !== $('wallet-api')) $('wallet-api').value = settings.walletApi || '';
  if (!ready) {
    $('wallet-title').textContent = 'Not set up';
    $('wallet-state').textContent = 'Add the wallet server address below to turn this on.';
    $('wallet-actions').innerHTML = '';
  } else if (!wallet.signedIn) {
    $('wallet-title').textContent = 'Not signed in';
    $('wallet-state').textContent = 'Use the same Google account you top up with.';
    $('wallet-actions').innerHTML = '<button class="btn btn-sm btn-google" data-wallet="signin"><span class="g-mark" aria-hidden="true">G</span>Sign in with Google</button>';
  } else {
    $('wallet-title').textContent = 'Balance ' + rupees(wallet.balancePaise);
    $('wallet-state').textContent = 'Signed in as ' + (wallet.email || 'you') + '. Test mode, no real money.';
    $('wallet-actions').innerHTML = '<button class="btn btn-sm" data-wallet="open">Add money</button><button class="btn btn-sm" data-wallet="refresh">Refresh</button><button class="btn btn-sm btn-ghost" data-wallet="signout">Sign out</button>';
  }
  if (!$('pledge-seg').children.length) {
    $('pledge-seg').innerHTML = PLEDGES.map((p) => `<button type="button" role="radio" data-pledge="${p}">${p ? rupees(p * 100) : 'Off'}</button>`).join('');
    $('charity-seg').innerHTML = CHARITIES.map((c) => `<button type="button" role="radio" data-charity="${esc(c)}">${esc(c)}</button>`).join('');
  }
  setRadio('[data-pledge]', 'pledge', settings.pledge);
  setRadio('[data-charity]', 'charity', settings.charity);
}

$('pledge-seg').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pledge]');
  if (b) { state.settings = await patch('settings', { pledge: Number(b.dataset.pledge) }); renderSettings(); }
});
radioKeys($('pledge-seg'), '[data-pledge]');
$('charity-seg').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-charity]');
  if (b) { state.settings = await patch('settings', { charity: b.dataset.charity }); renderSettings(); }
});
radioKeys($('charity-seg'), '[data-charity]');
$('wallet-api-save').addEventListener('click', async () => {
  const v = $('wallet-api').value.trim().replace(/\/+$/, '');
  if (v && !/^https?:\/\/[^\s]+$/.test(v)) {
    $('wallet-err').textContent = 'That does not look like a web address. It should start with https://';
    $('wallet-err').hidden = false;
    return;
  }
  state.settings = await patch('settings', { walletApi: v });
  await chrome.storage.session.remove('walletCfg');
  toast(v ? 'Saved. Now sign in to your wallet.' : 'Wallet server cleared.');
  renderSettings();
});

$('ow-seg').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ow]');
  if (b) { state.settings = await patch('settings', { overrideWait: Number(b.dataset.ow) }); renderSettings(); }
});
radioKeys($('ow-seg'), '[data-ow]');
$('lead-seg').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lead]');
  if (!b) return;
  state.settings = await patch('settings', { nudgeLeadMin: Number(b.dataset.lead) });
  renderSettings();
  send('calRefresh');
});
radioKeys($('lead-seg'), '[data-lead]');
document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
  const key = b.dataset.toggle;
  state.settings = await patch('settings', { [key]: !state.settings[key] });
  renderSettings();
  renderSetup();
}));
$('block-actions').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-blk]');
  if (!b) return;
  b.disabled = true;
  await send('testBlock');
  if (b.dataset.blk === 'test') toast('Blocking for 2 minutes. Try opening youtube.com.');
});
$('cal-actions').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cal]');
  if (!b) return;
  $('cal-err').hidden = true;
  b.disabled = true;
  const kind = b.dataset.cal;
  if (kind === 'connect' && !GOOGLE_CLIENT_ID && !state.settings.googleClientId) {
    b.disabled = false;
    openCalSetup();
    return;
  }
  const res = await send({ connect: 'calConnect', demo: 'calDemo', disconnect: 'calDisconnect', test: 'calTestNudge' }[kind]);
  b.disabled = false;
  if (res && res.ok === false) {
    showCalError(res.error);
  } else if (kind === 'test') {
    toast('Nudge sent. Check your notifications.');
  }
});
async function openCalSetup() {
  $('cal-setup').hidden = false;
  $('redirect-uri').textContent = await send('redirectUrl');
  $('client-id').focus();
}

function showCalError(msg) {
  let hint = 'Check the 5 steps below, or try the demo event.';
  if (/did not approve|canceled|closed/i.test(msg)) hint = 'The Google window was closed before you allowed access. Try Connect again.';
  else if (/access_denied/i.test(msg)) hint = 'Google blocked it. Add your Gmail as a Test user (step 3) and try again.';
  else if (/403/.test(msg)) hint = 'The Calendar API is off. Do step 2, wait a minute, then try again.';
  $('cal-err').textContent = 'Could not connect (' + msg + '). ' + hint;
  $('cal-err').hidden = false;
  $('cal-setup').hidden = false;
  send('redirectUrl').then((u) => { $('redirect-uri').textContent = u; });
}

$('copy-uri').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('redirect-uri').textContent);
  toast('Copied. Paste it under Authorized redirect URIs.');
});

async function connectWithClientId() {
  const id = $('client-id').value.trim();
  $('cal-err').hidden = true;
  if (!/\.apps\.googleusercontent\.com$/.test(id)) {
    $('cal-err').textContent = 'That does not look like a client ID. It should end in .apps.googleusercontent.com';
    $('cal-err').hidden = false;
    return;
  }
  $('client-connect').disabled = true;
  $('client-connect').textContent = 'Connecting…';
  const res = await send('calConnect', { clientId: id });
  $('client-connect').disabled = false;
  $('client-connect').textContent = 'Connect';
  if (res && res.ok === false) showCalError(res.error);
  else toast('Google Calendar connected.');
}
$('client-connect').addEventListener('click', connectWithClientId);
$('client-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectWithClientId(); });

$('change-shortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
chrome.commands.getAll().then((cmds) => {
  const c = cmds.find((x) => x.name === 'park-thought');
  $('shortcut').textContent = c && c.shortcut ? c.shortcut : 'Not set';
});

// ---------- summary ----------

function renderSummary() {
  const s = state.lastSummary;
  if (!s) {
    $('summary').innerHTML = `<div class="empty-sum"><h1 class="h2">No sessions yet</h1><p class="muted">Your summary shows up here when a session ends.</p><a class="btn btn-primary" href="#setup">Set up a session</a></div>`;
    return;
  }
  const done = s.reason === 'timeup';
  $('summary').innerHTML = `
    <div class="stack-lg">
      <div class="sum-head">
        <img src="assets/ring.png" alt="">
        <h1>${done ? 'Time. Nicely done.' : 'Session ended.'}</h1>
        <div class="sum-task">${esc(s.task)}</div>
        <div class="sum-num" aria-label="${s.minutesFocused} minutes focused"><span class="sum-big">${s.minutesFocused}</span><span class="sum-unit">min</span></div>
        <span class="muted">focused${s.plannedMin ? ' of ' + s.plannedMin + ' planned' : ''}</span>
      </div>
      <div class="stats">
        ${s.blocked.length ? `<div class="stat"><b>${s.blocked.length}</b><span>Sites blocked</span></div>
        <div class="stat"><b>${s.impulses}</b><span>Impulses blocked</span></div>
        <div class="stat"><b>${s.overrides}</b><span>Overrides</span></div>` : ''}
        <div class="stat"><b>${s.parkedCount}</b><span>Thoughts parked</span></div>
      </div>
      ${s.blocked.length ? `<div class="sum-sites">${s.blocked.map(esc).join(' · ')}</div>` : ''}
      <div class="sum-actions">
        <a class="btn" href="#bucket">Review bucket</a>
        <a class="btn btn-primary" href="#setup">Start another</a>
      </div>
    </div>`;
}

// ---------- live updates ----------

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  const before = state.session;
  state = await getAll();
  renderNav();
  const v = current();
  if (changes.session) {
    if (v === 'setup') {
      if (!before !== !state.session) renderSetup();
      else if (sessionUi && state.session) sessionUi.update(state.session);
    }
  }
  if (changes.parked && v === 'bucket') renderBucket();
  if (v === 'dashboard' && (changes.session || changes.parked || changes.calendar || changes.calEvents || changes.settings || changes.history || changes.block || changes.wallet || changes.pledges)) renderDashboard();
  if ((changes.calendar || changes.settings || changes.block || changes.wallet) && v === 'settings') renderSettings();
  if (changes.lastSummary && v === 'summary') renderSummary();
  if (changes.prefs && v === 'setup' && !state.session) renderSetup();
});

window.addEventListener('hashchange', route);
renderNav();
route();
document.querySelectorAll('.still-auto').forEach((el) => { el.innerHTML = stillify(el.textContent); });
