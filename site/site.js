const cfg = window.STILL_SITE || {};
const CHROME = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff" opacity=".25"/><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg>';

// Every "Add to Chrome" button points at the store, or says it's coming soon.
document.querySelectorAll('[data-add]').forEach((a) => {
  if (cfg.storeUrl) {
    a.href = cfg.storeUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = CHROME + 'Add to Chrome';
  } else {
    a.removeAttribute('href');
    a.classList.add('soon');
    a.setAttribute('aria-disabled', 'true');
    a.innerHTML = 'Coming soon to Chrome';
  }
});
document.querySelectorAll('[data-email]').forEach((el) => {
  if (!cfg.contactEmail) return;
  el.innerHTML = '';
  const a = document.createElement('a');
  a.href = 'mailto:' + cfg.contactEmail;
  a.textContent = cfg.contactEmail;
  el.appendChild(a);
});

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const typing = document.getElementById('typing');
if (typing) {
  const TASKS = ['Write the PRD for onboarding', 'Synthesize 8 user interviews', 'Prioritize the roadmap with RICE', 'Draft the launch plan', 'Finish the case study'];
  let i = 0, n = 0, deleting = false;
  if (reduced) {
    typing.textContent = TASKS[0];
    setInterval(() => { i = (i + 1) % TASKS.length; typing.textContent = TASKS[i]; }, 4000);
  } else {
    const step = () => {
      const word = TASKS[i];
      if (!deleting) {
        typing.textContent = word.slice(0, ++n);
        if (n === word.length) { deleting = true; return setTimeout(step, 1700); }
        return setTimeout(step, 55 + Math.random() * 40);
      }
      typing.textContent = word.slice(0, --n);
      if (n === 0) { deleting = false; i = (i + 1) % TASKS.length; return setTimeout(step, 350); }
      setTimeout(step, 28);
    };
    step();
  }
}

const vs = document.getElementById('vs');
const range = document.getElementById('vs-range');
if (vs && range) range.addEventListener('input', () => vs.style.setProperty('--split', range.value + '%'));
const toCompare = document.getElementById('to-compare');
if (toCompare) toCompare.addEventListener('click', () => {
  document.getElementById('compare').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  range.focus({ preventScroll: true });
});
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();

// The capture shortcut is Shift+Command+Space on Mac.
if (/Mac/.test(navigator.platform || navigator.userAgent)) {
  document.querySelectorAll('[data-mod]').forEach((k) => { k.textContent = '⌘'; });
}
