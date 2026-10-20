import { send, fmtTime } from './lib.js';

// The calendar nudge window: shows the next task and starts the focus circle with one click.
const $ = (id) => document.getElementById(id);
const eventId = decodeURIComponent(location.hash.slice(1));
let ev = null;

function render() {
  if (!ev) return;
  const mins = Math.round((ev.start - Date.now()) / 60000);
  $('when').textContent = mins > 1 ? 'Starts in ' + mins + ' minutes' : mins === 1 ? 'Starts in 1 minute' : mins === 0 ? 'Starting now' : 'Started ' + -mins + (mins === -1 ? ' minute ago' : ' minutes ago');
  $('title').textContent = ev.title;
  const len = Math.round((ev.end - ev.start) / 60000);
  $('meta').textContent = fmtTime(ev.start) + ' to ' + fmtTime(ev.end) + ' · ' + len + ' min';
}

const { calEvents } = await chrome.storage.local.get('calEvents');
ev = (calEvents || {})[eventId] || null;
if (!ev) window.close();
render();
setInterval(render, 15000);

$('focus').addEventListener('click', async () => {
  $('focus').disabled = true;
  await send('nudgeFocus', { eventId });
  window.close();
});
$('setup').addEventListener('click', async () => {
  await send('nudgePrepare', { eventId });
  window.close();
});
$('close').addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
$('focus').focus();
