import { getAll, send, esc, fmtTime, SOUNDS } from './lib.js';

const $ = (id) => document.getElementById(id);
const PRESETS = [5, 10, 15, 25];
const SHORT = { ambient: 'Ambient', gamma: 'Gamma 40 Hz', beta: 'Beta pulse', cafe: 'Cafe', off: 'Silence' };
let leaving = false;

let { session, settings, calendar } = await getAll();
if (!session) {
  location.replace('home.html');
} else {
  $('task').textContent = session.task;
  $('img').src = 'assets/' + session.theme + '.jpg';
  if (settings.nightDim && new Date().getHours() >= 21) document.body.classList.add('dim');
  const next = calendar.connected && calendar.nextEvent && calendar.nextEvent.start > Date.now() ? calendar.nextEvent : null;
  $('meta').textContent = next && settings.calendarBlock
    ? 'Sites get blocked when ' + next.title + ' starts at ' + fmtTime(next.start) + '.'
    : 'Nothing is blocked while you get ready.';
  $('vol').value = session.volume;
  render();

  const circle = $('circle');
  const begin = async () => {
    if (circle.disabled) return;
    circle.disabled = true;
    leaving = true;
    await send('beginWork');
  };
  circle.addEventListener('click', begin);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) { e.preventDefault(); begin(); }
    if (e.key === 'Escape') exit();
  });
  $('exit').addEventListener('click', exit);
}

function render() {
  $('len').textContent = session.plannedMin + ' min';
  $('presets').innerHTML = PRESETS.map((m) => `<button type="button" class="chipb" role="radio" aria-checked="${m === session.plannedMin}" data-min="${m}">${m}</button>`).join('');
  $('sounds').innerHTML = SOUNDS.map((s) => `<button type="button" class="chipb" role="radio" aria-checked="${s.id === session.sound}" data-sound="${s.id}" title="${esc(s.desc)}">${esc(SHORT[s.id] || s.name)}</button>`).join('');
}

async function exit() {
  if (leaving) return;
  leaving = true;
  await send('exitCircle');
}

document.querySelector('.dock').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !session) return;
  let next = null;
  if (b.dataset.step) next = await send('setLength', { minutes: session.plannedMin + Number(b.dataset.step) });
  else if (b.dataset.min) next = await send('setLength', { minutes: Number(b.dataset.min) });
  else if (b.dataset.sound) next = await send('setSound', { sound: b.dataset.sound });
  if (next) session = next;
  const key = b.dataset.step ? `[data-step="${b.dataset.step}"]` : b.dataset.min ? `[data-min="${b.dataset.min}"]` : `[data-sound="${b.dataset.sound}"]`;
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
  const changed = n.plannedMin !== session.plannedMin || n.sound !== session.sound;
  session = n;
  if (changed) render();
});
