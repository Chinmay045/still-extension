import { getAll, send, SOUNDS, fmtTime } from './lib.js';
import { mountSession } from './session-ui.js';

const $ = (id) => document.getElementById(id);
const ui = mountSession($('sess'));
// A sync older than this means polling has stopped working.
const STALE_MS = 15 * 60000;

// The calendar drives nudges and calendar blocking, so its state sits at the top.
function calState(calendar) {
  if (!calendar.connected) return { state: 'off', label: 'Connect Calendar', title: 'Connect Google Calendar for focus nudges' };
  if (calendar.needsSignIn) return { state: 'broken', label: 'Reconnect Calendar', title: 'Google signed Still out. Reconnect to keep nudges working' };
  if (!calendar.demo && calendar.lastSync && Date.now() - calendar.lastSync > STALE_MS) {
    return { state: 'broken', label: 'Calendar not syncing', title: 'Last synced at ' + fmtTime(calendar.lastSync) + '. Click to reconnect' };
  }
  return { state: 'synced', label: calendar.demo ? 'Demo calendar' : 'Calendar synced', title: 'Google Calendar is connected' };
}

// The task comes from the calendar when one is on now or within the hour.
function calendarTask(calendar, calEvents) {
  if (!calendar.connected) return null;
  const now = Date.now();
  return Object.values(calEvents || {})
    .filter((e) => e.end > now && e.start <= now + 60 * 60000)
    .sort((a, b) => a.start - b.start)[0] || null;
}

async function render() {
  const { session, prefs, parked, settings, calendar, calEvents } = await getAll();
  const fresh = parked.filter((p) => p.status === 'new').length;
  $('bucket-count').textContent = fresh ? '· ' + fresh : '';
  $('idle').hidden = !!session;
  $('active').hidden = !session;
  const c = calState(calendar);
  $('cal').dataset.state = c.state;
  $('cal').title = c.title;
  $('cal-label').textContent = c.label;
  if (session) ui.update(session);
  else {
    const e = calendarTask(calendar, calEvents);
    const sound = SOUNDS.find((s) => s.id === prefs.sound);
    const n = settings.sessionBlock ? settings.sites.length : 0;
    $('idle-meta').textContent = (e ? e.title + ' · ' : '') + prefs.plannedMin + ' min · ' + (sound && sound.id !== 'off' ? sound.name : 'No sound') + (n ? ' · ' + n + (n === 1 ? ' site' : ' sites') + ' blocked' : '');
  }
}

async function start() {
  const { prefs, settings, calendar, calEvents } = await getAll();
  const e = calendarTask(calendar, calEvents);
  $('start').disabled = true;
  await send('startSession', { config: { task: e ? e.title : '', plannedMin: prefs.plannedMin, theme: prefs.theme, sound: prefs.sound, volume: prefs.volume, blocked: settings.sites, fromCalendar: !!e } });
  window.close();
}

$('cal').addEventListener('click', async () => {
  const state = $('cal').dataset.state;
  if (state === 'synced') { send('openHome', { hash: 'settings' }); window.close(); return; }
  $('cal-label').textContent = 'Connecting…';
  $('cal').disabled = true;
  const res = await send('calConnect', {});
  $('cal').disabled = false;
  if (res && res.ok === false) {
    $('cal-note').textContent = 'Could not connect: ' + res.error;
    $('cal-note').hidden = false;
  } else $('cal-note').hidden = true;
  render();
});
$('start').addEventListener('click', start);
$('to-bucket').addEventListener('click', () => { send('openHome', { hash: 'bucket' }); window.close(); });
$('to-block').addEventListener('click', () => { send('openHome', { hash: 'block' }); window.close(); });
$('to-capture').addEventListener('click', async () => { await send('openCapture'); window.close(); });

chrome.storage.onChanged.addListener((c) => { if (c.session || c.parked || c.calendar) render(); });
await render();
if (!$('idle').hidden) $('start').focus();
