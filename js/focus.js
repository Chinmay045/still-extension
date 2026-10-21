import { getAll, send, fmtTime, fmtClock } from './lib.js';
import { summarize, localOffset, SCORING } from './progress.js';

const $ = (id) => document.getElementById(id);
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
  render();
  // The timer runs from the moment Focus is pressed. A session from an older version may
  // still be waiting, so start it here; no answer means Still itself needs a reload.
  send('startTimer').then((s) => {
    if (s) { session = s; render(); tickClock(); } else stale();
  });
  tickClock();
  setInterval(tickClock, 1000);

  $('end').addEventListener('click', endFocus);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
}

function tickClock() {
  if (!session) return;
  const ms = session.phase === 'working' ? session.endsAt - Date.now() : session.plannedMin * 60000;
  const t = fmtClock(Math.max(0, ms));
  $('clock').textContent = t;
}

// Still was updated on disk but Chrome is still running the old version in the background,
// so buttons here get no answer. Say how to fix it instead of failing quietly.
function stale() {
  $('stale').hidden = false;
}

function render() {
  $('img').src = 'assets/' + session.theme + '.jpg';
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
