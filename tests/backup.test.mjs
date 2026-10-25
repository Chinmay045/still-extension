// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, applySession, localOffset } from '../js/progress.js';
import { makeBackup, readBackup, mergeBackup } from '../js/backup.js';

const MIN = 60000;
const sess = (id, iso, min) => { const startedAt = Date.parse(iso); return { id, task: 'T', phase: 'working', startedAt, endsAt: startedAt + min * MIN, plannedMin: min }; };
const entry = (s, r) => ({ task: s.task, minutesFocused: r.minutes, endedAt: s.endsAt, reason: 'timeup', sessionId: s.id, points: r.points, eligible: r.eligible, scoredMinutes: r.minutes });

// One browser's stored state after running these sessions.
function browser(list, extra) {
  let progress = emptyProgress(); const history = [];
  for (const s of list) { const o = applySession(progress, s, 'timeup', localOffset(s.startedAt)); progress = o.progress; history.push(entry(s, o.result)); }
  return Object.assign({ progress, history, parked: [], settings: { sites: ['youtube.com'] }, firstUsed: list.length ? list[0].startedAt : 0 }, extra);
}
const roundTrip = (stored) => readBackup(JSON.stringify(makeBackup(stored, 1)));

test('importing another browser adds its sessions, points and thoughts', () => {
  const chrome = browser([sess('a', '2026-10-19T04:30:00Z', 15)], { parked: [{ id: 'p1', text: 'x', createdAt: 1 }] });
  const comet = browser([sess('b', '2026-10-21T04:30:00Z', 10)], { parked: [{ id: 'p2', text: 'y', createdAt: 2 }], settings: { sites: ['reddit.com'] } });
  const { values, added } = mergeBackup(comet, roundTrip(chrome));
  assert.equal(values.progress.totalPoints, 25);
  assert.equal(values.history.length, 2);
  assert.equal(values.parked.length, 2);
  assert.deepEqual(values.settings.sites, ['reddit.com', 'youtube.com']);
  assert.equal(values.firstUsed, chrome.firstUsed);
  assert.deepEqual(added, { sessions: 1, thoughts: 1, sites: 1 });
});

test('importing the same file twice changes nothing', () => {
  const chrome = browser([sess('a', '2026-10-19T04:30:00Z', 15)]);
  const comet = browser([sess('b', '2026-10-19T08:30:00Z', 10)]);
  const once = mergeBackup(comet, roundTrip(chrome)).values;
  const twice = mergeBackup(once, roundTrip(chrome));
  assert.equal(twice.values.progress.totalPoints, 25);
  assert.equal(twice.values.progress.days['2026-10-19'].sessions, 2);
  assert.deepEqual(twice.added, { sessions: 0, thoughts: 0, sites: 0 });
});

test('exporting back after an import does not double count shared sessions', () => {
  const chrome = browser([sess('a', '2026-10-19T04:30:00Z', 15)]);
  const comet = browser([sess('b', '2026-10-19T08:30:00Z', 10)]);
  const merged = mergeBackup(comet, roundTrip(chrome)).values;
  // Chrome then does one more session and imports Comet's merged backup.
  const chrome2 = browser([sess('a', '2026-10-19T04:30:00Z', 15), sess('c', '2026-10-20T04:30:00Z', 20)]);
  const back = mergeBackup(chrome2, roundTrip(merged)).values;
  assert.equal(back.progress.totalPoints, 45);
  assert.equal(back.progress.days['2026-10-19'].points, 25);
});

test('the file never carries install-specific settings and junk is refused', () => {
  const b = makeBackup({ settings: { sites: [], googleClientId: 'x', walletApi: 'y' } }, 1);
  assert.equal(b.data.settings.googleClientId, undefined);
  assert.equal(b.data.settings.walletApi, undefined);
  assert.equal(readBackup('{"hello":1}'), null);
  assert.equal(readBackup('not json'), null);
});

test('broken pledges merge by id and a payment on either side wins', () => {
  const cur = { fines: [{ id: 'a', amount: 50, paid: false }, { id: 'b', amount: 20, paid: true, ref: 'R1' }] };
  const inc = { fines: [{ id: 'a', amount: 50, paid: true, ref: 'R2', paidAt: 5 }, { id: 'c', amount: 100, paid: false }] };
  const { values } = mergeBackup(cur, inc);
  assert.deepEqual(values.fines.map((f) => [f.id, f.paid]), [['a', true], ['b', true], ['c', false]]);
  assert.equal(values.fines[0].ref, 'R2');
  const again = mergeBackup(values, inc).values;
  assert.equal(again.fines.length, 3);
});
