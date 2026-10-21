import { attachSuggest } from './site-suggest.js';
import { BUILD, untilText, NO_END, GOOGLE_CLIENT_ID, WALLET_API, WALLET_ENABLED, PLEDGES, CHARITIES, rupees, pledgeArmed, getAll, patch, send, esc, stillify, fmtWhen, fmtTime, ageDays, normalizeDomain, reducedMotion, KINDS, SOUNDS, THEMES } from './lib.js';
import { mountVolume } from './volume.js';
import { SCORING, summarize, encouragement, localOffset, dayKey, dayNumber, keyFromNumber } from './progress.js';
import { mountSession } from './session-ui.js';
import { SoundEngine } from './audio.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['home', 'setup', 'block', 'bucket', 'insights', 'settings', 'summary'];
const PRESETS = [10, 15];
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
  // The setup view is called Focus everywhere people see it.
  const label = name === 'setup' ? 'Focus' : name[0].toUpperCase() + name.slice(1);
  document.title = name === 'home' ? 'Still' : 'Still · ' + label;
  // The tour shows on first open; every open after that lands on Focus (#setup).
  if (name === 'home' && !state.seenWelcome) chrome.storage.local.set({ seenWelcome: true });
  if (name !== 'setup') stopPreview();
  if (name === 'bucket') reviewed = 0;
  renderView(name);
  window.scrollTo(0, 0);
  if (name !== 'home') $('main').focus({ preventScroll: true });
}

function renderView(name) {
  const w = state.wallet;
  if (WALLET_ENABLED && name === 'settings' && w.signedIn && !(Date.now() - (w.lastSync || 0) < 60000)) send('walletRefresh');
  if (name === 'home') renderHome();
  if (name === 'setup') renderSetup();
  if (name === 'bucket') renderBucket();
  if (name === 'settings' || name === 'block') renderSettings();
  if (name === 'insights') renderInsights();
  if (name === 'summary') renderSummary();
}

function current() {
  const h = location.hash.slice(1);
  if (VIEWS.includes(h)) return h;
  return state.seenWelcome ? 'setup' : 'home';
}

// After an update Chrome can keep running the old background worker until Still is
// reloaded, and then new buttons do nothing. Spot that and offer the reload.
async function checkBuild(force) {
  const r = await send('ping');
  const stale = !r || r.build !== BUILD;
  $('reload-bar').hidden = !stale;
  if (stale && force) $('reload-bar').scrollIntoView({ block: 'nearest' });
  return !stale;
}
$('reload-still').addEventListener('click', () => chrome.runtime.reload());
checkBuild();

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
  } else if (cal.needsSignIn) {
    $('cal-label').textContent = 'Reconnect Calendar';
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
  if (cal.connected && !cal.needsSignIn && cal.nextEvent && cal.nextEvent.start > Date.now()) {
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

// ---------- wallet rows ----------

function row(title, sub, right) {
  return `<div class="dash-row"><div class="dash-text"><b>${title}</b>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>${right || ''}</div>`;
}

function group(title, rows) {
  return `<section class="dash-group"><h2 class="h2">${title}</h2><div class="card dash-list">${rows}</div></section>`;
}

function walletReady() {
  return !!(state.settings.walletApi || WALLET_API);
}

function pledgeSelect(eventId, value) {
  const opts = PLEDGES.map((p) => `<option value="${p}"${p === value ? ' selected' : ''}>${p ? rupees(p * 100) : 'No pledge'}</option>`).join('');
  return `<select class="pledge-pick" data-pledge-event="${esc(eventId)}" aria-label="Pledge for this task">${opts}</select>`;
}

// Per-task pledges, money owed and broken pledges, shown under Focus wallet in Settings.
// Balance, Add money and sign-in already live in the row above it.
function renderWalletRows() {
  const { wallet, settings, pledges, block } = state;
  if (!walletReady() || !wallet.signedIn) return '';
  const now = Date.now();
  const { calEvents } = state;
  const upcoming = Object.values(calEvents || {}).filter((e) => e.end > now && !(block && block.eventId === e.id)).sort((a, b) => a.start - b.start).slice(0, 4);
  const pick = (e) => (e.id in pledges ? Number(pledges[e.id]) : Number(settings.pledge));
  const forfeits = (wallet.txns || []).filter((t) => t.kind === 'forfeit').slice(0, 3);
  return (wallet.owedPaise > 0 ? row('Owed to charity: ' + rupees(wallet.owedPaise), 'From tasks you broke. Pay it from your UPI app once a month.', '<button class="btn btn-sm btn-primary" type="button" data-wallet="pay">Pay now</button>') : '') +
    (block ? row(esc(block.title) + ' (now)', pledgeArmed(block) ? rupees(block.pledge * 100) + ' on the line until ' + fmtTime(block.end) : block.forfeited ? 'Broken. ' + rupees(block.pledge * 100) + ' set aside for ' + esc(block.charity) : 'No pledge on this task', '') : '') +
    (upcoming.length
      ? upcoming.map((e) => row(esc(e.title), fmtWhen(e.start) + ' to ' + fmtTime(e.end), pledgeSelect(e.id, pick(e)))).join('')
      : row('No calendar tasks coming up', 'New tasks get ' + (settings.pledge ? rupees(settings.pledge * 100) : 'no pledge') + ' unless you change it here.', '')) +
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
  const res = await send({ signin: 'walletSignIn', signout: 'walletSignOut', open: 'walletOpen', pay: 'walletOpen', refresh: 'walletRefresh' }[kind], kind === 'pay' ? { hash: 'pay' } : null);
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
  $('setup-h1').textContent = session ? 'You are focusing' : 'What will you focus on?';
  $('setup-sub').hidden = !!session;
  if (session) {
    if (!sessionUi) sessionUi = mountSession($('setup-sess'));
    sessionUi.update(session);
    return;
  }
  const task = $('task');
  if (document.activeElement !== task) task.value = prefs.task || '';
  $('from-cal').hidden = !prefs.fromCalendar;
  renderCalOffer();

  const isCustom = !PRESETS.includes(prefs.plannedMin);
  document.querySelectorAll('[data-len]').forEach((b) => {
    const on = b.dataset.len === 'custom' ? isCustom : Number(b.dataset.len) === prefs.plannedMin;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $('custom-wrap').hidden = !isCustom;
  document.querySelectorAll('[data-quick]').forEach((q) => q.setAttribute('aria-pressed', String(isCustom && Number(q.dataset.quick) === prefs.plannedMin)));
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

  $('start-note').textContent = settings.sessionBlock && settings.sites.length ? 'Blocked sites close until the timer ends.' : '';
}

// A calendar task that is running or starts within the hour is offered as the task.
function calOffer() {
  const { calendar, calEvents, prefs } = state;
  if (!calendar.connected) return null;
  const now = Date.now();
  const e = Object.values(calEvents || {})
    .filter((x) => x.end > now && x.start <= now + 60 * 60000)
    .sort((a, b) => a.start - b.start)[0];
  if (!e || (prefs.task || '').trim() === e.title) return null;
  return e;
}

function renderCalOffer() {
  const e = calOffer();
  $('cal-offer').hidden = !e;
  if (!e) return;
  const now = Date.now();
  $('cal-offer-when').textContent = e.start <= now ? 'On your calendar now' : 'On your calendar at ' + fmtTime(e.start);
  $('cal-offer-title').textContent = e.title;
}

$('cal-offer-use').addEventListener('click', async () => {
  const e = calOffer();
  if (!e) return;
  state.prefs = await patch('prefs', { task: e.title, fromCalendar: true });
  $('task').value = e.title;
  renderSetup();
  $('start').focus();
});

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
    const c = PRESETS.includes(state.prefs.customMin) ? 25 : (state.prefs.customMin || 25);
    setPrefs({ plannedMin: c, customMin: c });
  } else setPrefs({ plannedMin: Number(b.dataset.len) });
});
radioKeys($('len-seg'), '[data-len]');
$('custom-wrap').addEventListener('click', (e) => {
  const q = e.target.closest('[data-quick]');
  if (q) setPrefs({ plannedMin: Number(q.dataset.quick), customMin: Number(q.dataset.quick) });
});
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
  const raw = input.value.trim().toLowerCase();
  // A bare name like "netflix" means netflix.com.
  const d = normalizeDomain(raw) || (/^[a-z0-9-]+$/.test(raw) ? raw + '.com' : '');
  if (!d) { toast('Type a site like instagram.com'); return; }
  input.value = '';
  await addDomain(d);
}
async function addDomain(d) {
  if (!state.settings.sites.includes(d)) state.settings = await patch('settings', { sites: state.settings.sites.concat([d]) });
  renderSettings();
}
async function removeSite(d) {
  state.settings = await patch('settings', { sites: state.settings.sites.filter((s) => s !== d) });
  renderSettings();
}
[['set-site-input', 'set-site-add']].forEach(([inp, btn]) => {
  // Registered first so Enter on a highlighted suggestion adds that one.
  attachSuggest($(inp), () => state.settings.sites, addDomain);
  $(btn).addEventListener('click', () => addSite($(inp)));
  $(inp).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSite($(inp)); } });
});
[$('set-sites')].forEach((el) => el.addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (b) removeSite(b.dataset.remove);
}));

$('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  // No task name is fine: the session is called "One focused block".
  const task = $('task').value.trim();
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
        <div class="rev-meta"><span class="kind kind-${p.kind}">${k.label}</span><span>Parked ${esc(fmtWhen(p.createdAt))}</span></div>
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
  const done = items.filter((p) => p.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (!later.length && !done.length) { $('later').innerHTML = ''; return; }
  const groups = [['task', 'Tasks'], ['link', 'Links'], ['idea', 'Ideas']];
  $('later').innerHTML = `
    ${later.length ? '<div class="later-head"><b>Later</b><span class="muted small">Sorted for you · items older than 8 days archive themselves</span></div>' : ''}
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
    }).join('')}
    ${done.length ? `<div class="group done-group"><h3>Done · ${done.length}</h3>${done.map((p) => `<div class="item done">
        <div class="item-text"><span>${esc(p.text)}</span><small>Struck off ${esc(fmtWhen(p.doneAt || p.createdAt))}</small></div>
        <button class="btn" data-rev="undone" data-id="${esc(p.id)}">Bring back</button>
        <button class="btn btn-ghost" data-rev="delete" data-id="${esc(p.id)}" aria-label="Delete">Delete</button>
      </div>`).join('')}</div>` : ''}`;
}

async function reviewAction(act, id) {
  const parked = state.parked.slice();
  const item = parked.find((p) => p.id === id);
  if (!item) return;
  const wasNew = item.status === 'new';
  if (act === 'later') item.status = 'later';
  if (act === 'undone') { item.status = item.prev || 'new'; delete item.prev; delete item.doneAt; }
  const next = act === 'later' || act === 'undone' ? parked : parked.filter((p) => p.id !== id);
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

// ---------- block now ----------

const BN_OPTS = [
  { min: 25, big: '25', unit: 'min' },
  { min: 60, big: '1', unit: 'hour' },
  { min: 0, big: '∞', unit: 'No limit' },
  { min: -1, big: '…', unit: 'Other' }
];

function bnMinutes() {
  const p = state.prefs;
  return p.blockMin === -1 ? p.blockOther : p.blockMin;
}

function fmtLeft(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' hr' + (r ? ' ' + r + ' min' : '');
}

function renderBlockNow() {
  const el = $('block-now');
  const blk = state.block;
  const n = state.settings.sites.length;
  const sites = n + (n === 1 ? ' site' : ' sites');
  if (blk && blk.manual) {
    const m = blk.manual, now = Date.now();
    const open = m.end >= NO_END;
    const locked = m.strict && m.end > now;
    const shared = blk.eventId !== 'manual';
    el.className = 'card pad set-sec bn live';
    el.innerHTML = `<div class="bn-top"><span class="bn-dot" aria-hidden="true"></span><span class="bn-tag">Blocking on</span></div>
      <div class="bn-big">Blocking ${sites}</div>
      <p class="muted bn-sub">${open ? 'Until you stop it · on for ' + fmtLeft(now - m.start) : 'Until ' + fmtTime(m.end) + ' · ' + fmtLeft(m.end - now) + ' left'}${shared ? ' · ' + esc(blk.title) + ' is blocking too' : ''}</p>
      <div class="bn-actions">
        ${open ? '' : '<button class="btn btn-sm" type="button" data-bn="more">+15 min</button>'}
        ${locked ? `<span class="bn-lock"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>Locked until ${fmtTime(m.end)}</span>`
          : '<button class="btn btn-sm btn-ghost" type="button" data-bn="stop">Stop blocking</button>'}
      </div>`;
    return;
  }
  const p = state.prefs;
  const noLimit = p.blockMin === 0;
  el.className = 'card pad set-sec bn';
  el.innerHTML = `<div><h2 class="h2" id="bn-label">Block now</h2>
      <p class="muted small">Block your ${sites} right away. No focus session needed.</p></div>
    <div class="bn-opts" role="radiogroup" aria-labelledby="bn-label">
      ${BN_OPTS.map((o) => `<button type="button" class="bn-opt" role="radio" aria-checked="${p.blockMin === o.min}" data-bnmin="${o.min}"><b>${o.big}</b><span>${o.unit}</span></button>`).join('')}
    </div>
    ${p.blockMin === -1 ? `<div class="bn-other"><span>Other</span><div class="bn-step">
      <button type="button" class="ins-arrow" data-bnstep="-5" aria-label="5 minutes less"${p.blockOther <= 5 ? ' disabled' : ''}>−</button>
      <b>${fmtLeft(p.blockOther * 60000)}</b>
      <button type="button" class="ins-arrow" data-bnstep="5" aria-label="5 minutes more"${p.blockOther >= 480 ? ' disabled' : ''}>+</button></div></div>` : ''}
    <div class="toggle-row"><div><b id="bn-strict-l">Let me stop early</b><span class="muted small">${noLimit ? 'Always on with no limit, so you can turn it off.' : 'Turn this off to lock blocking until the time is up.'}</span></div>
      <button class="switch" role="switch" id="bn-strict" aria-labelledby="bn-strict-l" aria-checked="${noLimit || !p.blockStrict}"${noLimit ? ' disabled' : ''}></button></div>
    <button class="btn btn-primary bn-start" type="button" data-bn="start">${noLimit ? 'Start blocking' : 'Block for ' + fmtLeft(bnMinutes() * 60000)}</button>`;
}

$('block-now').addEventListener('click', async (e) => {
  const opt = e.target.closest('[data-bnmin]');
  const step = e.target.closest('[data-bnstep]');
  const act = e.target.closest('[data-bn]');
  const sw = e.target.closest('#bn-strict');
  if (opt) {
    state.prefs = await patch('prefs', { blockMin: Number(opt.dataset.bnmin) });
    renderBlockNow();
    const again = $('block-now').querySelector(`[data-bnmin="${opt.dataset.bnmin}"]`);
    if (again) again.focus();
  } else if (step && !step.disabled) {
    state.prefs = await patch('prefs', { blockOther: Math.min(480, Math.max(5, state.prefs.blockOther + Number(step.dataset.bnstep))) });
    renderBlockNow();
    const again = $('block-now').querySelector(`[data-bnstep="${step.dataset.bnstep}"]`);
    if (again && !again.disabled) again.focus();
  } else if (sw && !sw.disabled) {
    state.prefs = await patch('prefs', { blockStrict: !state.prefs.blockStrict });
    renderBlockNow();
    $('bn-strict').focus();
  } else if (act) {
    act.disabled = true;
    if (act.dataset.bn === 'start') {
      if (!state.settings.sites.length) { act.disabled = false; toast('Add a site below first.'); return; }
      const res = await send('blockNow', { minutes: bnMinutes(), strict: state.prefs.blockMin !== 0 && state.prefs.blockStrict });
      if (!res || res.ok === false) {
        act.disabled = false;
        checkBuild(true);
        return;
      }
    } else if (act.dataset.bn === 'more') await send('extendManual', { minutes: 15 });
    else if (act.dataset.bn === 'stop') await send('stopManual');
    state = await getAll();
    renderSettings();
  }
});
setInterval(() => { if (current() === 'block' && state.block && state.block.manual) renderBlockNow(); }, 30000);

function setRadio(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => {
    const on = String(b.dataset[attr]) === String(value);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function renderSettings() {
  const { settings, calendar } = state;
  const pledgeRows = WALLET_ENABLED ? renderWalletRows() : '';
  $('wallet-rows').innerHTML = pledgeRows;
  $('wallet-rows').hidden = !pledgeRows;
  renderChips($('set-sites'), settings.sites);
  setRadio('[data-ow]', 'ow', settings.overrideWait);
  const blk = state.block;
  renderBlockNow();
  $('block-state').textContent = blk && blk.eventId !== 'manual'
    ? 'Blocking now for ' + blk.title + ', ' + untilText(blk.baseEnd || blk.end) + '.'
    : calendar.connected ? 'On from the start to the end of each event.' : 'Connect Google Calendar below to turn this on.';
  if (pledgeArmed(blk)) $('block-state').textContent += ' ' + rupees(blk.pledge * 100) + ' is pledged, so blocking runs to the end even if you switch it off.';
  // Blocking you started yourself is stopped from the Block now card.
  $('block-actions').innerHTML = blk && !blk.manual ? stopButton() : '';
  $('wallet').hidden = !WALLET_ENABLED;
  if (WALLET_ENABLED) renderWalletSettings();
  setRadio('[data-lead]', 'lead', settings.nudgeLeadMin);
  document.querySelectorAll('[data-toggle]').forEach((b) => b.setAttribute('aria-checked', String(!!settings[b.dataset.toggle])));

  const act = $('cal-actions');
  if (calendar.connected && calendar.needsSignIn) {
    $('cal-state').textContent = 'Google needs you to sign in again before Still can see new events. Nudges are paused until then.';
    act.innerHTML = '<button class="btn btn-sm btn-google" data-cal="connect"><span class="g-mark" aria-hidden="true">G</span>Reconnect</button><button class="btn btn-sm btn-ghost" data-cal="disconnect">Disconnect</button>';
  } else if (calendar.connected) {
    const next = calendar.nextEvent && calendar.nextEvent.start > Date.now() ? calendar.nextEvent : null;
    $('cal-state').textContent = (calendar.demo ? 'Demo calendar connected. ' : 'Connected, read-only. ') +
      (next ? 'Next: ' + next.title + ' at ' + fmtTime(next.start) + '. The Still window opens at ' + fmtTime(Math.max(Date.now(), next.start - settings.nudgeLeadMin * 60000)) + '.' : 'Nothing coming up.');
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
  send('calRefresh');
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
    toast('A nudge window just opened in the corner.');
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

function progressNow() {
  const now = Date.now();
  return summarize(state.progress, now, localOffset(now));
}

function streakLabel(n) {
  return n ? n + '-day streak' : 'No streak yet';
}

function renderSummary() {
  const s = state.lastSummary;
  if (!s) {
    $('summary').innerHTML = `<div class="empty-sum"><h1 class="h2">No sessions yet</h1><p class="muted">Your summary shows up here when a session ends.</p><a class="btn btn-primary" href="#setup">Set up a session</a></div>`;
    return;
  }
  const done = s.reason === 'timeup';
  const earned = done && s.eligible && s.points > 0;
  const pr = progressNow();
  // Points only show for sessions that can earn them; older summaries have no points field.
  const pointsNote = !('points' in s) ? ''
    : earned ? ''
    : done ? 'Sessions under ' + SCORING.minEligibleMinutes + ' minutes don’t earn points. Anything you’ve already earned stays.'
    : 'Ended early, so no points this time. Anything you’ve already earned stays.';
  const mark = earned
    ? `<svg class="done-mark" viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="dm-g" x1="0" x2="1"><stop offset="0" stop-color="#8B3DFF"/><stop offset="1" stop-color="#D63DD0"/></linearGradient></defs><circle class="dm-track" cx="40" cy="40" r="34"/><circle class="dm-ring" cx="40" cy="40" r="34"/><path class="dm-check" d="M27 41l9 9 17-19"/></svg>`
    : '<img src="assets/ring.png" alt="">';
  const progressRows = earned
    ? `<div class="card dash-list sum-progress">
        ${row('Points earned', s.scoredMinutes + ' minutes completed', `<span class="dash-val pts">+${s.points}</span>`)}
        ${row(streakLabel(pr.currentStreak), esc(encouragement(pr)), '')}
        ${row('Today', pr.totalPoints + ' points all time', `<span class="dash-val">${pr.todayPoints}</span>`)}
      </div>`
    : pointsNote ? `<p class="muted small sum-note">${pointsNote}</p>` : '';
  $('summary').innerHTML = `
    <div class="stack-lg">
      <div class="sum-head">
        ${mark}
        <h1>${done ? 'Time. Nicely done.' : 'Session ended.'}</h1>
        <div class="sum-task">${esc(s.task)}</div>
        <div class="sum-num" aria-label="${s.minutesFocused} minutes focused"><span class="sum-big">${s.minutesFocused}</span><span class="sum-unit">min</span></div>
        <span class="muted">focused${s.plannedMin ? ' of ' + s.plannedMin + ' planned' : ''}</span>
      </div>
      ${progressRows}
      <div class="stats">
        ${s.blocked.length ? `<div class="stat"><b>${s.blocked.length}</b><span>Sites blocked</span></div>
        <div class="stat"><b>${s.impulses}</b><span>Impulses blocked</span></div>
        <div class="stat"><b>${s.overrides}</b><span>Overrides</span></div>` : ''}
        <div class="stat"><b>${s.parkedCount}</b><span>Thoughts parked</span></div>
      </div>
      ${s.blocked.length ? `<div class="sum-sites">${s.blocked.map(esc).join(' · ')}</div>` : ''}
      <div class="sum-actions">
        <a class="btn btn-primary" href="#setup">Start another</a>
        ${s.parkedCount ? '<a class="btn btn-ghost" href="#bucket">Review bucket</a>' : ''}
      </div>
    </div>`;
}

// ---------- insights ----------

const WEEKDAY = (key) => new Date(key + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
const LONGDAY = (key) => new Date(key + 'T12:00:00Z').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const emptyBin = () => ({ done: 0, early: 0, doneN: 0, earlyN: 0 });
let insRange = 'week';
let insBack = 0; // how many days, weeks or months back from now

const DAYPARTS = [
  { name: 'Morning', range: '5 am to 12 pm', from: 5, to: 12 },
  { name: 'Afternoon', range: '12 pm to 5 pm', from: 12, to: 17 },
  { name: 'Evening', range: '5 pm to 9 pm', from: 17, to: 21 },
  { name: 'Night', range: '9 pm to 5 am', from: 21, to: 29 }
];

function fmtMin(m) {
  if (m < 60) return { n: m, u: 'min' };
  const h = m / 60;
  return { n: h >= 10 ? Math.round(h) : Math.round(h * 10) / 10, u: h === 1 ? 'hr' : 'hrs' };
}

// Everything the Insights page shows, from history (every session that ended),
// progress (completed days) and the bucket. Pure reads; nothing here writes.
function insightData() {
  const now = Date.now();
  const offset = localOffset(now);
  const pr = summarize(state.progress, now, offset);
  const hist = state.history || [];
  const focus = hist.filter((h) => h.kind !== 'calendar' && h.reason !== 'calendar');
  const completed = focus.filter((h) => h.reason === 'timeup');
  const early = focus.filter((h) => h.reason !== 'timeup');
  const totalMin = hist.reduce((n, h) => n + (h.minutesFocused || 0), 0);
  const avgMin = completed.length ? Math.round(completed.reduce((n, h) => n + (h.minutesFocused || 0), 0) / completed.length) : 0;
  const impulses = hist.reduce((n, h) => n + (h.impulses || 0), 0);
  const overrides = hist.reduce((n, h) => n + (h.overrides || 0), 0);

  const days = (state.progress && state.progress.days) || {};
  const today = dayNumber(dayKey(now, offset));
  // Every day since the first one Still knows about, from history (all sessions,
  // not just the ones that earned points).
  const byDay = {};
  let first = today;
  if (state.firstUsed) first = Math.min(first, dayNumber(dayKey(state.firstUsed, localOffset(state.firstUsed))));
  for (const k of Object.keys(days)) first = Math.min(first, dayNumber(k));
  for (const h of hist) {
    if (!h.endedAt) continue;
    const t = h.endedAt - (h.minutesFocused || 0) * 60000;
    const k = dayKey(t, localOffset(t));
    first = Math.min(first, dayNumber(k));
    const hk = k + 'T' + new Date(t).getHours();
    for (const b of [byDay[k] || (byDay[k] = emptyBin()), byDay[hk] || (byDay[hk] = emptyBin())]) {
      if (h.reason === 'timeup' || h.reason === 'calendar') { b.done += h.minutesFocused || 0; b.doneN += 1; }
      else { b.early += h.minutesFocused || 0; b.earlyN += 1; }
    }
  }
  const fortnight = [];
  for (let n = today - 13; n <= today; n += 1) {
    const k = keyFromNumber(n);
    fortnight.push({ key: k, on: !!(days[k] && days[k].points > 0), today: n === today });
  }

  const parts = DAYPARTS.map((p) => ({ ...p, minutes: 0 }));
  for (const h of hist) {
    if (!h.minutesFocused || !h.endedAt) continue;
    const start = new Date(h.endedAt - h.minutesFocused * 60000);
    let hr = start.getHours();
    if (hr < 5) hr += 24;
    const part = parts.find((p) => hr >= p.from && hr < p.to);
    if (part) part.minutes += h.minutesFocused;
  }

  return {
    pr, completed: completed.length, early: early.length, sessions: focus.length,
    calendar: hist.length - focus.length, totalMin, avgMin, impulses, overrides,
    byDay, first, today, fortnight, parts, parked: (state.parked || []).length,
    recent: hist.slice(-4).reverse()
  };
}

function donut(done, early) {
  const total = done + early;
  const r = 15.9155; // circumference 100
  if (!total) return `<svg viewBox="0 0 40 40" class="donut" aria-hidden="true"><circle cx="20" cy="20" r="${r}" class="dn-track"/></svg>`;
  const gap = done && early ? 1.6 : 0;
  const a = (done / total) * 100;
  const seg = (len, off, cls, tip) => len > 0
    ? `<circle cx="20" cy="20" r="${r}" class="${cls}" stroke-dasharray="${Math.max(0.01, len - gap)} ${100 - Math.max(0.01, len - gap)}" stroke-dashoffset="${25 - off}" data-tip="${esc(tip)}"/>` : '';
  return `<svg viewBox="0 0 40 40" class="donut" aria-hidden="true"><circle cx="20" cy="20" r="${r}" class="dn-track"/>
    ${seg(a, gap / 2, 'dn-done', plural(done, 'session') + ' completed')}${seg(100 - a, a + gap / 2, 'dn-early', plural(early, 'session') + ' ended early')}</svg>`;
}

function gauge(pct) {
  const p = Math.max(0, Math.min(100, pct));
  return `<svg viewBox="0 0 120 66" class="gauge" aria-hidden="true">
    <path d="M10 60 A50 50 0 0 1 110 60" pathLength="100" class="gg-track"/>
    ${p ? `<path d="M10 60 A50 50 0 0 1 110 60" pathLength="100" class="gg-fill" stroke-dasharray="${p} 100"/>` : ''}
  </svg>`;
}

function renderInsights() {
  const d = insightData();
  const pr = d.pr;
  $('ins-line').textContent = encouragement(pr);

  // Streak: the dark hero tile.
  const dot = (f) => {
    const tip = LONGDAY(f.key) + (f.on ? ': focused' : ': no completed session');
    return `<span class="sd${f.on ? ' on' : ''}${f.today ? ' today' : ''}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></span>`;
  };
  const letters = d.fortnight.slice(7).map((f) => `<span class="sd-l">${WEEKDAY(f.key).slice(0, 1)}</span>`).join('');
  const dots = `<span class="sd-r">Last week</span>${d.fortnight.slice(0, 7).map(dot).join('')}<span class="sd-r">This week</span>${d.fortnight.slice(7).map(dot).join('')}<span></span>${letters}`;
  const streak = `<article class="tile-b b-streak">
    <div class="b-label">Current streak</div>
    <div class="b-hero"><span class="b-big">${pr.currentStreak}</span><span class="b-unit">${pr.currentStreak === 1 ? 'day' : 'days'}</span></div>
    <p class="b-note">${pr.doneToday ? 'Today already counts.' : pr.currentStreak ? 'One session today keeps it going.' : 'Your next completed session starts one.'}</p>
    <div class="b-dots" role="img" aria-label="Focus days in the last 14 days: ${d.fortnight.filter((f) => f.on).length}">${dots}</div>
    <div class="b-pair">
      <div><b>${pr.longestStreak}</b><span>Best streak</span></div>
      <div><b>${pr.focusDays}</b><span>Focus days</span></div>
    </div>
  </article>`;

  // Sessions: completed vs ended early.
  const rate = d.sessions ? Math.round((d.completed / d.sessions) * 100) : 0;
  const sessions = `<article class="tile-b b-sessions">
    <div class="b-label">Sessions</div>
    <div class="b-sess">
      <div class="b-donut">${donut(d.completed, d.early)}<div class="b-donut-c"><b>${d.sessions ? rate + '%' : '0'}</b><span>${d.sessions ? 'completed' : 'sessions'}</span></div></div>
      <div class="b-legend">
        <div class="b-total"><b>${d.sessions}</b><span>${d.sessions === 1 ? 'session started' : 'sessions started'}</span></div>
        <div class="lg"><i class="lg-done"></i><span>Completed</span><b>${d.completed}</b></div>
        <div class="lg"><i class="lg-early"></i><span>Ended early</span><b>${d.early}</b></div>
        ${d.calendar ? `<div class="lg"><i class="lg-cal"></i><span>Calendar blocks</span><b>${d.calendar}</b></div>` : ''}
      </div>
    </div>
  </article>`;

  // Four small numbers.
  const t = fmtMin(d.totalMin);
  const kpi = (val, unit, label, cls) => `<div class="tile-b b-kpi${cls ? ' ' + cls : ''}"><div class="b-kv"><b>${val}</b>${unit ? `<span>${unit}</span>` : ''}</div><div class="b-label">${label}</div></div>`;
  const kpis = `<div class="b-kpis">
    ${kpi(pr.totalPoints, 'pts', 'Total points', 'pts')}
    ${kpi(t.n, t.u, 'Time focused')}
    ${kpi(d.avgMin, 'min', 'Average session')}
    ${kpi(d.parked, '', d.parked === 1 ? 'Thought in bucket' : 'Thoughts in bucket')}
  </div>`;

  // Activity chart: Day (by hour), Week (7 days) or Month, stepping back to the day you started.
  const shortDate = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const ymd = (k) => k.split('-').map(Number);
  let cols = [], range = '', hourly = false, canBack = false, ndays = 1;
  if (insRange === 'day') {
    hourly = true;
    const n = d.today - insBack, k = keyFromNumber(n);
    canBack = n > d.first;
    range = n === d.today ? 'Today, ' + shortDate(k) : LONGDAY(k);
    const hourName = (h) => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
    for (let h = 0; h < 24; h += 1) {
      cols.push({ key: k, tipHead: hourName(h) + ' to ' + hourName((h + 1) % 24), label: h % 6 === 0 ? hourName(h) : '', ...(d.byDay[k + 'T' + h] || emptyBin()) });
    }
  } else if (insRange === 'week') {
    const end = d.today - insBack * 7, start = end - 6;
    canBack = start > d.first;
    ndays = 7;
    const [y1] = ymd(keyFromNumber(start)), [y2] = ymd(keyFromNumber(end));
    range = shortDate(keyFromNumber(start)) + ' – ' + shortDate(keyFromNumber(end)) + ', ' + (y1 === y2 ? y2 : y1 + '–' + y2);
    for (let n = start; n <= end; n += 1) {
      const k = keyFromNumber(n);
      cols.push({ key: k, tipHead: LONGDAY(k), label: n === d.today ? 'Today' : WEEKDAY(k), today: n === d.today, before: n < d.first, ...(d.byDay[k] || emptyBin()) });
    }
  } else {
    const [ty, tm] = ymd(keyFromNumber(d.today));
    const m0 = new Date(Date.UTC(ty, tm - 1 - insBack, 1));
    const startN = Math.round(m0.getTime() / 86400000);
    const endN = Math.round(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1) / 86400000) - 1;
    canBack = startN > d.first;
    range = m0.toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' });
    ndays = Math.min(endN, d.today) - Math.max(startN, d.first) + 1;
    for (let n = startN; n <= endN; n += 1) {
      const k = keyFromNumber(n), day = n - startN + 1;
      cols.push({ key: k, tipHead: LONGDAY(k), label: n === d.today ? 'Today' : (day === 1 || day % 7 === 1) && Math.abs(n - d.today) > 2 ? String(day) : '', today: n === d.today, before: n < d.first || n > d.today, ...(d.byDay[k] || emptyBin()) });
    }
  }
  const totalMin = cols.reduce((n, x) => n + x.done + x.early, 0);
  const max = Math.max(hourly ? 30 : SCORING.minEligibleMinutes * 3, ...cols.map((x) => x.done + x.early));
  const peak = Math.max(...cols.map((x) => x.done + x.early));
  const bars = cols.map((x) => {
    const tot = x.done + x.early;
    const hd = x.done ? Math.max(3, (x.done / max) * 100) : 0;
    const he = x.early ? Math.max(3, (x.early / max) * 100) : 0;
    const parts = [];
    if (x.doneN) parts.push(x.doneN + ' completed');
    if (x.earlyN) parts.push(x.earlyN + ' ended early');
    const tip = x.tipHead + ': ' + (x.before ? (x.key > keyFromNumber(d.today) ? 'still to come' : 'before you started') : parts.length ? tot + ' min · ' + parts.join(', ') : 'no sessions');
    const label = tot && (x.today || tot === peak) ? `<span class="wk-val" style="bottom:${hd + he}%">${tot}</span>` : '';
    return `<div class="wk-col${x.today ? ' today' : ''}${x.before ? ' before' : ''}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
      <div class="wk-plot">${tot ? `<div class="wk-stack">${label}${he ? `<div class="wk-bar early" style="height:${he}%"></div>` : ''}${hd ? `<div class="wk-bar" style="height:${hd}%"></div>` : ''}</div>` : '<div class="wk-zero"></div>'}</div>
      <span class="wk-day">${x.label}</span>
    </div>`;
  }).join('');
  const avg = Math.round(totalMin / Math.max(1, ndays));
  const table = `<table class="sr-only"><caption>Focus minutes, ${esc(range)}</caption><thead><tr><th>${hourly ? 'Hour' : 'Day'}</th><th>Completed minutes</th><th>Ended early minutes</th></tr></thead><tbody>${cols.map((x) => `<tr><td>${esc(x.tipHead)}</td><td>${x.done}</td><td>${x.early}</td></tr>`).join('')}</tbody></table>`;
  const seg = ['day', 'week', 'month'].map((r) => `<button type="button" data-range="${r}" aria-pressed="${insRange === r}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('');
  const week = `<article class="tile-b b-week">
    <div class="b-head">
      <div><div class="b-label">${hourly ? 'Total' : 'Daily average'} · ${esc(range)}</div>
        <div class="b-kv"><b>${hourly ? totalMin : avg}</b><span>min</span><span class="wk-key"><span><i class="lg-done"></i>Completed</span><span><i class="lg-early"></i>Ended early</span></span></div></div>
      <div class="ins-ctl">
        <button type="button" class="ins-arrow" data-step="1" aria-label="Earlier"${canBack ? '' : ' disabled'}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg></button>
        <div class="ins-seg" role="group" aria-label="Chart range">${seg}</div>
        <button type="button" class="ins-arrow" data-step="-1" aria-label="Later"${insBack ? '' : ' disabled'}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>
      </div>
    </div>
    <div class="wk-chart${cols.length > 7 ? ' dense' : ''}" style="grid-template-columns:repeat(${cols.length}, minmax(0, 1fr))" role="img" aria-label="Focus minutes, ${esc(range)}">${bars}</div>
    ${table}
  </article>`;

  // Distractions: how often a blocked site was tried, and how often you let it through.
  const held = d.impulses ? Math.round(((d.impulses - Math.min(d.overrides, d.impulses)) / d.impulses) * 100) : 0;
  const distract = `<article class="tile-b b-distract">
    <div class="b-label">Distractions held off</div>
    <div class="b-dis">
      <div class="b-gauge">${gauge(d.impulses ? held : 0)}<div class="b-gauge-c"><b>${d.impulses ? held + '%' : '–'}</b></div></div>
      <div class="b-legend">
        <div class="lg"><span>Blocked visits</span><b>${d.impulses}</b></div>
        <div class="lg"><span>Let through</span><b>${d.overrides}</b></div>
        <p class="b-sub">${d.impulses ? 'Times you went back to work instead.' : 'Shows up once a blocked site is tried.'}</p>
      </div>
    </div>
  </article>`;

  // When you focus.
  const best = d.parts.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const pmax = Math.max(1, best.minutes);
  const partRows = d.parts.map((p) => {
    const tip = p.name + ' (' + p.range + '): ' + p.minutes + ' min';
    return `<div class="tod${best.minutes && p === best ? ' best' : ''}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span>${p.name}</span>
      <div class="tod-track"><div class="tod-bar" style="width:${p.minutes ? Math.max(3, Math.round((p.minutes / pmax) * 100)) : 0}%"></div></div><b>${p.minutes}</b></div>`;
  }).join('');
  const tod = `<article class="tile-b b-tod">
    <div class="b-head"><div class="b-label">When you focus</div>${best.minutes ? `<span class="chip best">Best: ${best.name}</span>` : ''}</div>
    <div class="tods">${partRows}</div>
  </article>`;

  // Recent sessions.
  const status = (h) => h.kind === 'calendar' || h.reason === 'calendar'
    ? { cls: 'cal', label: 'Calendar block', path: 'M3 4.5h6v5H3zM3 6.5h6' }
    : h.reason === 'timeup' ? { cls: 'done', label: 'Completed', path: 'M2.5 6.2 5 8.6l4.5-5' }
    : { cls: 'early', label: 'Ended early', path: 'M3.5 6h5' };
  const recent = `<article class="tile-b b-recent">
    <div class="b-head"><div class="b-label">Recent sessions</div><div class="rec-key"><span class="st done"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5"/></svg></span>Done <span class="st early"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 6h5"/></svg></span>Early</div></div>
    ${d.recent.length ? `<ul class="rec">${d.recent.map((h) => {
      const st = status(h);
      const tip = (h.task || 'Focus session') + ': ' + st.label + ', ' + (h.minutesFocused || 0) + ' min, ' + fmtWhen(h.endedAt);
      return `<li data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="st ${st.cls}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="${st.path}"/></svg></span><b>${esc(h.task || 'Focus session')}</b><span class="rec-m">${h.minutesFocused || 0} min</span></li>`;
    }).join('')}</ul>`
      : '<p class="b-empty">Your sessions will show up here.</p>'}
  </article>`;

  $('insights').innerHTML = `<div class="bento">${streak}${sessions}${kpis}${week}${distract}${tod}${recent}</div>`;
}

const tipEl = document.createElement('div');
tipEl.className = 'b-tip';
tipEl.hidden = true;
document.body.appendChild(tipEl);
function showTip(el) {
  if (!el) { tipEl.hidden = true; return; }
  tipEl.textContent = el.dataset.tip;
  tipEl.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8) + 'px';
  tipEl.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
}
$('insights').addEventListener('click', (e) => {
  const r = e.target.closest('[data-range]');
  const st = e.target.closest('[data-step]');
  if (r) { insRange = r.dataset.range; insBack = 0; }
  else if (st && !st.disabled) insBack = Math.max(0, insBack + Number(st.dataset.step));
  else return;
  showTip(null);
  renderInsights();
  const again = $('insights').querySelector(r ? `[data-range="${insRange}"]` : `[data-step="${st.dataset.step}"]`);
  if (again && !again.disabled) again.focus();
});
$('insights').addEventListener('pointerover', (e) => showTip(e.target.closest('[data-tip]')));
$('insights').addEventListener('focusin', (e) => showTip(e.target.closest('[data-tip]')));
$('insights').addEventListener('pointerleave', () => showTip(null));
$('insights').addEventListener('focusout', () => showTip(null));

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
  if ((changes.calendar || changes.settings || changes.block || changes.wallet || changes.calEvents || changes.pledges) && (v === 'settings' || v === 'block')) renderSettings();
  if ((changes.calendar || changes.calEvents || changes.settings) && v === 'setup' && !state.session) renderSetup();
  if ((changes.lastSummary || changes.progress) && v === 'summary') renderSummary();
  if ((changes.progress || changes.history || changes.parked) && v === 'insights') renderInsights();
  if (changes.prefs && v === 'setup' && !state.session) renderSetup();
});

window.addEventListener('hashchange', route);
renderNav();
route();
document.querySelectorAll('.still-auto').forEach((el) => { el.innerHTML = stillify(el.textContent); });

// "How points work" closes when you click anywhere else or press Esc.
document.addEventListener('click', (e) => {
  const how = document.querySelector('.ins-how[open]');
  if (how && !how.contains(e.target)) how.open = false;
});
document.addEventListener('keydown', (e) => {
  const how = document.querySelector('.ins-how[open]');
  if (e.key === 'Escape' && how) { how.open = false; how.querySelector('summary').focus(); }
});
