import { send, esc, fmtWhen, KINDS } from './lib.js';

const $ = (id) => document.getElementById(id);
const text = $('text');
let editId = null;
let items = [];

async function load() {
  const { parked } = await chrome.storage.local.get('parked');
  items = (parked || []).filter((p) => p.status !== 'archived').sort((a, b) => b.createdAt - a.createdAt);
  $('count').textContent = items.length;
  renderList();
}

function renderList() {
  const list = $('list');
  if (!items.length) {
    list.innerHTML = '<li class="empty">No thoughts parked yet.</li>';
    return;
  }
  list.innerHTML = items.map((p) => {
    const k = KINDS[p.kind] || KINDS.idea;
    return `<li><button data-id="${esc(p.id)}">
      <span class="t">${esc(p.text)}</span>
      <span class="kind kind-${esc(p.kind)}">${k.label}</span>
      <span class="w">${esc(fmtWhen(p.createdAt))}</span>
    </button></li>`;
  }).join('');
}

function showNote(item) {
  editId = item ? item.id : null;
  text.value = item ? item.text : '';
  $('title').textContent = item ? 'Edit thought' : 'Still capture';
  $('save').textContent = item ? 'Update' : 'Save';
  $('note').hidden = false;
  $('past-view').hidden = true;
  text.focus();
  text.setSelectionRange(text.value.length, text.value.length);
}

function showList() {
  $('note').hidden = true;
  $('past-view').hidden = false;
  $('title').textContent = 'Past thoughts';
  const first = document.querySelector('#list button');
  if (first) first.focus();
}

async function save() {
  const t = text.value.trim();
  if (!t) { window.close(); return; }
  $('save').disabled = true;
  await send('saveThought', { text: t, id: editId, source: 'capture' });
  window.close();
}

text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); window.close(); }
});
$('save').addEventListener('click', save);
$('close').addEventListener('click', () => window.close());
$('new').addEventListener('click', () => showNote(null));
$('past').addEventListener('click', () => ($('past-view').hidden ? showList() : showNote(null)));
$('list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (b) showNote(items.find((p) => p.id === b.dataset.id));
});
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'capture-mode' && m.mode === 'list') showList();
});

await load();
if (location.hash === '#list') showList();
else text.focus();
