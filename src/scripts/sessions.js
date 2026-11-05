// Pure session logic: no DOM, no Firebase. Kept dependency-free so `node --test` can load it.

export const pad2 = (n) => String(n).padStart(2, '0');

export function splitHms(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** Largest value each timer field accepts: minutes and seconds stop at 59, hours at 999. */
export const UNIT_MAX = { h: 999, m: 59, s: 59 };

/** The elapsed time with one field (h, m or s) replaced and the other two kept as they are. */
export function replaceUnit(ms, unit, value) {
    const parts = { ...splitHms(ms), [unit]: value };
    return (parts.h * 3600 + parts.m * 60 + parts.s) * 1000;
}

/** "9m" under an hour, "3h 05m" above: a leading "0h" is noise on short sessions. */
export function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    return hours === 0 ? `${totalMinutes}m` : `${hours}h ${pad2(totalMinutes % 60)}m`;
}

/** Locale clock (12h or 24h to match her device) so list times read like the Add entry time fields. */
export function clockLabel(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Local calendar day as YYYY-MM-DD; days are local so a late-night session stays on the day she lived it. */
export function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function dayLabel(key, nowMs) {
    if (key === dayKey(nowMs)) return 'Today';
    const yesterday = new Date(nowMs);
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dayKey(yesterday.getTime())) return 'Yesterday';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Start of the local day containing `ms`. */
export function startOfDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/** Time actually counted: pauses excluded. Manual rows and heartbeats both store it as activeMs. */
export function sessionDurationMs(session) {
    if (typeof session.activeMs === 'number') return session.activeMs;
    return Math.max(0, (session.endedAt ?? session.startedAt) - session.startedAt);
}

export function totalMs(sessions) {
    return sessions.reduce((sum, s) => sum + sessionDurationMs(s), 0);
}

/** Total counted time per local day, keyed by dayKey. */
export function totalsByDay(sessions) {
    const totals = new Map();
    for (const session of sessions) {
        const key = dayKey(session.startedAt);
        totals.set(key, (totals.get(key) || 0) + sessionDurationMs(session));
    }
    return totals;
}

/** Month cursor for the calendar: month is 0-11. */
export function monthOf(ms) {
    const d = new Date(ms);
    return { year: d.getFullYear(), month: d.getMonth() };
}

export function addMonths({ year, month }, delta) {
    const d = new Date(year, month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
}

/** [start, end) of a month as epoch ms, the range the calendar subscribes to. */
export function monthRange({ year, month }) {
    return { since: new Date(year, month, 1).getTime(), until: new Date(year, month + 1, 1).getTime() };
}

/**
 * Calendar cells for one month, Monday first: a dayKey per day, null for the blanks that pad
 * the first and last week so the grid is always whole rows of seven.
 */
export function monthGrid({ year, month }) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = Array(leading).fill(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(`${year}-${pad2(month + 1)}-${pad2(day)}`);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

/** 0 for an empty day, otherwise 10-38: a tint strength scaled to the busiest day shown. */
export function shadeLevel(dayMs, maxMs) {
    if (!dayMs || !maxMs) return 0;
    return 10 + Math.round(28 * Math.min(1, dayMs / maxMs));
}

/**
 * Turns the Add entry form values into a session, or an error message for the form to show.
 * Overnight entries are rejected on purpose: stop must be after start on the same date, so a
 * shift past midnight is entered as two entries and each lands on the day it belongs to.
 */
export function buildManualEntry({ date, start, stop, note }, nowMs) {
    if (!date || !start || !stop) return { error: 'Fill in date, start and stop' };
    const [y, mo, d] = date.split('-').map(Number);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = stop.split(':').map(Number);
    const startedAt = new Date(y, mo - 1, d, sh, sm).getTime();
    const endedAt = new Date(y, mo - 1, d, eh, em).getTime();
    if (endedAt <= startedAt) return { error: 'Stop time must be after start time' };
    if (endedAt > nowMs) return { error: 'That time is in the future' };
    return {
        session: {
            startedAt,
            endedAt,
            activeMs: endedAt - startedAt,
            pausedMs: 0,
            manual: true,
            note: (note || '').trim().slice(0, 200),
        },
    };
}

/** Where the session started once the timer is hand-edited to `activeMs`, keeping pauses inside the range. */
export function startedAtForElapsed(nowMs, activeMs, pausedMs) {
    return nowMs - activeMs - pausedMs;
}
