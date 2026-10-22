import { send, fmtTime, getAll, patch, taskKey, THEMES } from './lib.js';

// The calendar nudge window: shows the next task, then Focus opens a small picker for
// how long. The circle and music are the ones set on the Focus page.
const $ = (id) => document.getElementById(id);
const eventId = decodeURIComponent(location.hash.slice(1));
const START_MIN = 10;
const PICK_H = 350;
const SHORT_SOUND = { ambient: 'Ambient', gamma: 'Gamma 40 Hz', beta: 'Beta pulse', cafe: 'Cafe', white: 'White noise', pink: 'Pink noise', brown: 'Brown noise', off: 'Silence' };
let ev = null;
let picking = false;
const choice = { len: START_MIN, custom: 20, theme: 'vortex', sound: 'ambient' };

const minutes = () => (choice.len === 'custom' ? choice.custom : choice.len);

function render() {
  if (!ev) return;
  // The offer lasts as long as the event: close by itself once it ends.
  if (Date.now() >= ev.end) { window.close(); return; }
  const started = Date.now() >= ev.start;
  const mins = Math.round((ev.start - Date.now()) / 60000);
  $('when').textContent = mins > 1 ? 'Starts in ' + mins + ' minutes' : mins === 1 ? 'Starts in 1 minute' : mins === 0 ? 'Starting now' : 'Started ' + -mins + (mins === -1 ? ' minute ago' : ' minutes ago');
  $('title').textContent = ev.title;
  $('pick-title').textContent = ev.title;
  const left = Math.round((ev.end - Math.max(ev.start, Date.now())) / 60000);
  $('meta').textContent = fmtTime(ev.start) + ' to ' + fmtTime(ev.end) + ' · ' + left + ' min' + (started ? ' left' : '');
  $('head').textContent = picking ? 'Set your focus' : started ? 'Happening now' : 'Coming up';
  $('focus').textContent = picking ? 'Start ' + minutes() + ' min' : 'Focus for ' + START_MIN + ' min';
}

function paintPick() {
  document.querySelectorAll('[data-len]').forEach((b) => b.setAttribute('aria-checked', String(String(choice.len) === b.dataset.len)));
  $('step').hidden = choice.len !== 'custom';
  $('custom').textContent = choice.custom + ' min';
  render();
}

async function resize(height) {
  try {
    const w = await chrome.windows.getCurrent();
    await chrome.windows.update(w.id, { height });
  } catch (e) { /* stays the size it is */ }
}

let baseH = 300;
async function setPicking(on) {
  picking = on;
  document.body.classList.toggle('picking', on);
  $('info').hidden = on;
  $('info').style.display = on ? 'none' : 'contents';
  $('pick').hidden = !on;
  $('setup').hidden = on;
  $('back').hidden = !on;
  paintPick();
  if (on) {
    try { baseH = (await chrome.windows.getCurrent()).height || baseH; } catch (e) { /* keep default */ }
    await resize(PICK_H);
    const sel = document.querySelector('[data-len][aria-checked="true"]');
    if (sel) sel.focus();
  } else {
    await resize(baseH);
    $('focus').focus();
  }
}

const { calEvents } = await chrome.storage.local.get('calEvents');
ev = (calEvents || {})[eventId] || null;
if (!ev) window.close();
const { prefs, settings } = await getAll();
choice.custom = prefs.customMin || 20;
choice.theme = prefs.theme || 'vortex';
choice.sound = prefs.sound || 'ambient';

const themeName = (THEMES.find((t) => t.id === choice.theme) || THEMES[0]).name;
const soundName = SHORT_SOUND[choice.sound] || choice.sound;
$('uses').innerHTML = `With <b>${themeName}</b> and <b>${soundName}</b> from your Focus page.`;
// Sites this task needs open: picked before it starts, fixed once it runs.
let allowed = ev ? ((settings.taskAllow || {})[taskKey(ev.title)] || []).slice() : [];
function paintAllow() {
  const box = $('allow');
  const open = Date.now() < ev.start;
  box.hidden = !settings.calendarBlock || !settings.sites.length || (!open && !allowed.length);
  if (box.hidden) return;
  const list = open ? settings.sites : settings.sites.filter((d) => allowed.includes(d));
  $('allow-chips').innerHTML = list.map((d) => `<button type="button" class="chip" data-allow="${d}" aria-pressed="${allowed.includes(d)}"${open ? '' : ' disabled'}>${d}</button>`).join('');
  $('allow-note').textContent = open
    ? (allowed.length ? 'Open during this task only. The rest stay blocked.' : 'Tap one to keep it open during this task only.')
    : 'Open during this task. Exceptions can only change before a task starts.';
}
$('allow-chips').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-allow]');
  if (!b || Date.now() >= ev.start) return;
  const d = b.dataset.allow;
  allowed = allowed.includes(d) ? allowed.filter((x) => x !== d) : allowed.concat(d);
  const fresh = (await getAll()).settings;
  const map = Object.assign({}, fresh.taskAllow || {});
  if (allowed.length) map[taskKey(ev.title)] = allowed; else delete map[taskKey(ev.title)];
  await patch('settings', { taskAllow: map });
  paintAllow();
});
if (ev) paintAllow();
render();
setInterval(() => { render(); if (ev) paintAllow(); }, 10000);
// Grow the window if the exceptions don't fit.
requestAnimationFrame(async () => {
  const sheet = document.querySelector('.sheet');
  // Centered content spills over both edges, so measure it top-aligned.
  sheet.style.justifyContent = 'flex-start';
  const extra = sheet.scrollHeight - sheet.clientHeight;
  sheet.style.justifyContent = '';
  if (extra > 0) {
    try { const w = await chrome.windows.getCurrent(); await chrome.windows.update(w.id, { height: w.height + extra + 12 }); } catch (err) { /* stays */ }
  }
});

$('pick').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.len) choice.len = b.dataset.len === 'custom' ? 'custom' : Number(b.dataset.len);
  else if (b.id === 'less') choice.custom = Math.max(5, choice.custom - 5);
  else if (b.id === 'more') choice.custom = Math.min(240, choice.custom + 5);
  else return;
  paintPick();
});

$('focus').addEventListener('click', async () => {
  if (!picking) { setPicking(true); return; }
  $('focus').disabled = true;
  await send('nudgeFocus', { eventId, minutes: minutes(), theme: choice.theme, sound: choice.sound });
  window.close();
});
$('back').addEventListener('click', () => setPicking(false));
$('setup').addEventListener('click', async () => {
  await send('nudgePrepare', { eventId });
  window.close();
});
$('close').addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (picking) setPicking(false); else window.close();
});
$('focus').focus();
