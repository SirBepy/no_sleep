// History dialog: today hour by hour, a month calendar of daily totals underneath, and the exact
// hours of any clicked day inline below the calendar. Add entry is an inline form in the dialog.
import {
    addMonths,
    buildManualEntry,
    clockLabel,
    dayKey,
    dayLabel,
    formatDuration,
    monthGrid,
    monthOf,
    monthRange,
    sessionDurationMs,
    shadeLevel,
    startOfDay,
    totalMs,
    totalsByDay,
} from './sessions.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(name) {
    return el('i', `ph ph-${name}`);
}

function button(className, label, data) {
    const node = el('button', className, label);
    node.type = 'button';
    Object.assign(node.dataset, data);
    return node;
}

/**
 * @param {object} deps
 * @param {() => object|null} deps.getStore  loaded Firebase store, or null while it is unavailable
 * @param {() => boolean} deps.isSignedIn
 * @param {() => Promise<boolean>} deps.signIn  runs Google sign-in; true once signed in
 * @param {() => string|null} deps.getLiveId  id of the session this page is recording right now
 * @param {() => number} deps.getLiveElapsedMs  the running timer, so the Now row ticks between saves
 */
export function createHistory({ getStore, isSignedIn, signIn, getLiveId, getLiveElapsedMs }) {
    const dialog = $('history-dialog');
    const body = $('history-body');
    const form = $('entry-form');
    const addButton = $('history-add');

    // todayRows and monthRows come from two live queries: today is always needed, the month follows the arrows.
    const state = {
        month: monthOf(Date.now()),
        selected: null,
        todayRows: [],
        monthRows: [],
        todayStatus: 'loading',
        monthStatus: 'loading',
        confirmId: null,
    };
    let stopToday = null;
    let stopMonth = null;
    let liveTicker = null;

    // ----- Rendering -----

    function renderEntry(row) {
        const isLive = row.id === getLiveId();
        const item = el('div', 'entry');
        if (isLive) item.append(el('span', 'live-dot'));

        const main = el('div', 'entry-main');
        main.append(el('span', 'entry-range', `${clockLabel(row.startedAt)} - ${isLive ? 'now' : clockLabel(row.endedAt ?? row.startedAt)}`));
        const note = isLive ? 'Current session' : row.note;
        if (note) {
            const noteEl = el('span', 'entry-note', note);
            noteEl.title = note;
            main.append(noteEl);
        }
        item.append(main);

        if (isLive) item.append(el('span', 'badge badge-success badge-sm', 'Now'));
        else if (row.manual) item.append(el('span', 'badge badge-info badge-sm', 'manual'));

        const duration = el('span', 'entry-duration', formatDuration(isLive ? getLiveElapsedMs() : sessionDurationMs(row)));
        if (isLive) duration.dataset.liveDuration = '1';
        item.append(duration);

        if (!isLive) {
            if (state.confirmId === row.id) {
                const confirm = el('span', 'entry-confirm', 'Delete? ');
                confirm.append(button('confirm-yes', 'Yes', { delete: row.id }), button('', 'No', { deleteCancel: '1' }));
                item.append(confirm);
            } else {
                const del = button('entry-delete', '', { ask: row.id });
                del.setAttribute('aria-label', 'Delete entry');
                del.append(icon('trash'));
                item.append(del);
            }
        }
        return item;
    }

    function dayHead(label, ms) {
        const head = el('div', 'day-head');
        head.append(el('span', '', label), el('b', '', formatDuration(ms)));
        return head;
    }

    function errorBox(message) {
        const box = el('div', 'history-error');
        box.append(el('span', '', message), button('btn btn-ghost btn-sm', 'Retry', { retry: '1' }));
        return box;
    }

    function skeletons(count) {
        const wrap = el('div');
        for (let i = 0; i < count; i++) wrap.append(el('div', 'skeleton'));
        return wrap;
    }

    function todaySection(now) {
        const section = el('section', 'day');
        if (state.todayStatus === 'error') {
            section.append(dayHead('Today', 0), errorBox('Could not load today.'));
            return section;
        }
        if (state.todayStatus === 'loading') {
            section.append(dayHead('Today', 0), skeletons(1));
            return section;
        }
        const rows = state.todayRows
            .filter((r) => r.startedAt >= startOfDay(now))
            .sort((a, b) => b.startedAt - a.startedAt);
        section.append(dayHead('Today', todayTotal(rows)));
        for (const row of rows) section.append(renderEntry(row));
        if (rows.length === 0) section.append(el('p', 'history-hint', 'Nothing tracked yet today.'));
        return section;
    }

    /** The running session counts at its live value, not the last saved heartbeat. */
    function todayTotal(rows) {
        const liveId = getLiveId();
        return rows.reduce((sum, r) => sum + (r.id === liveId ? getLiveElapsedMs() : sessionDurationMs(r)), 0);
    }

    function calendarSection(now) {
        const section = el('section', 'calendar');
        const today = dayKey(now);
        const isCurrentMonth = state.month.year === monthOf(now).year && state.month.month === monthOf(now).month;

        const label = new Date(state.month.year, state.month.month, 1)
            .toLocaleDateString([], { month: 'long', year: 'numeric' });
        const head = el('div', 'cal-head');
        const prev = button('cal-nav', '', { monthStep: '-1' });
        prev.setAttribute('aria-label', 'Previous month');
        prev.append(icon('caret-left'));
        const next = button('cal-nav', '', { monthStep: '1' });
        next.setAttribute('aria-label', 'Next month');
        next.append(icon('caret-right'));
        next.disabled = isCurrentMonth;
        head.append(prev, el('h3', 'cal-title', label), next);
        section.append(head);

        if (state.monthStatus === 'error') {
            section.append(errorBox('Could not load this month.'));
            return section;
        }
        if (state.monthStatus === 'loading') {
            section.append(skeletons(3));
            return section;
        }

        const totals = totalsByDay(state.monthRows);
        if (isCurrentMonth) totals.set(today, todayTotal(state.todayRows.filter((r) => r.startedAt >= startOfDay(now))));
        const monthTotal = [...totals.values()].reduce((a, b) => a + b, 0);
        const busiest = Math.max(0, ...totals.values());
        head.after(el('div', 'cal-total', monthTotal ? `${formatDuration(monthTotal)} this month` : 'Nothing tracked this month'));

        const grid = el('div', 'cal-grid');
        for (let i = 0; i < 7; i++) {
            // 2024-01-01 is a Monday, so these narrow names run Monday to Sunday like the grid.
            grid.append(el('span', 'cal-dow', new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: 'narrow' })));
        }
        for (const key of monthGrid(state.month)) {
            if (!key) {
                grid.append(el('span', 'cal-blank'));
                continue;
            }
            const ms = totals.get(key) || 0;
            const [y, m, d] = key.split('-').map(Number);
            const cell = button('cal-day', '', { day: key });
            const future = key > today;
            cell.disabled = future;
            if (key === today) cell.classList.add('is-today');
            if (key === state.selected) cell.classList.add('is-selected');
            if (ms) cell.style.setProperty('--shade', String(shadeLevel(ms, busiest)));
            cell.append(el('span', 'cal-num', String(d)), el('span', 'cal-hours', ms ? formatDuration(ms) : ''));
            const spoken = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
            cell.setAttribute('aria-label', ms ? `${spoken}, ${formatDuration(ms)} tracked` : spoken);
            if (key === state.selected) cell.setAttribute('aria-pressed', 'true');
            grid.append(cell);
        }
        section.append(grid);
        section.append(dayDetail(now));
        return section;
    }

    function dayDetail(now) {
        const detail = el('div', 'day-detail');
        detail.id = 'day-detail';
        if (!state.selected) {
            detail.append(el('p', 'history-hint', 'Pick a day to see its exact hours.'));
            return detail;
        }
        const rows = state.monthRows
            .filter((r) => dayKey(r.startedAt) === state.selected)
            .sort((a, b) => b.startedAt - a.startedAt);
        const day = el('div', 'day');
        day.append(dayHead(dayLabel(state.selected, now), totalMs(rows)));
        for (const row of rows) day.append(renderEntry(row));
        if (rows.length === 0) day.append(el('p', 'history-hint', 'Nothing tracked this day.'));
        day.append(button('btn btn-ghost btn-sm detail-add', 'Add entry for this day', { addForDay: state.selected }));
        detail.append(day);
        return detail;
    }

    function render() {
        // Re-rendering replaces every node, so keyboard focus is handed back to the same calendar day afterwards.
        const focusedDay = document.activeElement && document.activeElement.dataset
            ? document.activeElement.dataset.day
            : null;
        body.replaceChildren();
        const signedIn = isSignedIn();
        addButton.hidden = !signedIn;
        if (!signedIn) {
            form.hidden = true;
            const prompt = el('div', 'history-signin');
            prompt.append(el('p', '', 'Sign in with Google to see your history. Your sessions are saved to your account, so clearing the browser never loses them.'));
            prompt.append(button('btn btn-primary btn-sm', 'Sign in with Google', { signin: '1' }));
            body.append(prompt);
            return;
        }
        const now = Date.now();
        body.append(todaySection(now), calendarSection(now));
        if (focusedDay) body.querySelector(`[data-day="${focusedDay}"]`)?.focus();
    }

    function tickLive() {
        const node = body.querySelector('[data-live-duration]');
        if (node) node.textContent = formatDuration(getLiveElapsedMs());
    }

    // ----- Data -----

    function failed(which) {
        return (err) => {
            console.error(`History ${which} load failed:`, err);
            state[`${which}Status`] = 'error';
            render();
        };
    }

    function watch(which, range, onRows) {
        const store = getStore();
        if (!store) {
            state[`${which}Status`] = 'error';
            return null;
        }
        try {
            return store.watchSessions(range, (rows) => {
                onRows(rows);
                state[`${which}Status`] = 'ready';
                render();
            }, failed(which));
        } catch (err) {
            failed(which)(err);
            return null;
        }
    }

    function watchToday() {
        stopToday?.();
        state.todayStatus = 'loading';
        stopToday = watch('today', { since: startOfDay(Date.now()) }, (rows) => { state.todayRows = rows; });
    }

    function watchMonth() {
        stopMonth?.();
        state.monthStatus = 'loading';
        stopMonth = watch('month', monthRange(state.month), (rows) => { state.monthRows = rows; });
    }

    function startWatching() {
        stopToday?.();
        stopMonth?.();
        stopToday = null;
        stopMonth = null;
        if (isSignedIn()) {
            watchToday();
            watchMonth();
        }
        render();
    }

    function open() {
        state.month = monthOf(Date.now());
        state.selected = null;
        state.confirmId = null;
        form.hidden = true;
        dialog.showModal();
        startWatching();
        liveTicker = setInterval(tickLive, 1000);
    }

    /** Called when sign-in state changes while the dialog may be open. */
    function refresh() {
        if (dialog.open) startWatching();
    }

    dialog.addEventListener('close', () => {
        stopToday?.();
        stopMonth?.();
        stopToday = null;
        stopMonth = null;
        clearInterval(liveTicker);
    });

    // Escape closes just the form while it is open, the whole dialog otherwise. Handled on keydown:
    // preventing it stops the browser's own close request, which a `cancel` listener cannot reliably veto.
    dialog.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !form.hidden) {
            ev.preventDefault();
            form.hidden = true;
            addButton.focus();
        }
    });

    dialog.addEventListener('click', async (ev) => {
        if (ev.target === dialog) {
            dialog.close();
            return;
        }
        const target = ev.target.closest('button');
        if (!target) return;
        const data = target.dataset;
        if (data.ask) {
            state.confirmId = data.ask;
            render();
        } else if (data.deleteCancel) {
            state.confirmId = null;
            render();
        } else if (data.delete) {
            state.confirmId = null;
            try {
                await getStore().deleteSession(data.delete);
            } catch (err) {
                console.error('Delete failed:', err);
            }
            render();
        } else if (data.retry) {
            startWatching();
        } else if (data.signin) {
            await signIn();
        } else if (data.monthStep) {
            state.month = addMonths(state.month, Number(data.monthStep));
            state.selected = null;
            watchMonth();
            render();
        } else if (data.day) {
            // Today is already listed in full at the top, so its cell scrolls there instead of repeating it.
            if (data.day === dayKey(Date.now())) {
                body.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                state.selected = state.selected === data.day ? null : data.day;
                render();
                if (state.selected) $('day-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        } else if (data.addForDay) {
            openEntryForm(data.addForDay);
        }
    });

    $('history-close').addEventListener('click', () => dialog.close());
    addButton.addEventListener('click', () => {
        if (form.hidden) openEntryForm(state.selected);
        else form.hidden = true;
    });

    // ----- Add entry -----
    const fields = {
        date: $('entry-date'),
        start: $('entry-start'),
        stop: $('entry-stop'),
        note: $('entry-note'),
    };
    const preview = $('entry-preview');
    const saveButton = $('entry-save');

    function validateForm() {
        const { session, error } = buildManualEntry(
            { date: fields.date.value, start: fields.start.value, stop: fields.stop.value, note: fields.note.value },
            Date.now(),
        );
        const untouched = !fields.start.value || !fields.stop.value;
        preview.classList.toggle('bad', Boolean(error) && !untouched);
        preview.textContent = session
            ? formatDuration(session.activeMs)
            : untouched
                ? 'Pick start and stop'
                : error;
        saveButton.disabled = !session;
        return session;
    }

    /** `forDay` (a dayKey) pre-fills the date when she opens the form from a picked calendar day. */
    function openEntryForm(forDay) {
        const today = dayKey(Date.now());
        fields.date.value = forDay && forDay <= today ? forDay : today;
        fields.date.max = today;
        fields.start.value = '';
        fields.stop.value = '';
        fields.note.value = '';
        validateForm();
        form.hidden = false;
        fields.start.focus();
    }

    for (const field of Object.values(fields)) field.addEventListener('input', validateForm);

    $('entry-cancel').addEventListener('click', () => { form.hidden = true; });
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const session = validateForm();
        if (!session) return;
        // Not awaited to completion: offline, the write queues locally and the snapshot listener shows it at once.
        getStore().saveSession(crypto.randomUUID(), session).catch((err) => console.error('Entry save failed:', err));
        form.hidden = true;
    });

    return { open, refresh };
}
