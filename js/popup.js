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
    const n = settings.sessionBlock ? settings.sites.length : 0;
    $('idle-meta').textContent = prefs.plannedMin + ' min · ' + (sound && sound.id !== 'off' ? sound.name : 'No sound') + (n ? ' · ' + n + (n === 1 ? ' site' : ' sites') + ' blocked' : '');
  }
}

async function start() {
  const { prefs, settings } = await getAll();
  const task = $('task').value.trim();
  $('start').disabled = true;
  if (task) await patch('prefs', { task });
  await send('startSession', { config: { task, plannedMin: prefs.plannedMin, theme: prefs.theme, sound: prefs.sound, volume: prefs.volume, blocked: settings.sites, fromCalendar: !!prefs.fromCalendar } });
  window.close();
}

$('start').addEventListener('click', start);
$('task').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
$('to-bucket').addEventListener('click', () => { send('openHome', { hash: 'bucket' }); window.close(); });
$('to-home').addEventListener('click', () => { send('openHome', { hash: 'setup' }); window.close(); });
$('to-capture').addEventListener('click', async () => { await send('openCapture'); window.close(); });

chrome.storage.onChanged.addListener((c) => { if (c.session || c.parked) render(); });
await render();
if (!$('idle').hidden) $('task').focus();
