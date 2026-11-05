// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatHms,
    parseHms,
    formatDuration,
    dayKey,
    dayLabel,
    cutoffMs,
    groupByDay,
    totalMs,
    sessionDurationMs,
    buildManualEntry,
    startedAtForElapsed,
} from '../src/scripts/sessions.js';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 11, 5, 15, 0);

test('formatHms pads and handles hours over 99', () => {
    assert.equal(formatHms(0), '00:00:00');
    assert.equal(formatHms(12 * 60 * 1000 + 41 * 1000), '00:12:41');
    assert.equal(formatHms(100 * 3600 * 1000), '100:00:00');
    assert.equal(formatHms(-5), '00:00:00');
});

test('parseHms accepts hh:mm:ss and rejects everything else', () => {
    assert.equal(parseHms('01:30:00'), 90 * 60 * 1000);
    assert.equal(parseHms(' 1:5:9 '), (3600 + 5 * 60 + 9) * 1000);
    assert.equal(parseHms('00:60:00'), null);
    assert.equal(parseHms('12:34'), null);
    assert.equal(parseHms('abc'), null);
    assert.equal(parseHms(''), null);
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

test('cutoffMs is local midnight 30 days back', () => {
    assert.equal(cutoffMs(NOW), at(2026, 10, 6));
});

test('groupByDay orders days and sessions newest first with per-day totals', () => {
    const groups = groupByDay([
        { id: 'a', startedAt: at(2026, 11, 4, 9), activeMs: 3600000 },
        { id: 'b', startedAt: at(2026, 11, 5, 9), activeMs: 1800000 },
        { id: 'c', startedAt: at(2026, 11, 4, 13), activeMs: 7200000 },
    ]);
    assert.deepEqual(groups.map((g) => g.key), ['2026-11-05', '2026-11-04']);
    assert.deepEqual(groups[1].sessions.map((s) => s.id), ['c', 'a']);
    assert.equal(groups[1].totalMs, 3 * 3600000);
});

test('sessionDurationMs falls back to the time range when activeMs is missing', () => {
    assert.equal(sessionDurationMs({ startedAt: 1000, endedAt: 61000 }), 60000);
    assert.equal(sessionDurationMs({ startedAt: 1000, endedAt: 61000, activeMs: 5000 }), 5000);
    assert.equal(totalMs([{ startedAt: 0, activeMs: 10 }, { startedAt: 0, activeMs: 5 }]), 15);
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

test('startedAtForElapsed keeps paused time inside the session range', () => {
    const started = startedAtForElapsed(NOW, 3600000, 600000);
    assert.equal(NOW - started, 3600000 + 600000);
});
