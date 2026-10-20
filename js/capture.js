import { send, esc, fmtWhen, KINDS } from './lib.js';

// The capture window is a small notes app on top of the same `parked` list the Bucket uses.
// Notes are plain text; the toolbar only adds line markers (☐ ☑ • 1.), so every other screen
// can show them as-is. Status: new | later | done | archived.

const $ = (id) => document.getElementById(id);
const text = $('text');
const MARK = { check: /^(☐|☑) /, bullet: /^• /, num: /^(\d+)\. / };
const ANY_MARK = /^(?:☐ |☑ |• |\d+\. )/;
let editId = null;
let original = '';
let items = [];
let undoTimer = null;
let lastDeleted = null;

// ---------- data ----------

async function mutate(fn) {
  const { parked } = await chrome.storage.local.get('parked');
  const next = fn((parked || []).slice());
  await chrome.storage.local.set({ parked: next });
}

async function load() {
  const { parked } = await chrome.storage.local.get('parked');
  items = (parked || []).filter((p) => p.status !== 'archived');
  $('count').textContent = items.filter((p) => p.status !== 'done').length;
  renderList();
}

function setStatus(id, status) {
  return mutate((parked) => parked.map((p) => {
    if (p.id !== id) return p;
    const q = Object.assign({}, p);
    if (status === 'done') { q.prev = p.status === 'later' ? 'later' : 'new'; q.status = 'done'; q.doneAt = Date.now(); }
    else if (status === 'undone') { q.status = p.prev || 'new'; delete q.prev; delete q.doneAt; }
    else q.status = status;
    return q;
  }));
}

async function remove(id) {
  lastDeleted = items.find((p) => p.id === id) || null;
  await mutate((parked) => parked.filter((p) => p.id !== id));
  $('undo-text').textContent = 'Note deleted.';
  $('undo').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { $('undo').hidden = true; lastDeleted = null; }, 6000);
}

async function undoDelete() {
  if (!lastDeleted) return;
  const item = lastDeleted;
  lastDeleted = null;
  $('undo').hidden = true;
  await mutate((parked) => parked.some((p) => p.id === item.id) ? parked : parked.concat(item));
}

// ---------- list ----------

function row(p) {
  const k = KINDS[p.kind] || KINDS.idea;
  const lines = p.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const done = p.status === 'done';
  const later = p.status === 'later';
  return `<li class="${done ? 'done' : ''}">
    <button class="check" data-act="${done ? 'undone' : 'done'}" data-id="${esc(p.id)}" aria-label="${done ? 'Mark as not done' : 'Strike off'}" title="${done ? 'Bring back' : 'Strike off'}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
    <button class="open" data-act="edit" data-id="${esc(p.id)}" title="Open and edit">
      <span class="t">${esc(lines[0] || '')}</span>
      ${lines[1] ? `<span class="p">${esc(lines.slice(1).join(' · '))}</span>` : ''}
      <span class="w"><span class="kind kind-${esc(p.kind)}">${k.label}</span>${esc(fmtWhen(p.createdAt))}${later ? ' · <span class="tag-later">Later</span>' : ''}</span>
    </button>
    <span class="acts">
      ${done ? '' : `<button class="act" data-act="${later ? 'new' : 'later'}" data-id="${esc(p.id)}" aria-pressed="${later}" aria-label="${later ? 'Remove from Later' : 'Keep for later'}" title="${later ? 'Remove from Later' : 'Keep for later'}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg></button>`}
      <button class="act del" data-act="delete" data-id="${esc(p.id)}" aria-label="Delete" title="Delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
    </span>
  </li>`;
}

function renderList() {
  const list = $('list');
  const open = items.filter((p) => p.status !== 'done').sort((a, b) => b.createdAt - a.createdAt);
  const done = items.filter((p) => p.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (!items.length) {
    list.innerHTML = '<li class="empty">No notes yet. Press + to write one.</li>';
    return;
  }
  list.innerHTML = open.map(row).join('')
    + (open.length ? '' : '<li class="empty">Everything is struck off.</li>')
    + (done.length ? `<li class="divider">Done · ${done.length}</li>` + done.map(row).join('') : '');
}

// ---------- editor ----------

function stamp(ts) {
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function showNote(item) {
  editId = item ? item.id : null;
  original = item ? item.text : '';
  text.value = original;
  if (!item) {
    const { captureDraft } = await chrome.storage.session.get('captureDraft');
    if (captureDraft) text.value = captureDraft;
  }
  $('title').textContent = item ? 'Edit note' : 'New note';
  $('stamp').textContent = stamp(item ? item.createdAt : Date.now());
  $('save').textContent = item ? 'Update' : 'Save';
  $('note').hidden = false;
  $('past-view').hidden = true;
  $('past').setAttribute('aria-pressed', 'false');
  text.focus();
  text.setSelectionRange(text.value.length, text.value.length);
}

function showList() {
  $('note').hidden = true;
  $('past-view').hidden = false;
  $('past').setAttribute('aria-pressed', 'true');
  $('title').textContent = 'Your notes';
  const first = document.querySelector('#list button');
  if (first) first.focus();
}

// Replaces a range through the editing pipeline so Ctrl+Z still works.
function replace(start, end, str) {
  text.focus();
  text.setSelectionRange(start, end);
  const ok = str ? document.execCommand('insertText', false, str) : start === end || document.execCommand('delete');
  if (!ok) text.setRangeText(str, start, end, 'end');
  text.setSelectionRange(start + str.length, start + str.length);
  draft();
}

function lineBounds(pos) {
  const v = text.value;
  const start = v.lastIndexOf('\n', pos - 1) + 1;
  let end = v.indexOf('\n', pos);
  if (end < 0) end = v.length;
  return { start, end };
}

// Toolbar: turns the selected lines into a checklist, bullets or numbers, or back to plain lines.
function format(kind) {
  const v = text.value;
  const s = text.selectionStart, e = text.selectionEnd;
  const start = lineBounds(s).start;
  const end = lineBounds(Math.max(s, e - (e > s && v[e - 1] === '\n' ? 1 : 0))).end;
  const lines = v.slice(start, end).split('\n');
  const all = lines.every((l) => MARK[kind].test(l));
  let n = 0;
  const out = lines.map((l) => {
    const bare = l.replace(ANY_MARK, '');
    if (all) return bare;
    if (kind === 'check') return '☐ ' + bare;
    if (kind === 'bullet') return '• ' + bare;
    n += 1;
    return n + '. ' + bare;
  }).join('\n');
  replace(start, end, out);
  if (lines.length === 1) text.setSelectionRange(start + out.length, start + out.length);
  else text.setSelectionRange(start, start + out.length);
}

// Enter continues a list like a notes app; Enter on an empty list line ends the list.
function onEnter(e) {
  const pos = text.selectionStart;
  if (pos !== text.selectionEnd) return;
  const { start, end } = lineBounds(pos);
  const line = text.value.slice(start, end);
  const m = line.match(ANY_MARK);
  if (!m) return;
  e.preventDefault();
  if (line.trim() === m[0].trim()) { replace(start, end, ''); return; }
  const num = line.match(MARK.num);
  const next = num ? (Number(num[1]) + 1) + '. ' : m[0].startsWith('☑') ? '☐ ' : m[0];
  replace(pos, pos, '\n' + next);
}

// Clicking the box at the start of a checklist line ticks it.
function onClick() {
  const pos = text.selectionStart;
  if (pos !== text.selectionEnd) return;
  const { start } = lineBounds(pos);
  const c = text.value[start];
  if ((c === '☐' || c === '☑') && pos - start <= 1) {
    replace(start, start + 1, c === '☐' ? '☑' : '☐');
    text.setSelectionRange(start + 2, start + 2);
  }
}

function draft() {
  if (!editId) chrome.storage.session.set({ captureDraft: text.value }).catch(() => {});
}

function clean(v) {
  return v.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, '')
    .split('\n').filter((l, i, a) => !(l.match(/^(?:☐|☑|•|\d+\.)$/) && i === a.length - 1)).join('\n');
}

async function save() {
  const t = clean(text.value);
  if (!t || t === original) { await discard(); return; }
  $('save').disabled = true;
  await send('saveThought', { text: t, id: editId, source: 'capture' });
  await chrome.storage.session.remove('captureDraft').catch(() => {});
  window.close();
}

async function discard() {
  if (!editId) await chrome.storage.session.remove('captureDraft').catch(() => {});
  window.close();
}

// ---------- events ----------

text.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); return; }
  if (e.key === 'Enter' && !e.shiftKey) onEnter(e);
});
text.addEventListener('input', draft);
text.addEventListener('click', onClick);
document.querySelectorAll('[data-fmt]').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => format(b.dataset.fmt));
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if ($('note').hidden) window.close();
  else save();
});
$('save').addEventListener('click', save);
$('discard').addEventListener('click', discard);
$('close').addEventListener('click', () => ($('note').hidden ? window.close() : save()));
$('new').addEventListener('click', () => showNote(null));
$('past').addEventListener('click', () => ($('past-view').hidden ? showList() : showNote(null)));
$('undo-btn').addEventListener('click', undoDelete);
$('list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  if (act === 'edit') showNote(items.find((p) => p.id === id));
  else if (act === 'delete') remove(id);
  else setStatus(id, act);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.parked) load();
});
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'capture-mode' && m.mode === 'list') showList();
});

await load();
if (location.hash === '#list') showList();
else await showNote(null);
