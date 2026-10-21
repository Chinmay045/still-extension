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
  // The ring is inlined: a chrome-extension:// image on a web page fails with "Unsafe attempt
  // to load URL" whenever the extension has just been reloaded or updated under an open tab.
  const ringUrl = 'data:image/png;base64,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';

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
      // Extension reloaded or updated: this copy is orphaned, so take the pill down quietly.
      if (!chrome.runtime || !chrome.runtime.id) { session = null; render(); return; }
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
