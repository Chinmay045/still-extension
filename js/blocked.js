import { getAll, send, fmtTime, rupees, pledgeArmed } from './lib.js';

const $ = (id) => document.getElementById(id);
const url = (() => {
  const raw = location.hash.slice(1);
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
})();
let timer = null;

async function init() {
  const { block, settings, wallet } = await getAll();
  if (!block) {
    // The calendar task ended while this tab was open: just go where the user meant to go.
    $('open').textContent = 'Continue to site';
    $('back').hidden = true;
    $('open').addEventListener('click', () => { if (url) location.replace(url); });
    return;
  }
  $('task').innerHTML = 'Your task right now: <b></b> · until ' + fmtTime(block.end);
  $('task').querySelector('b').textContent = block.title;
  $('task').hidden = false;

  const res = url ? await send('blockedHit', { url }) : null;
  if (url) {
    $('note').textContent = 'Saved to your bucket for later · ' + url;
    $('note').title = url;
    $('note').hidden = false;
  }
  const n = res && res.impulses ? res.impulses : block.impulses;
  $('count').textContent = n + ' blocked during this task';

  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'this site'; } })();
  if (pledgeArmed(block)) {
    const amt = rupees(block.pledge * 100);
    $('stake-title').textContent = amt + ' is on the line for this task';
    $('stake-sub').textContent = 'Stay with it until ' + fmtTime(block.end) + ' and it stays in your wallet.';
    $('stake-amt').textContent = amt;
    $('stake').hidden = false;
    $('open').textContent = 'Break the task';
    $('open').addEventListener('click', () => showConfirm(block, wallet, host));
    return;
  }
  if (block.forfeited) {
    $('stake-title').textContent = 'You broke this task earlier';
    $('stake-sub').textContent = rupees(block.pledge * 100) + ' left your wallet for ' + block.charity + '. Nothing more is taken for this task.';
    $('stake-amt').textContent = '−' + rupees(block.pledge * 100);
    $('stake').hidden = false;
  }

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

// The warning step before any money moves: what leaves, what's left, where it goes.
// The take button unlocks after a few seconds so a reflex click can't spend money.
function showConfirm(block, wallet, host) {
  const amt = rupees(block.pledge * 100);
  $('confirm-h').textContent = 'Break "' + block.title + '" and lose ' + amt + '?';
  const after = Math.max(0, wallet.balancePaise - block.pledge * 100);
  const rows = [
    ['Leaves your wallet', amt],
    ['Balance after', rupees(after)],
    ['Set aside for', block.charity || 'charity'],
    ['Then opens', host + ', once']
  ];
  $('confirm-list').innerHTML = '';
  rows.forEach(([k, v]) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><b></b>';
    li.firstChild.textContent = k;
    li.lastChild.textContent = v;
    $('confirm-list').appendChild(li);
  });
  // The confirm card replaces everything below the task line so it fits on one screen.
  ['stake', 'note', 'count'].forEach((id) => { $(id).hidden = true; });
  document.querySelector('.row').hidden = true;
  document.querySelector('.actions').hidden = true;
  $('confirm').hidden = false;
  $('keep').focus();
  let left = 5;
  const lose = $('lose');
  const tick = () => {
    lose.textContent = left > 0 ? 'Take ' + amt + ' and open (' + left + ')' : 'Take ' + amt + ' and open';
    lose.disabled = left > 0;
    if (left-- <= 0) clearInterval(timer);
  };
  tick();
  timer = setInterval(tick, 1000);
  lose.onclick = async () => {
    lose.disabled = true;
    $('keep').disabled = true;
    lose.textContent = 'Taking ' + amt + '…';
    $('lose-err').hidden = true;
    const res = await send('breakTask', { url });
    if (res && res.ok) {
      $('over').textContent = amt + ' taken. Opening ' + host + '.';
      return;
    }
    $('keep').disabled = false;
    lose.disabled = false;
    lose.textContent = 'Try again';
    $('lose-err').textContent = res && res.code === 'insufficient'
      ? 'Your wallet is too low for this pledge. Top it up, or head back to work.'
      : 'Could not reach your wallet (' + ((res && res.error) || 'no answer') + '). Nothing was taken.';
    $('lose-err').hidden = false;
  };
}

$('keep').addEventListener('click', () => $('back').click());

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
