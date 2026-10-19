import { getAll, send, patch, SOUNDS } from './lib.js';
import { mountSession } from './session-ui.js';

const $ = (id) => document.getElementById(id);
const ui = mountSession($('sess'));

async function render() {
  const { session, prefs, parked, settings } = await getAll();
  const fresh = parked.filter((p) => p.status === 'new').length;
  $('bucket-count').textContent = fresh ? '· ' + fresh : '';
  $('idle').hidden = !!session;
  $('active').hidden = !session;
  $('status').textContent = session ? (session.phase === 'working' ? 'Focusing' : 'In the circle') : 'Ready';
  if (session) ui.update(session);
  else {
    if (!$('task').value) $('task').value = prefs.task || '';
    const sound = SOUNDS.find((s) => s.id === prefs.sound);
    $('idle-meta').textContent = prefs.plannedMin + ' min · ' + (sound ? sound.name : 'Silence') + ' · ' + settings.sites.length + ' sites blocked';
  }
}

async function start() {
  const { prefs, settings } = await getAll();
  const task = $('task').value.trim();
  if (!task) { $('task').focus(); $('task').placeholder = 'Name one task first'; return; }
  $('start').disabled = true;
  await patch('prefs', { task });
  await send('startSession', { config: { task, plannedMin: prefs.plannedMin, theme: prefs.theme, sound: prefs.sound, volume: prefs.volume, blocked: settings.sites, fromCalendar: !!prefs.fromCalendar } });
  window.close();
}

$('start').addEventListener('click', start);
$('task').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
$('to-bucket').addEventListener('click', () => { send('openHome', { hash: 'bucket' }); window.close(); });
$('to-home').addEventListener('click', () => { send('openHome', { hash: '' }); window.close(); });
$('to-park').addEventListener('click', () => { send('openCapture'); window.close(); });

chrome.storage.onChanged.addListener((c) => { if (c.session || c.parked) render(); });
await render();
if (!$('idle').hidden) $('task').focus();
