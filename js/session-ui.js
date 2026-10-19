// In-session controls: timer with -5 / +5, music, Park a thought, Exit focus.
import { send, fmtClock, esc, SOUNDS } from './lib.js';

export function mountSession(el) {
  let session = null;
  let shortcut = 'Alt+P';
  chrome.commands.getAll().then((cmds) => {
    const c = cmds.find((x) => x.name === 'park-thought');
    if (c && c.shortcut) { shortcut = c.shortcut; render(); }
  });

  function clockText() {
    if (!session) return '00:00';
    if (session.phase !== 'working') return fmtClock(session.plannedMin * 60000);
    return fmtClock(session.endsAt - Date.now());
  }

  function render() {
    if (!session) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="s-sec">
        <span class="label">Your one task</span>
        <div class="s-task">${esc(session.task)}</div>
      </div>
      <div class="s-sec">
        <span class="label">Timer</span>
        <div class="s-timer">
          <span class="s-clock" aria-live="off">${clockText()}</span>
          <div class="s-adj">
            <button data-adj="-5" aria-label="Remove 5 minutes">−5 min</button>
            <button data-adj="5" aria-label="Add 5 minutes">+5 min</button>
          </div>
        </div>
        ${session.phase !== 'working' ? '<span class="s-phase">Waiting in the focus circle. The timer starts when you click it.</span>' : ''}
      </div>
      <div class="s-sec">
        <span class="label">Music</span>
        <div class="s-music" role="radiogroup" aria-label="Music">
          ${SOUNDS.map((s) => `<button role="radio" aria-checked="${s.id === session.sound}" data-sound="${s.id}"><span class="dot"></span>${esc(s.name)}</button>`).join('')}
        </div>
      </div>
      <div class="s-row">
        <button class="btn" data-act="park">Park a thought <kbd>${esc(shortcut)}</kbd></button>
        <button class="btn btn-primary" data-act="exit">Exit focus</button>
      </div>`;
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.adj) session = (await send('adjustTime', { deltaMin: Number(b.dataset.adj) })) || session;
    else if (b.dataset.sound) session = (await send('setSound', { sound: b.dataset.sound })) || session;
    else if (b.dataset.act === 'park') { send('openCapture'); return; }
    else if (b.dataset.act === 'exit') { send('endSession'); return; }
    const focusKey = b.dataset.adj ? `[data-adj="${b.dataset.adj}"]` : `[data-sound="${b.dataset.sound}"]`;
    render();
    const again = el.querySelector(focusKey);
    if (again) again.focus();
  });

  const tick = setInterval(() => {
    const c = el.querySelector('.s-clock');
    if (c) c.textContent = clockText();
  }, 1000);

  return {
    update(s) {
      const changed = !session || !s || session.sound !== s.sound || session.phase !== s.phase || session.task !== s.task;
      session = s;
      if (changed) render();
      else { const c = el.querySelector('.s-clock'); if (c) c.textContent = clockText(); }
    },
    destroy() { clearInterval(tick); }
  };
}
