// Draggable volume slider: pointer events with pointer capture, plus a visually
// hidden native range input so keyboard users get arrow keys for free.
export function mountVolume(root, value, onChange) {
  root.classList.add('vol');
  root.innerHTML = `
    <div class="vol-track">
      <div class="vol-rail"></div><div class="vol-fill"></div><div class="vol-knob"></div>
      <input class="sr-only" type="range" min="0" max="100" step="1" aria-label="Volume">
    </div>
    <span class="vol-val"></span>`;
  const track = root.querySelector('.vol-track');
  const fill = root.querySelector('.vol-fill');
  const knob = root.querySelector('.vol-knob');
  const range = root.querySelector('input');
  const out = root.querySelector('.vol-val');
  let v = value;

  const paint = () => {
    fill.style.width = v + '%';
    knob.style.left = v + '%';
    range.value = v;
    range.setAttribute('aria-valuetext', v + ' percent');
    out.textContent = v;
  };
  const set = (nv, commit) => {
    nv = Math.max(0, Math.min(100, Math.round(nv)));
    if (nv === v && !commit) return;
    v = nv;
    paint();
    onChange(v, !!commit);
  };
  const fromEvent = (e) => {
    const r = track.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  };

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    track.setPointerCapture(e.pointerId);
    range.focus({ preventScroll: true });
    set(fromEvent(e));
    e.preventDefault();
  });
  track.addEventListener('pointermove', (e) => {
    if (track.hasPointerCapture(e.pointerId)) set(fromEvent(e));
  });
  const release = (e) => {
    if (track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
      set(v, true);
    }
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  range.addEventListener('input', () => set(Number(range.value), true));

  paint();
  return { set: (nv) => { v = nv; paint(); } };
}
