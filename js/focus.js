import { getAll, send, SOUNDS } from './lib.js';

const { session, settings } = await getAll();
if (!session) {
  location.replace('home.html');
} else {
  document.getElementById('task').textContent = session.task;
  document.getElementById('img').src = 'assets/' + session.theme + '.jpg';
  const sound = SOUNDS.find((s) => s.id === session.sound);
  document.getElementById('meta').textContent = session.plannedMin + ' min · ' + (sound ? sound.name : 'Silence') + ' · ' + session.blocked.length + ' sites blocked';
  if (settings.nightDim && new Date().getHours() >= 21) document.body.classList.add('dim');
  const circle = document.getElementById('circle');
  const begin = async () => {
    if (circle.disabled) return;
    circle.disabled = true;
    await send('beginWork');
  };
  circle.addEventListener('click', begin);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) { e.preventDefault(); begin(); }
  });
}

chrome.storage.onChanged.addListener((c) => {
  if (c.session && !c.session.newValue) location.replace('home.html#summary');
});
