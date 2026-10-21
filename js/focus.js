import { getAll, send, esc, fmtTime, fmtClock, SOUNDS, THEMES } from './lib.js';
import { summarize, localOffset, SCORING } from './progress.js';

const $ = (id) => document.getElementById(id);
const PRESETS = [10, 15, 25, 50];
const SHORT = { ambient: 'Ambient', gamma: 'Gamma 40 Hz', beta: 'Beta pulse', cafe: 'Cafe', off: 'Silence' };
let leaving = false;

let { session, settings, calendar, progress } = await getAll();
if (!session) {
  location.replace('home.html');
} else {
  $('task').textContent = session.task;
  $('img').src = 'assets/' + session.theme + '.jpg';
  if (settings.nightDim && new Date().getHours() >= 21) document.body.classList.add('dim');
  const next = calendar.connected && calendar.nextEvent && calendar.nextEvent.start > Date.now() ? calendar.nextEvent : null;
  $('meta').textContent = settings.sessionBlock && session.endsAt
    ? 'Blocked sites stay closed until ' + fmtTime(session.endsAt) + '.'
    : next && settings.calendarBlock ? 'Sites get blocked when ' + next.title + ' starts at ' + fmtTime(next.start) + '.' : '';
  const pr = summarize(progress, Date.now(), localOffset(Date.now()));
  $('streak').textContent = pr.currentStreak
    ? pr.currentStreak + '-day streak · ' + pr.todayPoints + ' points today'
    : 'Finish ' + SCORING.minEligibleMinutes + ' minutes or more to start a streak.';
  $('vol').value = session.volume;
  render();
  // The timer runs from the moment Focus is pressed. A session from an older version may
  // still be waiting, so start it here; no answer means Still itself needs a reload.
  send('startTimer').then((s) => {
    if (s) { session = s; render(); tickClock(); } else stale();
  });
  tickClock();
  setInterval(tickClock, 1000);

  $('back').addEventListener('click', back);
  $('end').addEventListener('click', endFocus);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
}

function tickClock() {
  if (!session) return;
  const ms = session.phase === 'working' ? session.endsAt - Date.now() : session.plannedMin * 60000;
  const t = fmtClock(Math.max(0, ms));
  $('clock').textContent = t;
  $('len').textContent = session.phase === 'working' ? t + ' left' : session.plannedMin + ' min';
}

// Still was updated on disk but Chrome is still running the old version in the background,
// so buttons here get no answer. Say how to fix it instead of failing quietly.
function stale() {
  $('stale').hidden = false;
}

function render() {
  $('presets').innerHTML = PRESETS.map((m) => `<button type="button" class="chipb" role="radio" aria-checked="${m === session.plannedMin}" data-min="${m}">${m}</button>`).join('');
  $('themes').innerHTML = THEMES.map((t) => `<button type="button" class="thm" role="radio" aria-checked="${t.id === session.theme}" data-theme="${t.id}" title="${esc(t.name)}" aria-label="${esc(t.name)}"><img src="assets/${t.id}-thumb.jpg" alt=""></button>`).join('');
  $('img').src = 'assets/' + session.theme + '.jpg';
  $('sounds').innerHTML = SOUNDS.map((s) => `<button type="button" class="chipb" role="radio" aria-checked="${s.id === session.sound}" data-sound="${s.id}" title="${esc(s.desc)}">${esc(SHORT[s.id] || s.name)}</button>`).join('');
}

// A circle tab left open across an extension reload or update loses its link to
// Still: every message comes back empty. Instead of buttons that silently do
// nothing, reload into the live extension.
function reconnect(hash) {
  if (chrome.runtime && chrome.runtime.id) { stale(); leaving = false; return; }
  if (hash) location.replace('home.html#' + hash);
  else location.reload();
}

// Back to work: close the circle, the timer keeps going.
async function back() {
  if (leaving) return;
  leaving = true;
  const res = await send('exitCircle');
  if (!res) reconnect('setup');
}

// End focus: stop the timer and show the summary.
async function endFocus() {
  if (leaving) return;
  const res = await send('endSession');
  if (!res) reconnect('setup');
}

document.querySelector('.dock').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !session) return;
  let next = null;
  if (b.dataset.step) next = await send('setLength', { minutes: session.plannedMin + Number(b.dataset.step) });
  else if (b.dataset.min) next = await send('setLength', { minutes: Number(b.dataset.min) });
  else if (b.dataset.sound) next = await send('setSound', { sound: b.dataset.sound });
  else if (b.dataset.theme) next = await send('setTheme', { theme: b.dataset.theme });
  if (next) session = next;
  else return reconnect();
  const key = b.dataset.step ? `[data-step="${b.dataset.step}"]` : b.dataset.min ? `[data-min="${b.dataset.min}"]` : b.dataset.theme ? `[data-theme="${b.dataset.theme}"]` : `[data-sound="${b.dataset.sound}"]`;
  render();
  const again = document.querySelector(key);
  if (again) again.focus();
});

let volTimer = null;
$('vol').addEventListener('input', () => {
  clearTimeout(volTimer);
  volTimer = setTimeout(() => send('setVolume', { volume: Number($('vol').value) }), 60);
});

chrome.storage.onChanged.addListener((c) => {
  if (!c.session) return;
  if (!c.session.newValue) { if (!leaving) location.replace('home.html#summary'); return; }
  const n = c.session.newValue;
  const changed = n.plannedMin !== session.plannedMin || n.sound !== session.sound || n.theme !== session.theme;
  session = n;
  if (changed) render();
  tickClock();
  $('stale').hidden = true;
});
