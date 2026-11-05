// Pure session logic: no DOM, no Firebase. Kept dependency-free so `node --test` can load it.

export const HISTORY_DAYS = 30;

const pad2 = (n) => String(n).padStart(2, '0');

export function formatHms(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** "H:MM:SS" (also "HH:MM:SS", hours up to 999) to milliseconds, or null when malformed. */
export function parseHms(text) {
    const match = /^(\d{1,3}):([0-5]?\d):([0-5]?\d)$/.exec(String(text).trim());
    if (!match) return null;
    return ((+match[1]) * 3600 + (+match[2]) * 60 + (+match[3])) * 1000;
}

export function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    return `${Math.floor(totalMinutes / 60)}h ${pad2(totalMinutes % 60)}m`;
}

export function clockLabel(ms) {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
    return new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Start of the local day `days` days before `nowMs`: the history window's lower bound. */
export function cutoffMs(nowMs, days = HISTORY_DAYS) {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d.getTime();
}

/** Time actually counted: pauses excluded. Manual rows and heartbeats both store it as activeMs. */
export function sessionDurationMs(session) {
    if (typeof session.activeMs === 'number') return session.activeMs;
    return Math.max(0, (session.endedAt ?? session.startedAt) - session.startedAt);
}

/** Newest day first, newest session first inside a day, each day carrying its total. */
export function groupByDay(sessions) {
    const groups = new Map();
    for (const session of sessions) {
        const key = dayKey(session.startedAt);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(session);
    }
    return [...groups.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, list]) => {
            list.sort((a, b) => b.startedAt - a.startedAt);
            return { key, sessions: list, totalMs: list.reduce((sum, s) => sum + sessionDurationMs(s), 0) };
        });
}

export function totalMs(sessions) {
    return sessions.reduce((sum, s) => sum + sessionDurationMs(s), 0);
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
    if (startedAt > nowMs) return { error: 'That time is in the future' };
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
