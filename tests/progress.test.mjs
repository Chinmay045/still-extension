// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORING, emptyProgress, scoreSession, applySession, summarize, dayKey, encouragement } from '../js/progress.js';

const IST = 330;          // India, UTC+5:30
const NY_SUMMER = -240;   // New York in daylight time
const MIN = 60000;
const at = (iso) => Date.parse(iso);

// A session whose timer started at `startIso` (UTC) and ran `min` minutes.
function sess(id, startIso, min, extra) {
  const startedAt = at(startIso);
  return Object.assign({ id, task: 'Write the PRD', phase: 'working', startedAt, endsAt: startedAt + min * MIN, plannedMin: min }, extra);
}

function run(list, offset = IST) {
  let p = emptyProgress();
  for (const [s, reason] of list) p = applySession(p, s, reason || 'timeup', offset).progress;
  return p;
}

test('points follow the minutes of a completed session', () => {
  assert.equal(scoreSession(sess('a', '2026-10-19T04:30:00Z', 25), 'timeup').points, 25);
  assert.equal(scoreSession(sess('b', '2026-10-19T04:30:00Z', 50), 'timeup').points, 50);
});

test('sessions under the minimum earn nothing and are not a focus day', () => {
  const short = scoreSession(sess('a', '2026-10-19T04:30:00Z', SCORING.minEligibleMinutes - 1), 'timeup');
  assert.equal(short.eligible, false);
  assert.equal(short.points, 0);
  const p = run([[sess('a', '2026-10-19T04:30:00Z', 9)]]);
  assert.equal(p.totalPoints, 0);
  assert.deepEqual(p.days, {});
  assert.equal(scoreSession(sess('b', '2026-10-19T04:30:00Z', 10), 'timeup').points, 10);
});

test('abandoned, replaced or never-started sessions earn nothing', () => {
  for (const reason of ['exit', 'replaced']) assert.equal(scoreSession(sess('a', '2026-10-19T04:30:00Z', 25), reason).points, 0);
  assert.equal(scoreSession({ id: 'c', phase: 'circle', startedAt: null, endsAt: null, plannedMin: 25 }, 'timeup').points, 0);
  const p = run([[sess('a', '2026-10-19T04:30:00Z', 25), 'exit']]);
  assert.equal(p.totalPoints, 0);
  assert.equal(p.awarded.length, 0);
});

test('trimming the timer mid-session earns the real length, not the plan', () => {
  // Planned 50, then cut down so the timer ended after 15 minutes.
  const s = sess('a', '2026-10-19T04:30:00Z', 15, { plannedMin: 15 });
  assert.equal(scoreSession(s, 'timeup').points, 15);
});

test('the same completion twice awards once', () => {
  let p = emptyProgress();
  const s = sess('dup', '2026-10-19T04:30:00Z', 25);
  const first = applySession(p, s, 'timeup', IST);
  const second = applySession(first.progress, s, 'timeup', IST);
  assert.equal(second.duplicate, true);
  assert.equal(second.progress.totalPoints, 25);
  assert.equal(second.progress.days['2026-10-19'].sessions, 1);
  // After a reload the stored object is all there is; still no double award.
  const reloaded = JSON.parse(JSON.stringify(second.progress));
  assert.equal(applySession(reloaded, s, 'timeup', IST).progress.totalPoints, 25);
});

test('points are never taken away', () => {
  const p = run([[sess('a', '2026-10-19T04:30:00Z', 25)], [sess('b', '2026-10-19T06:00:00Z', 25), 'exit'], [sess('c', '2026-10-19T07:00:00Z', 5)]]);
  assert.equal(p.totalPoints, 25);
});

test('daily and all-time totals', () => {
  const p = run([
    [sess('a', '2026-10-18T04:30:00Z', 25)],
    [sess('b', '2026-10-19T04:30:00Z', 25)],
    [sess('c', '2026-10-19T08:30:00Z', 50)]
  ]);
  const s = summarize(p, at('2026-10-19T12:00:00Z'), IST);
  assert.equal(s.totalPoints, 100);
  assert.equal(s.todayPoints, 75);
  assert.equal(s.focusDays, 2);
});

test('consecutive days build a streak; several sessions in one day count once', () => {
  const p = run([
    [sess('a', '2026-10-17T04:30:00Z', 25)],
    [sess('b', '2026-10-18T04:30:00Z', 25)],
    [sess('c', '2026-10-18T09:30:00Z', 25)],
    [sess('d', '2026-10-19T04:30:00Z', 25)]
  ]);
  const s = summarize(p, at('2026-10-19T12:00:00Z'), IST);
  assert.equal(s.currentStreak, 3);
  assert.equal(s.longestStreak, 3);
  assert.equal(s.focusDays, 3);
});

test('a streak waits through today and resets after a missed day, keeping the longest', () => {
  const p = run([[sess('a', '2026-10-16T04:30:00Z', 25)], [sess('b', '2026-10-17T04:30:00Z', 25)], [sess('c', '2026-10-18T04:30:00Z', 25)]]);
  const today = summarize(p, at('2026-10-19T12:00:00Z'), IST);
  assert.equal(today.currentStreak, 3);
  assert.equal(today.streakAtRisk, true);
  const dayAfter = summarize(p, at('2026-10-20T12:00:00Z'), IST);
  assert.equal(dayAfter.currentStreak, 0);
  assert.equal(dayAfter.longestStreak, 3);
  assert.match(encouragement(dayAfter), /fresh start/i);
  const p2 = run([[sess('a', '2026-10-16T04:30:00Z', 25)], [sess('b', '2026-10-17T04:30:00Z', 25)], [sess('c', '2026-10-18T04:30:00Z', 25)], [sess('d', '2026-10-20T04:30:00Z', 25)]]);
  const back = summarize(p2, at('2026-10-20T12:00:00Z'), IST);
  assert.equal(back.currentStreak, 1);
  assert.equal(back.longestStreak, 3);
});

test('a session across midnight counts for the day it started', () => {
  // 11:45 pm IST on Oct 18 to 12:10 am IST on Oct 19.
  const s = sess('late', '2026-10-18T18:15:00Z', 25);
  assert.equal(dayKey(s.startedAt, IST), '2026-10-18');
  const p = run([[sess('a', '2026-10-17T04:30:00Z', 25)], [s]]);
  assert.ok(p.days['2026-10-18']);
  assert.equal(p.days['2026-10-19'], undefined);
  // On Oct 19 the streak is 2 and waiting for today.
  assert.equal(summarize(p, at('2026-10-18T20:00:00Z'), IST).currentStreak, 2);
});

test('local midnight, not UTC midnight, splits the days', () => {
  // 1:00 am IST Oct 19 is still Oct 18 in UTC.
  assert.equal(dayKey(at('2026-10-18T19:30:00Z'), IST), '2026-10-19');
  assert.equal(dayKey(at('2026-10-18T19:30:00Z'), 0), '2026-10-18');
  // 8:30 pm in New York on Oct 18 is already Oct 19 in UTC.
  assert.equal(dayKey(at('2026-10-19T00:30:00Z'), NY_SUMMER), '2026-10-18');
});

test('stored days never move when the time zone changes', () => {
  // Earned in India, then the laptop moves to New York.
  const p = run([[sess('a', '2026-10-18T04:30:00Z', 25)], [sess('b', '2026-10-19T04:30:00Z', 25)]], IST);
  const ny = summarize(p, at('2026-10-19T14:00:00Z'), NY_SUMMER); // 10 am Oct 19 in New York
  assert.equal(ny.currentStreak, 2);
  assert.equal(ny.todayPoints, 25);
});

test('travelling west into "yesterday" does not break a streak', () => {
  // Sessions on Oct 18 and Oct 19 in India; then it is still Oct 18 evening in New York.
  const p = run([[sess('a', '2026-10-18T04:30:00Z', 25)], [sess('b', '2026-10-19T03:00:00Z', 25)]], IST);
  const s = summarize(p, at('2026-10-18T23:00:00Z'), NY_SUMMER); // 7 pm Oct 18 in New York
  assert.equal(s.currentStreak, 2);
  assert.equal(s.doneToday, true);
});

test('a daylight saving change keeps consecutive days consecutive', () => {
  // US clocks go back on 2026-11-01. Days are compared as dates, not 24-hour spans.
  const p = run([[sess('a', '2026-10-31T14:00:00Z', 25)], [sess('b', '2026-11-01T15:00:00Z', 25)]], NY_SUMMER);
  assert.equal(dayKey(at('2026-11-01T15:00:00Z'), -300), '2026-11-01');
  assert.equal(summarize(p, at('2026-11-01T20:00:00Z'), -300).currentStreak, 2);
});

test('weekly view has seven days ending today', () => {
  const p = run([[sess('a', '2026-10-19T04:30:00Z', 25)], [sess('b', '2026-10-14T04:30:00Z', 50)]]);
  const s = summarize(p, at('2026-10-19T12:00:00Z'), IST);
  assert.equal(s.week.length, 7);
  assert.equal(s.week[6].key, '2026-10-19');
  assert.equal(s.week[6].today, true);
  assert.equal(s.week[1].minutes, 50);
  assert.equal(s.weekMinutes, 75);
  assert.equal(s.weekDays, 2);
});

test('a brand-new user sees an honest first message', () => {
  const s = summarize(emptyProgress(), Date.now(), IST);
  assert.equal(s.currentStreak, 0);
  assert.match(encouragement(s), /first streak/);
});
