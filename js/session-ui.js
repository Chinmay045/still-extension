// In-session controls: timer with -5 / +5, music, Capture thought, Exit focus.
import { send, fmtClock, esc, SOUNDS, THEMES, CAPTURE_KEY } from './lib.js';
import { summarize, localOffset, SCORING } from './progress.js';

export function mountSession(el) {
  let session = null;
  let shortcut = CAPTURE_KEY;
  let progressText = '';
  // A quiet line under the timer: the streak, nothing more.
  const loadProgress = async () => {
    const { progress } = await chrome.storage.local.get('progress');
    const now = Date.now();
    const p = summarize(progress, now, localOffset(now));
    progressText = p.currentStreak
      ? p.currentStreak + '-day streak'
      : 'Finish ' + SCORING.minEligibleMinutes + ' minutes or more to start a streak';
    const el2 = el.querySelector('.s-progress');
    if (el2) el2.textContent = progressText;
  };
  loadProgress();
  const onStore = (c, area) => { if (area === 'local' && c.progress) loadProgress(); };
  chrome.storage.onChanged.addListener(onStore);
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
        <span class="s-progress">${esc(progressText)}</span>
      </div>
      <div class="s-sec">
        <span class="label">Music</span>
        <div class="s-music" role="radiogroup" aria-label="Music">
          ${SOUNDS.map((s) => `<button role="radio" aria-checked="${s.id === session.sound}" data-sound="${s.id}"><span class="dot"></span>${esc(s.name)}</button>`).join('')}
        </div>
      </div>
      <div class="s-sec">
        <span class="label">Focus circle</span>
        <div class="s-circles" role="radiogroup" aria-label="Focus circle">
          ${THEMES.map((t) => `<button role="radio" aria-checked="${t.id === session.theme}" data-theme="${t.id}" title="${esc(t.desc)}"><img src="assets/${t.id}-thumb.jpg" alt="">${esc(t.name)}</button>`).join('')}
          <button class="s-open" data-act="circle">Open circle</button>
        </div>
      </div>
      <div class="s-row">
        <button class="btn" data-act="park">Capture thought <kbd>${esc(shortcut)}</kbd></button>
        <button class="btn btn-primary" data-act="exit">Exit focus</button>
      </div>`;
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.adj) session = (await send('adjustTime', { deltaMin: Number(b.dataset.adj) })) || session;
    else if (b.dataset.sound) session = (await send('setSound', { sound: b.dataset.sound })) || session;
    else if (b.dataset.theme) session = (await send('setTheme', { theme: b.dataset.theme })) || session;
    else if (b.dataset.act === 'circle') { send('openCircle'); return; }
    else if (b.dataset.act === 'park') { send('openCapture'); return; }
    else if (b.dataset.act === 'exit') { send('endSession'); return; }
    const focusKey = b.dataset.adj ? `[data-adj="${b.dataset.adj}"]` : b.dataset.theme ? `[data-theme="${b.dataset.theme}"]` : `[data-sound="${b.dataset.sound}"]`;
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
      const changed = !session || !s || session.sound !== s.sound || session.theme !== s.theme || session.phase !== s.phase || session.task !== s.task;
      session = s;
      if (changed) render();
      else { const c = el.querySelector('.s-clock'); if (c) c.textContent = clockText(); }
    },
    destroy() { clearInterval(tick); chrome.storage.onChanged.removeListener(onStore); }
  };
}
