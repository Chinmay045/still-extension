import { send, fmtTime, getAll, THEMES, SOUNDS } from './lib.js';

// The calendar nudge window: shows the next task, then Focus opens a small picker for
// how long, which circle and which music before the circle starts.
const $ = (id) => document.getElementById(id);
const eventId = decodeURIComponent(location.hash.slice(1));
const START_MIN = 10;
const PICK_H = 680;
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
  document.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === choice.theme)));
  document.querySelectorAll('[data-sound]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.sound === choice.sound)));
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
const { prefs } = await getAll();
choice.custom = prefs.customMin || 20;
choice.theme = prefs.theme || 'vortex';
choice.sound = prefs.sound || 'ambient';

$('circles').innerHTML = THEMES.map((t) => `<button type="button" class="circ" role="radio" data-theme="${t.id}" title="${t.desc}"><img src="assets/${t.id}-thumb.jpg" alt="">${t.name}</button>`).join('');
$('sounds').innerHTML = SOUNDS.map((s) => `<button type="button" class="chip" role="radio" data-sound="${s.id}" title="${s.desc}">${SHORT_SOUND[s.id] || s.name}</button>`).join('');
render();
setInterval(render, 10000);

$('pick').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.len) choice.len = b.dataset.len === 'custom' ? 'custom' : Number(b.dataset.len);
  else if (b.dataset.theme) choice.theme = b.dataset.theme;
  else if (b.dataset.sound) choice.sound = b.dataset.sound;
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
