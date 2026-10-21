// Points and streaks. Pure functions only: no chrome.* calls and no DOM, so the
// service worker, every page and the tests share exactly the same rules.
//
// The source of truth is the `progress` object in chrome.storage.local:
//   { v: 1, totalPoints, days: { 'YYYY-MM-DD': { points, minutes, sessions } }, awarded: [sessionId...], last }
// Only background.js writes it, once per completed session, keyed by session id.

// Scoring rules. Change these and nothing else to retune the system.
export const SCORING = {
  pointsPerMinute: 1,       // a 15-minute session earns 15 points
  minEligibleMinutes: 10,   // shorter completed sessions earn nothing and don't count as a focus day
  maxMinutesPerSession: 240,
  rememberAwarded: 500      // how many session ids to keep for duplicate protection
};

export function emptyProgress() {
  return { v: 1, totalPoints: 0, days: {}, awarded: [], last: null };
}

// Minutes east of UTC for the device's time zone at that moment (IST is 330).
export function localOffset(ts) {
  return -new Date(ts).getTimezoneOffset();
}

// The local calendar date for a moment, as YYYY-MM-DD, given that moment's UTC offset.
export function dayKey(ts, offsetMin) {
  return new Date(ts + offsetMin * 60000).toISOString().slice(0, 10);
}

// Whole days since 1970 for a YYYY-MM-DD key. Calendar maths on keys, never on
// timestamps, so DST's 23- and 25-hour days can't shift a streak.
export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function keyFromNumber(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

// Points for a finished session. Only a session whose timer ran out earns anything,
// and it earns for the minutes it actually ran, so trimming the timer down mid-session
// can't keep the original length's points.
export function scoreSession(session, reason, rules = SCORING) {
  if (reason !== 'timeup' || !session || session.phase !== 'working' || !session.startedAt || !session.endsAt) {
    return { eligible: false, minutes: 0, points: 0, why: 'not-completed' };
  }
  const minutes = Math.min(rules.maxMinutesPerSession, Math.max(0, Math.round((session.endsAt - session.startedAt) / 60000)));
  if (minutes < rules.minEligibleMinutes) return { eligible: false, minutes, points: 0, why: 'too-short' };
  return { eligible: true, minutes, points: Math.round(minutes * rules.pointsPerMinute), why: 'ok' };
}

// Applies one finished session to progress. Returns a new object; never mutates the input.
// The day is the local date the timer started, fixed at award time: a session from
// 11:40 pm to 12:05 am counts for the evening you sat down, and moving time zones
// later never rewrites a past day.
export function applySession(progress, session, reason, offsetMin, rules = SCORING) {
  const p = progress && progress.v === 1 ? progress : emptyProgress();
  if (!session || !session.id) return { progress: p, result: null, duplicate: false };
  if (p.awarded.includes(session.id)) return { progress: p, result: p.last && p.last.sessionId === session.id ? p.last : null, duplicate: true };
  const score = scoreSession(session, reason, rules);
  const key = session.startedAt ? dayKey(session.startedAt, offsetMin) : null;
  const result = { sessionId: session.id, task: session.task || '', eligible: score.eligible, points: score.points, minutes: score.minutes, why: score.why, day: key };
  // Abandoned sessions change nothing, so they aren't remembered either.
  if (reason !== 'timeup') return { progress: p, result, duplicate: false };
  const days = Object.assign({}, p.days);
  if (score.eligible) {
    const d = days[key] || { points: 0, minutes: 0, sessions: 0 };
    days[key] = { points: d.points + score.points, minutes: d.minutes + score.minutes, sessions: d.sessions + 1 };
  }
  const next = {
    v: 1,
    totalPoints: p.totalPoints + score.points,
    days,
    awarded: p.awarded.concat(session.id).slice(-rules.rememberAwarded),
    last: result
  };
  return { progress: next, result, duplicate: false };
}

// Everything the screens show, derived from stored days. Today is the device's
// current local date; a streak stays alive through today until today is over.
export function summarize(progress, now, offsetMin) {
  const p = progress && progress.v === 1 ? progress : emptyProgress();
  const today = dayNumber(dayKey(now, offsetMin));
  const nums = Object.keys(p.days).filter((k) => p.days[k].points > 0).map(dayNumber).sort((a, b) => a - b);
  const set = new Set(nums);

  let longest = 0, run = 0, prev = null;
  for (const n of nums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = n;
  }

  // A future-dated day (clock or zone moved backwards) still counts toward the streak
  // that reaches it, so travelling west can't break a streak.
  let anchor = today;
  while (set.has(anchor + 1)) anchor += 1;
  if (!set.has(anchor)) anchor = set.has(today - 1) ? today - 1 : null;
  let current = 0;
  if (anchor !== null) for (let n = anchor; set.has(n); n -= 1) current += 1;

  const todayKey = keyFromNumber(today);
  const week = [];
  for (let n = today - 6; n <= today; n += 1) {
    const k = keyFromNumber(n);
    const d = p.days[k] || { points: 0, minutes: 0, sessions: 0 };
    week.push({ key: k, points: d.points, minutes: d.minutes, sessions: d.sessions, today: n === today });
  }

  return {
    totalPoints: p.totalPoints,
    todayPoints: (p.days[todayKey] || { points: 0 }).points,
    currentStreak: current,
    longestStreak: longest,
    focusDays: nums.length,
    doneToday: set.has(today) || (anchor !== null && anchor > today),
    // True when yesterday counted but today hasn't yet: the streak is waiting, not lost.
    streakAtRisk: current > 0 && !set.has(today) && anchor === today - 1,
    week,
    weekMinutes: week.reduce((n, d) => n + d.minutes, 0),
    weekDays: week.filter((d) => d.points > 0).length,
    hadStreakBefore: longest > 0 && current === 0
  };
}

// One short, honest line about progress, built only from real numbers.
export function encouragement(s) {
  if (!s.focusDays) return 'Finish one session of ' + SCORING.minEligibleMinutes + ' minutes or more to start your first streak.';
  if (s.doneToday && s.currentStreak > 1 && s.currentStreak === s.longestStreak) return 'Day ' + s.currentStreak + ' in a row, your longest yet.';
  if (s.doneToday && s.currentStreak > 1) return s.currentStreak + ' days in a row. Your longest is ' + s.longestStreak + '.';
  if (s.doneToday) return 'Today counts. Come back tomorrow to make it two days in a row.';
  if (s.streakAtRisk) return 'One session today keeps your ' + s.currentStreak + '-day streak going.';
  if (s.hadStreakBefore) return 'A fresh start. One session today begins a new streak. Your best so far is ' + s.longestStreak + (s.longestStreak === 1 ? ' day.' : ' days.');
  return 'One session today starts a streak.';
}
