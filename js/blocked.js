import { getAll, send } from './lib.js';

const $ = (id) => document.getElementById(id);
const url = (() => {
  const raw = location.hash.slice(1);
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
})();
let timer = null;

async function init() {
  const { session, settings } = await getAll();
  if (!session) {
    // Session ended while this tab was open: just go where the user meant to go.
    $('open').textContent = 'Continue to site';
    $('back').hidden = true;
    $('open').addEventListener('click', () => { if (url) location.replace(url); });
    return;
  }
  $('task').innerHTML = 'Your one task: <b></b>';
  $('task').querySelector('b').textContent = session.task;
  $('task').hidden = false;

  const res = url ? await send('blockedHit', { url }) : null;
  if (url) {
    $('note').textContent = 'Saved to your bucket for later · ' + url;
    $('note').title = url;
    $('note').hidden = false;
  }
  const n = res && res.impulses ? res.impulses : session.impulses;
  $('count').textContent = n + ' blocked this session';

  $('open').addEventListener('click', () => {
    if (timer) return;
    let left = settings.overrideWait;
    $('open').disabled = true;
    const tick = () => {
      $('over').textContent = 'Opening in ' + left + 's. Still time to change your mind.';
      $('open').textContent = 'Wait ' + left + 's';
      if (left-- <= 0) {
        clearInterval(timer);
        $('over').textContent = 'Opening once.';
        send('allowOnce', { url });
      }
    };
    tick();
    timer = setInterval(tick, 1000);
  });
}

$('back').addEventListener('click', async () => {
  if (timer) clearInterval(timer);
  const left = await send('returnToWork');
  if (left) return;
  if (history.length > 1) history.back();
  else {
    const tab = await chrome.tabs.getCurrent();
    chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
  }
});

$('park').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const t = $('park').value.trim();
  if (!t) return;
  await send('saveThought', { text: t, source: 'manual', quiet: true });
  $('park').value = '';
  $('parked-ok').textContent = 'Parked. It will be in your bucket.';
});

init();
