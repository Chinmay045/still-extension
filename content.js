// Still floating control: a small timer pill on every page during a session.
// Clicking it opens the in-session dropdown. Lives in a closed shadow root so
// page styles cannot reach it.
(() => {
  if (window.top !== window || window.__stillLoaded) return;
  window.__stillLoaded = true;

  const SOUNDS = [
    ['ambient', 'Ambient instrumental'],
    ['gamma', 'Gamma 40 Hz binaural'],
    ['beta', 'Beta pulse music'],
    ['cafe', 'Cafe murmur'],
    ['off', 'Silence']
  ];
  const ringUrl = chrome.runtime.getURL('assets/ring.png');

  let session = null;
  let open = false;
  let host = null, root = null, tick = null;

  const css = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; }
    .wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
    button { font: inherit; cursor: pointer; }
    button:focus { outline: none; }
    button:focus-visible { box-shadow: 0 0 0 2px #17151C, 0 0 0 4px #B98BFF; }
    .pill { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 8px; border: 0; border-radius: 999px;
      background: rgba(23,21,28,0.97); color: #FFFFFF; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
      box-shadow: 0 8px 24px rgba(0,0,0,.25); }
    .pill img { width: 24px; height: 24px; }
    .panel { width: 300px; padding: 16px; border-radius: 18px; background: rgba(23,21,28,0.97); color: #FFFFFF;
      box-shadow: 0 18px 48px rgba(0,0,0,.35); display: flex; flex-direction: column; gap: 14px; }
    .label { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.5); }
    .task { font-family: 'Inter Tight', -apple-system, 'Segoe UI', sans-serif; font-size: 16px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.3; margin-top: 4px; }
    .timer { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
    .clock { font-family: 'Inter Tight', -apple-system, 'Segoe UI', sans-serif; font-size: 34px; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .adj { display: flex; gap: 6px; }
    .adj button { height: 32px; padding: 0 11px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: transparent; color: #FFFFFF; font-size: 12.5px; font-weight: 600; }
    .adj button:hover { background: rgba(255,255,255,.08); }
    .music { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
    .music button { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: rgba(255,255,255,.75); font-size: 13px; text-align: left; }
    .music button:hover { background: rgba(255,255,255,.06); }
    .music button[aria-checked="true"] { background: rgba(155,77,245,.22); color: #FFFFFF; font-weight: 600; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.25); }
    .music button[aria-checked="true"] .dot { background: linear-gradient(90deg,#8B3DFF,#D63DD0); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .row button { height: 40px; border-radius: 999px; font-size: 13px; font-weight: 600; }
    .park { border: 1px solid rgba(255,255,255,.18); background: transparent; color: #FFFFFF; }
    .park:hover { background: rgba(255,255,255,.08); }
    .exit { border: 0; background: linear-gradient(90deg,#8B3DFF 0%,#D63DD0 100%); color: #FFFFFF; }
    .note { font-size: 12px; color: rgba(255,255,255,.5); }
    .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483647; padding: 12px 18px; border-radius: 999px;
      background: rgba(23,21,28,0.97); color: #FFFFFF; font-size: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;

  function ensureHost() {
    if (host) return;
    host = document.createElement('still-focus');
    root = host.attachShadow({ mode: 'closed' });
    document.documentElement.appendChild(host);
  }

  function fmt(ms) {
    const t = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function clock() {
    if (!session) return '00:00';
    return session.phase === 'working' ? fmt(session.endsAt - Date.now()) : fmt(session.plannedMin * 60000);
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function render(focusSel) {
    if (!session) {
      clearInterval(tick); tick = null;
      if (host) { host.remove(); host = null; root = null; }
      return;
    }
    ensureHost();
    root.innerHTML = `<style>${css}</style>
      <div class="wrap">
        ${open ? `
        <div class="panel" role="dialog" aria-label="Still session">
          <div><div class="label">Your one task</div><div class="task">${escHtml(session.task)}</div></div>
          <div><div class="label">Timer</div>
            <div class="timer"><span class="clock">${clock()}</span>
              <div class="adj"><button data-adj="-5" aria-label="Remove 5 minutes">−5 min</button><button data-adj="5" aria-label="Add 5 minutes">+5 min</button></div>
            </div>
            ${session.phase !== 'working' ? '<div class="note">Starts when you click the focus circle.</div>' : ''}
          </div>
          <div><div class="label">Music</div>
            <div class="music" role="radiogroup" aria-label="Music">
              ${SOUNDS.map(([id, name]) => `<button role="radio" aria-checked="${id === session.sound}" data-sound="${id}"><span class="dot"></span>${name}</button>`).join('')}
            </div>
          </div>
          <div class="row"><button class="park" data-act="park">Capture thought</button><button class="exit" data-act="exit">Exit focus</button></div>
          <div class="note">Alt+P parks a thought from any tab.</div>
        </div>` : ''}
        <button class="pill" data-act="toggle" aria-expanded="${open}" aria-label="Still session, ${clock()} left"><img src="${ringUrl}" alt=""><span class="pclock">${clock()}</span></button>
      </div>`;
    if (focusSel) { const el = root.querySelector(focusSel); if (el) el.focus(); }
    if (!tick) tick = setInterval(() => {
      if (!root) return;
      root.querySelectorAll('.clock, .pclock').forEach((n) => { n.textContent = clock(); });
    }, 1000);
  }

  function send(type, data) {
    return chrome.runtime.sendMessage(Object.assign({ type }, data || {})).catch(() => null);
  }

  document.addEventListener('click', () => { if (open) { open = false; render(); } });

  function onClick(e) {
    const path = e.composedPath();
    const b = path.find((n) => n.tagName === 'BUTTON');
    e.stopPropagation();
    if (!b) return;
    if (b.dataset.act === 'toggle') { open = !open; render('[data-act="toggle"]'); return; }
    if (b.dataset.act === 'park') { send('openCapture'); open = false; render(); return; }
    if (b.dataset.act === 'exit') { send('endSession'); return; }
    if (b.dataset.adj) send('adjustTime', { deltaMin: Number(b.dataset.adj) });
    if (b.dataset.sound) send('setSound', { sound: b.dataset.sound });
    render(b.dataset.adj ? `[data-adj="${b.dataset.adj}"]` : `[data-sound="${b.dataset.sound}"]`);
  }

  function attach() {
    if (host && !host.__still) {
      host.__still = true;
      // Listen on the shadow root: a closed root hides its nodes from listeners outside it.
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { open = false; render('[data-act="toggle"]'); } });
    }
  }

  function showToast(text) {
    ensureHost();
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = text;
    if (!root.querySelector('style')) root.innerHTML = `<style>${css}</style>`;
    root.appendChild(t);
    setTimeout(() => { t.remove(); if (!session) render(); }, 2200);
  }

  chrome.storage.local.get('session').then((r) => { session = r.session || null; render(); attach(); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'local' || !c.session) return;
    session = c.session.newValue || null;
    if (!session) open = false;
    const active = root && root.activeElement;
    const sel = active && active.dataset ? (active.dataset.adj ? `[data-adj="${active.dataset.adj}"]` : active.dataset.sound ? `[data-sound="${active.dataset.sound}"]` : active.dataset.act ? `[data-act="${active.dataset.act}"]` : null) : null;
    render(sel);
    attach();
  });
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (m && m.type === 'still-toast') { showToast(m.text); attach(); reply(true); }
  });
})();
