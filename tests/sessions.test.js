// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    splitHms,
    replaceUnit,
    UNIT_MAX,
    formatDuration,
    dayKey,
    dayLabel,
    totalsByDay,
    sessionDurationMs,
    monthOf,
    addMonths,
    monthRange,
    monthGrid,
    shadeLevel,
    buildManualEntry,
    startedAtForElapsed,
    rowsOfDay,
    rowsTotalMs,
    activeMsNow,
    pausedMsNow,
    snapshotSession,
    restoreSnapshot,
} from '../src/scripts/sessions.js';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 11, 5, 15, 0);

test('splitHms and replaceUnit change one field and keep the other two', () => {
    const ms = (3 * 3600 + 25 * 60 + 40) * 1000;
    assert.deepEqual(splitHms(ms), { h: 3, m: 25, s: 40 });
    assert.equal(replaceUnit(ms, 'h', 1), (1 * 3600 + 25 * 60 + 40) * 1000);
    assert.equal(replaceUnit(ms, 'm', 59), (3 * 3600 + 59 * 60 + 40) * 1000);
    assert.equal(replaceUnit(ms, 's', 0), (3 * 3600 + 25 * 60) * 1000);
});

test('minutes and seconds top out at 59, hours at 999', () => {
    assert.deepEqual(UNIT_MAX, { h: 999, m: 59, s: 59 });
});

test('formatDuration drops seconds, pads minutes and omits a zero hour', () => {
    assert.equal(formatDuration(0), '0m');
    assert.equal(formatDuration(9 * 60000 + 59000), '9m');
    assert.equal(formatDuration(60 * 60000), '1h 00m');
    assert.equal(formatDuration(3 * 3600000 + 5 * 60000 + 59000), '3h 05m');
});

test('dayLabel names today and yesterday, otherwise a short date', () => {
    assert.equal(dayLabel(dayKey(NOW), NOW), 'Today');
    assert.equal(dayLabel(dayKey(at(2026, 11, 4)), NOW), 'Yesterday');
    assert.match(dayLabel('2026-10-27', NOW), /Oct/);
});

test('sessionDurationMs falls back to the time range when activeMs is missing', () => {
    assert.equal(sessionDurationMs({ startedAt: 1000, endedAt: 61000 }), 60000);
    assert.equal(sessionDurationMs({ startedAt: 1000, endedAt: 61000, activeMs: 5000 }), 5000);
});

test('totalsByDay sums per local day', () => {
    const totals = totalsByDay([
        { startedAt: at(2026, 11, 4, 9), activeMs: 3600000 },
        { startedAt: at(2026, 11, 4, 13), activeMs: 7200000 },
        { startedAt: at(2026, 11, 5, 9), activeMs: 1800000 },
    ]);
    assert.equal(totals.get('2026-11-04'), 3 * 3600000);
    assert.equal(totals.get('2026-11-05'), 1800000);
    assert.equal(totals.get('2026-11-06'), undefined);
});

test('month cursor moves across year boundaries and gives a half-open range', () => {
    assert.deepEqual(monthOf(NOW), { year: 2026, month: 10 });
    assert.deepEqual(addMonths({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
    assert.deepEqual(addMonths({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
    const { since, until } = monthRange({ year: 2026, month: 10 });
    assert.equal(since, at(2026, 11, 1));
    assert.equal(until, at(2026, 12, 1));
});

test('monthGrid is whole Monday-first weeks padded with nulls', () => {
    // November 2026 starts on a Sunday, so Monday-first needs 6 blanks before the 1st.
    const nov = monthGrid({ year: 2026, month: 10 });
    assert.equal(nov.length % 7, 0);
    assert.equal(nov.slice(0, 6).every((c) => c === null), true);
    assert.equal(nov[6], '2026-11-01');
    assert.equal(nov.filter(Boolean).length, 30);
    // February 2027 starts on a Monday and has 28 days: exactly four full rows, no padding.
    const feb = monthGrid({ year: 2027, month: 1 });
    assert.equal(feb.length, 28);
    assert.equal(feb[0], '2027-02-01');
});

test('shadeLevel scales a day against the busiest one', () => {
    assert.equal(shadeLevel(0, 100), 0);
    assert.equal(shadeLevel(100, 0), 0);
    assert.equal(shadeLevel(100, 100), 38);
    assert.equal(shadeLevel(1, 100), 10);
    assert.ok(shadeLevel(50, 100) > 10 && shadeLevel(50, 100) < 38);
});

test('buildManualEntry builds a manual session', () => {
    const { session, error } = buildManualEntry(
        { date: '2026-11-04', start: '09:00', stop: '11:30', note: '  Invoices ' },
        NOW,
    );
    assert.equal(error, undefined);
    assert.equal(session.startedAt, at(2026, 11, 4, 9));
    assert.equal(session.endedAt, at(2026, 11, 4, 11, 30));
    assert.equal(session.activeMs, 150 * 60000);
    assert.equal(session.manual, true);
    assert.equal(session.note, 'Invoices');
});

test('buildManualEntry rejects bad input with a message', () => {
    assert.match(buildManualEntry({ date: '', start: '09:00', stop: '10:00' }, NOW).error, /Fill in/);
    assert.match(buildManualEntry({ date: '2026-11-04', start: '10:00', stop: '09:00' }, NOW).error, /after start/);
    assert.match(buildManualEntry({ date: '2026-11-04', start: '10:00', stop: '10:00' }, NOW).error, /after start/);
    assert.match(buildManualEntry({ date: '2026-11-05', start: '16:00', stop: '17:00' }, NOW).error, /future/);
    // Started already, but the stop time has not happened yet.
    assert.match(buildManualEntry({ date: '2026-11-05', start: '14:00', stop: '16:00' }, NOW).error, /future/);
});

test('totalsByDay and rowsTotalMs count the running session at its live value, not its saved heartbeat', () => {
    const rows = [
        { id: 'old', startedAt: at(2026, 11, 5, 8), activeMs: 600000 },
        { id: 'live', startedAt: at(2026, 11, 5, 9), activeMs: 60000 },
        { id: 'other-day', startedAt: at(2026, 11, 4, 9), activeMs: 120000 },
    ];
    const live = { id: 'live', ms: 900000 };
    assert.equal(totalsByDay(rows, live).get('2026-11-05'), 600000 + 900000);
    assert.equal(totalsByDay(rows, live).get('2026-11-04'), 120000);
    // Without live info the saved value is used, and a live id that is not in the rows changes nothing.
    assert.equal(totalsByDay(rows).get('2026-11-05'), 660000);
    assert.equal(totalsByDay(rows, { id: 'missing', ms: 5 }).get('2026-11-05'), 660000);
    assert.equal(rowsTotalMs(rows.slice(0, 2), live), 1500000);
    assert.equal(rowsTotalMs([], live), 0);
});

test('rowsOfDay keeps only that local day, newest first', () => {
    const rows = [
        { id: 'a', startedAt: at(2026, 11, 5, 8) },
        { id: 'b', startedAt: at(2026, 11, 4, 23, 59) },
        { id: 'c', startedAt: at(2026, 11, 5, 14) },
        { id: 'd', startedAt: at(2026, 11, 6, 0, 0) },
    ];
    assert.deepEqual(rowsOfDay(rows, '2026-11-05').map((r) => r.id), ['c', 'a']);
    assert.deepEqual(rowsOfDay(rows, '2026-11-09'), []);
});

test('activeMsNow and pausedMsNow follow the running and paused states', () => {
    const running = { elapsedMs: 5000, startTime: 1000, pausedMs: 300, isPaused: false, pauseStartedAt: null };
    assert.equal(activeMsNow(running, 4000), 8000);
    assert.equal(pausedMsNow(running, 4000), 300);
    const paused = { elapsedMs: 8000, startTime: 4000, pausedMs: 300, isPaused: true, pauseStartedAt: 4000 };
    assert.equal(activeMsNow(paused, 9000), 8000);
    assert.equal(pausedMsNow(paused, 9000), 5300);
});

test('a reload while paused restores paused with the same elapsed value', () => {
    const session = { id: 's1', startedAt: 1000 };
    const paused = { elapsedMs: 8000, startTime: 4000, pausedMs: 300, isPaused: true, pauseStartedAt: 4000 };
    const saved = JSON.parse(JSON.stringify(snapshotSession(session, paused, 9000)));
    const restored = restoreSnapshot(saved);
    assert.equal(restored.isPaused, true);
    assert.equal(restored.pauseStartedAt, 4000);
    assert.equal(restored.elapsedMs, 8000);
    assert.equal(restored.pausedMs, 300);
    assert.deepEqual(restored.session, session);
    // Resuming the restored timer later still counts the whole pause, including the time the page was closed.
    const timer = { ...restored, startTime: 20000 };
    assert.equal(activeMsNow(timer, 20000), 8000);
    assert.equal(pausedMsNow(timer, 20000), 300 + 16000);
});

test('a reload while running restores running with the elapsed time folded in', () => {
    const session = { id: 's1', startedAt: 1000 };
    const running = { elapsedMs: 5000, startTime: 1000, pausedMs: 300, isPaused: false, pauseStartedAt: null };
    const restored = restoreSnapshot(JSON.parse(JSON.stringify(snapshotSession(session, running, 4000))));
    assert.equal(restored.isPaused, false);
    assert.equal(restored.pauseStartedAt, null);
    assert.equal(restored.elapsedMs, 8000);
    assert.equal(restored.pausedMs, 300);
});

test('restoreSnapshot rejects unusable data and degrades a pause with no start to running', () => {
    assert.equal(restoreSnapshot(null), null);
    assert.equal(restoreSnapshot({}), null);
    assert.equal(restoreSnapshot({ id: 'x', startedAt: 'nope' }), null);
    const odd = restoreSnapshot({ id: 'x', startedAt: 5, elapsedMs: 'junk', isPaused: true });
    assert.equal(odd.isPaused, false);
    assert.equal(odd.elapsedMs, 0);
    assert.equal(odd.pausedMs, 0);
});

test('startedAtForElapsed keeps paused time inside the session range', () => {
    const started = startedAtForElapsed(NOW, 3600000, 600000);
    assert.equal(NOW - started, 3600000 + 600000);
});
