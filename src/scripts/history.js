// History dialog: a month calendar of daily totals and the exact hours of the selected day (today
// by default) beside it, stacked below it on a phone. Add entry is its own small dialog, opened from the selected day.
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
    rowsOfDay,
    rowsTotalMs,
    shadeLevel,
    totalsByDay,
} from './sessions.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function isThisMonth(month, nowMs) {
    const current = monthOf(nowMs);
    return month.year === current.year && month.month === current.month;
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
 * @param {() => string|null} deps.getNotice  why sign-in is impossible right now (Firebase did not load), or null
 * @param {() => string|null} deps.getLiveId  id of the session this page is recording right now
 * @param {() => number} deps.getLiveElapsedMs  the running timer, so the Now row ticks between saves
 */
export function createHistory({ getStore, isSignedIn, signIn, getNotice, getLiveId, getLiveElapsedMs }) {
    const dialog = $('history-dialog');
    const body = $('history-body');
    const entryDialog = $('entry-dialog');
    const form = $('entry-form');

    // monthRows is one live query that follows the arrows; the current month includes today.
    const state = {
        month: monthOf(Date.now()),
        selected: null,
        monthRows: [],
        monthStatus: 'loading',
        confirmId: null,
    };
    let stopMonth = null;
    let liveTicker = null;

    // ----- Rendering -----

    /** The running session as the totals helpers want it: its id and value right now. */
    const live = () => ({ id: getLiveId(), ms: getLiveElapsedMs() });

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

        const duration = el('span', 'entry-duration', formatDuration(isLive ? getLiveElapsedMs() : rowsTotalMs([row])));
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
        const total = el('b', '', formatDuration(ms));
        total.dataset.dayTotal = '1';
        head.append(el('span', '', label), total);
        return head;
    }

    function errorBox(message, retryData = { retry: '1' }) {
        const box = el('div', 'history-error');
        box.append(el('span', '', message), button('btn btn-ghost btn-sm', 'Retry', retryData));
        return box;
    }

    function skeletons(count) {
        const wrap = el('div');
        for (let i = 0; i < count; i++) wrap.append(el('div', 'skeleton'));
        return wrap;
    }

    function monthTotalText(totals) {
        const monthTotal = [...totals.values()].reduce((a, b) => a + b, 0);
        return monthTotal ? `${formatDuration(monthTotal)} this month` : 'Nothing tracked this month';
    }

    function dayAriaLabel(key, ms) {
        const [y, m, d] = key.split('-').map(Number);
        const spoken = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
        return ms ? `${spoken}, ${formatDuration(ms)} tracked` : spoken;
    }

    function calendarSection(now) {
        const section = el('section', 'calendar');
        const today = dayKey(now);
        const isCurrentMonth = isThisMonth(state.month, now);

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

        const totals = totalsByDay(state.monthRows, live());
        const busiest = Math.max(0, ...totals.values());
        head.after(el('div', 'cal-total', monthTotalText(totals)));

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
            const d = Number(key.slice(-2));
            const cell = button('cal-day', '', { day: key });
            const future = key > today;
            cell.disabled = future;
            if (key === today) cell.classList.add('is-today');
            if (key === state.selected) cell.classList.add('is-selected');
            if (ms) cell.style.setProperty('--shade', String(shadeLevel(ms, busiest)));
            cell.append(el('span', 'cal-num', String(d)), el('span', 'cal-hours', ms ? formatDuration(ms) : ''));
            cell.setAttribute('aria-label', dayAriaLabel(key, ms));
            if (key === state.selected) cell.setAttribute('aria-pressed', 'true');
            grid.append(cell);
        }
        section.append(grid);
        return section;
    }

    function dayDetail(now) {
        const detail = el('div', 'day-detail');
        detail.id = 'day-detail';
        if (!state.selected) {
            detail.append(el('p', 'history-hint', 'Pick a day to see its exact hours.'));
            return detail;
        }
        const rows = rowsOfDay(state.monthRows, state.selected);
        const day = el('div', 'day');
        day.append(dayHead(dayLabel(state.selected, now), rowsTotalMs(rows, live())));
        const list = el('div', 'day-list');
        list.dataset.day = state.selected;
        for (const row of rows) list.append(renderEntry(row));
        if (rows.length === 0) list.append(el('p', 'history-hint', 'Nothing tracked this day.'));
        // The list scrolls; the button stays pinned bottom right whatever the entry count.
        const foot = el('div', 'day-foot');
        foot.append(button('btn btn-ghost btn-sm detail-add', 'Add entry for this day', { addForDay: state.selected }));
        day.append(list, foot);
        detail.append(day);
        return detail;
    }

    function render() {
        // Re-rendering replaces every node, so keyboard focus is handed back to the same calendar day afterwards,
        // and the day list keeps its scroll position (snapshots arrive every ~30s while recording, and a delete
        // confirm re-renders too; without this the list would jump to the top under her finger).
        const focusedDay = document.activeElement && document.activeElement.dataset
            ? document.activeElement.dataset.day
            : null;
        const prevList = body.querySelector('.day-list');
        const prevListDay = prevList?.dataset.day;
        const prevListTop = prevList?.scrollTop ?? 0;
        const prevCalendarTop = body.querySelector('.history-layout > .calendar')?.scrollTop ?? 0;
        body.replaceChildren();
        const signedIn = isSignedIn();
        if (!signedIn) {
            entryDialog.close();
            const prompt = el('div', 'history-signin');
            prompt.append(el('p', '', 'Sign in with Google to see your history. Your sessions are saved to your account, so clearing the browser never loses them.'));
            prompt.append(button('btn btn-primary btn-sm', 'Sign in with Google', { signin: '1' }));
            const notice = getNotice();
            if (notice) prompt.append(errorBox(notice, { signin: '1' }));
            body.append(prompt);
            return;
        }
        const now = Date.now();
        // Calendar left, the selected day's list right; the day list only exists once the month has loaded.
        const layout = el('div', 'history-layout');
        layout.append(calendarSection(now));
        if (state.monthStatus === 'ready') layout.append(dayDetail(now));
        body.append(layout);
        const calendar = layout.querySelector('.calendar');
        if (calendar) calendar.scrollTop = prevCalendarTop;
        const list = layout.querySelector('.day-list');
        if (list && list.dataset.day === prevListDay) list.scrollTop = prevListTop;
        if (focusedDay) body.querySelector(`[data-day="${focusedDay}"]`)?.focus();
    }

    // Once a second: the Now row, the open day's total, and the calendar's cells and month total, so none of
    // them wait for the next 30 s heartbeat snapshot to catch up with the running timer.
    function tickLive() {
        const nowRow = body.querySelector('[data-live-duration]');
        if (nowRow) nowRow.textContent = formatDuration(getLiveElapsedMs());
        if (state.monthStatus !== 'ready' || !isSignedIn()) return;
        const dayTotal = body.querySelector('[data-day-total]');
        if (dayTotal) dayTotal.textContent = formatDuration(rowsTotalMs(rowsOfDay(state.monthRows, state.selected), live()));
        const totals = totalsByDay(state.monthRows, live());
        for (const cell of body.querySelectorAll('.cal-day')) {
            const ms = totals.get(cell.dataset.day) || 0;
            cell.querySelector('.cal-hours').textContent = ms ? formatDuration(ms) : '';
            cell.setAttribute('aria-label', dayAriaLabel(cell.dataset.day, ms));
        }
        const monthTotal = body.querySelector('.cal-total');
        if (monthTotal) monthTotal.textContent = monthTotalText(totals);
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

    function watchMonth() {
        stopMonth?.();
        state.monthStatus = 'loading';
        stopMonth = watch('month', monthRange(state.month), (rows) => { state.monthRows = rows; });
    }

    function startWatching() {
        stopMonth?.();
        stopMonth = null;
        if (isSignedIn()) watchMonth();
        render();
    }

    function open() {
        state.month = monthOf(Date.now());
        state.selected = dayKey(Date.now());
        state.confirmId = null;
        dialog.showModal();
        startWatching();
        liveTicker = setInterval(tickLive, 1000);
    }

    /** Called when sign-in state changes while the dialog may be open. */
    function refresh() {
        if (dialog.open) startWatching();
    }

    dialog.addEventListener('close', () => {
        stopMonth?.();
        stopMonth = null;
        clearInterval(liveTicker);
    });

    // A click on the dialog element itself lands on its backdrop (the content fills the box). The press must
    // also have started there: dragging out of an input and releasing on the backdrop fires a click on the
    // dialog too, and closing then would throw away what was typed.
    function backdropClick(dlg) {
        let pressedOnBackdrop = false;
        dlg.addEventListener('mousedown', (ev) => { pressedOnBackdrop = ev.target === dlg; });
        return (ev) => ev.target === dlg && pressedOnBackdrop;
    }
    const isHistoryBackdrop = backdropClick(dialog);
    const isEntryBackdrop = backdropClick(entryDialog);

    entryDialog.addEventListener('click', (ev) => {
        if (isEntryBackdrop(ev)) entryDialog.close();
    });

    dialog.addEventListener('click', async (ev) => {
        if (isHistoryBackdrop(ev)) {
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
            // Signing in re-renders through the auth listener; a failed attempt needs this to show its notice.
            if (!isSignedIn()) render();
        } else if (data.monthStep) {
            state.month = addMonths(state.month, Number(data.monthStep));
            // Landing back on the current month selects today again, like opening the dialog does.
            state.selected = isThisMonth(state.month, Date.now()) ? dayKey(Date.now()) : null;
            watchMonth();
            render();
        } else if (data.day) {
            // Clicking the selected day again keeps it selected: Add entry lives in its list, so deselecting would hide it.
            state.selected = data.day;
            render();
            // Stacked on a phone the list sits below the calendar; side by side it is already in view.
            if (state.selected && window.matchMedia('(max-width: 720px)').matches) {
                $('day-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        } else if (data.addForDay) {
            openEntryForm(data.addForDay);
        }
    });

    $('history-close').addEventListener('click', () => dialog.close());
    $('entry-close').addEventListener('click', () => entryDialog.close());

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

    /** `forDay` (a dayKey) pre-fills the date from the day she opened the popup on. */
    function openEntryForm(forDay) {
        const today = dayKey(Date.now());
        fields.date.value = forDay && forDay <= today ? forDay : today;
        fields.date.max = today;
        fields.start.value = '';
        fields.stop.value = '';
        fields.note.value = '';
        validateForm();
        entryDialog.showModal();
        fields.start.focus();
    }

    for (const field of Object.values(fields)) field.addEventListener('input', validateForm);

    $('entry-cancel').addEventListener('click', () => entryDialog.close());
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const session = validateForm();
        if (!session) return;
        // Not awaited to completion: offline, the write queues locally and the snapshot listener shows it at once.
        getStore().saveSession(crypto.randomUUID(), session).catch((err) => console.error('Entry save failed:', err));
        entryDialog.close();
    });

    return { open, refresh };
}
