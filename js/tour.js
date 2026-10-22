// The first-run tour: a short walk through each part of Still, using driver.js
// (bundled in js/vendor, since an extension can't load code from the web).
// It runs once after install and can be replayed from Settings.

// Each step names the view it lives on; the tour switches views as it goes.
const STEPS = [
  { view: 'setup', popover: { title: 'Welcome to Still', description: 'A one-minute look around. Use the arrow keys or the buttons, and press Esc to skip.' } },
  { view: 'setup', el: '#task', popover: { title: 'One thing at a time', description: 'Write the one task you want to focus on. You can leave it empty too.' } },
  { view: 'setup', el: '#len-seg', popover: { title: 'Pick a length', description: '10 or 15 minutes to start small, or Custom for longer.' } },
  { view: 'setup', el: '#themes', popover: { title: 'Your focus circle and sound', description: 'Pick what you look at while you focus. Sounds are right below it.' } },
  { view: 'setup', el: '#start', popover: { title: 'Start focus', description: 'The timer starts right away, and your blocked sites stay closed until it ends.' } },
  { view: 'block', el: '#block-now', popover: { title: 'Block now', description: 'Block your sites without a focus session. The end time shows next to the button.' } },
  { view: 'block', el: '#sites-card', popover: { title: 'Your blocked sites', description: 'Add the sites that pull you away. Opening one shows a calm block page instead.' } },
  { view: 'block', el: '#when-card', popover: { title: 'Block during calendar tasks', description: 'Connect Google Calendar and Still blocks your sites for each task, and nudges you before it starts.' } },
  { view: 'bucket', el: '#bucket-row', popover: { title: 'The Bucket', description: 'Park stray thoughts here so they stop nagging you. Press Alt+P on any tab to capture one fast.' } },
  { view: 'insights', el: '#insights', popover: { title: 'Insights', description: 'Your streak, focused time and how your days add up. One good session counts the day.' } },
  { view: 'settings', el: '[data-nav="settings"]', popover: { title: 'Settings', description: 'Calendar, notifications, and moving your data to another browser. You can replay this tour here too.' } },
  { view: 'setup', el: '.brand', popover: { title: "That's it", description: 'Click the logo anytime for the full story of how Still works. Now pick one thing and start.' } }
];

// Switch to a view, then let the page draw before the tour points at it.
function go(view, then) {
  const draw = () => requestAnimationFrame(() => requestAnimationFrame(then));
  if (location.hash.slice(1) === view) { draw(); return; }
  window.addEventListener('hashchange', draw, { once: true });
  location.hash = view;
}

export function startTour(onDone) {
  const lib = window.driver && window.driver.js;
  if (!lib) { if (onDone) onDone(); return; }
  let tour;
  const move = (dir) => {
    const i = tour.getActiveIndex() + dir;
    if (i < 0) return;
    if (i >= STEPS.length) { tour.destroy(); return; }
    go(STEPS[i].view, () => tour.moveTo(i));
  };
  tour = lib.driver({
    steps: STEPS.map((s) => ({ element: s.el, popover: s.popover })),
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Start using Still',
    popoverClass: 'still-tour',
    overlayColor: '#1D1D1F',
    overlayOpacity: 0.55,
    stagePadding: 8,
    stageRadius: 18,
    smoothScroll: true,
    onNextClick: () => move(1),
    onPrevClick: () => move(-1),
    onDestroyed: () => {
      if (location.hash.slice(1) !== 'setup') location.hash = 'setup';
      if (onDone) onDone();
    }
  });
  go(STEPS[0].view, () => tour.drive());
}
