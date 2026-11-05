// History dialog (last 30 days, grouped by day) and the Add entry dialog.
import {
    buildManualEntry,
    clockLabel,
    cutoffMs,
    dayKey,
    dayLabel,
    formatDuration,
    groupByDay,
    sessionDurationMs,
    totalMs,
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

/**
 * @param {object} deps
 * @param {() => object|null} deps.getStore  loaded Firebase store, or null while it is unavailable
 * @param {() => Promise<boolean>} deps.ensureSignedIn  prompts Google sign-in; true once signed in
 * @param {() => string|null} deps.getLiveId  id of the session this page is recording right now
 */
export function createHistory({ getStore, ensureSignedIn, getLiveId }) {
    const dialog = $('history-dialog');
    const body = $('history-body');
    const entryDialog = $('entry-dialog');
    let stopWatching = null;
    let status = 'loading';
    let rows = [];
    let confirmId = null;

    function renderEntry(row) {
        const isLive = row.id === getLiveId();
        const item = el('div', 'entry');
        if (isLive) item.append(el('span', 'live-dot'));

        const main = el('div', 'entry-main');
        main.append(el('span', 'entry-range', `${clockLabel(row.startedAt)} - ${isLive ? 'now' : clockLabel(row.endedAt ?? row.startedAt)}`));
        const note = isLive ? 'Current session' : row.note;
        if (note) main.append(el('span', 'entry-note', note));
        item.append(main);

        if (isLive) item.append(el('span', 'badge badge-success badge-sm', 'Now'));
        else if (row.manual) item.append(el('span', 'badge badge-info badge-sm', 'manual'));

        item.append(el('span', 'entry-duration', formatDuration(sessionDurationMs(row))));

        if (!isLive) {
            if (confirmId === row.id) {
                const confirm = el('span', 'entry-confirm', 'Delete? ');
                const yes = el('button', 'confirm-yes', 'Yes');
                yes.type = 'button';
                yes.dataset.delete = row.id;
                const no = el('button', '', 'No');
                no.type = 'button';
                no.dataset.deleteCancel = '1';
                confirm.append(yes, no);
                item.append(confirm);
            } else {
                const del = el('button', 'entry-delete');
                del.type = 'button';
                del.dataset.ask = row.id;
                del.setAttribute('aria-label', 'Delete entry');
                del.append(icon('trash'));
                item.append(del);
            }
        }
        return item;
    }

    function render() {
        body.replaceChildren();
        if (status === 'loading') {
            for (let i = 0; i < 3; i++) body.append(el('div', 'skeleton'));
            $('history-total').textContent = '-';
            return;
        }
        if (status === 'error') {
            const box = el('div', 'history-error');
            box.append(el('span', '', 'Could not load your history.'));
            const retry = el('button', 'btn btn-ghost btn-sm', 'Retry');
            retry.type = 'button';
            retry.dataset.retry = '1';
            box.append(retry);
            body.append(box);
            $('history-total').textContent = '-';
            return;
        }

        const now = Date.now();
        // Rows older than the window can still sit in the local cache, so the window is applied here too.
        const visible = rows.filter((r) => r.startedAt >= cutoffMs(now));
        $('history-total').textContent = formatDuration(totalMs(visible));

        const saved = visible.filter((r) => r.id !== getLiveId());
        if (saved.length === 0) {
            const empty = el('div', 'history-empty');
            empty.append(icon('hourglass-medium'));
            empty.append(el('p', '', 'Nothing saved yet. Finished sessions and manual entries land here.'));
            empty.append(el('p', '', 'Forgot to track something? Use Add entry.'));
            body.append(empty);
            if (visible.length === 0) return;
        }

        for (const group of groupByDay(visible)) {
            const day = el('div', 'day');
            const head = el('div', 'day-head');
            head.append(el('span', '', dayLabel(group.key, now)), el('b', '', formatDuration(group.totalMs)));
            day.append(head);
            for (const row of group.sessions) day.append(renderEntry(row));
            body.append(day);
        }
    }

    function startWatching() {
        stopWatching?.();
        status = 'loading';
        render();
        const store = getStore();
        if (!store) {
            status = 'error';
            render();
            return;
        }
        try {
            stopWatching = store.watchSessions(
                cutoffMs(Date.now()),
                (list) => {
                    rows = list;
                    status = 'ready';
                    render();
                },
                (err) => {
                    console.error('History load failed:', err);
                    status = 'error';
                    render();
                },
            );
        } catch (err) {
            console.error('History load failed:', err);
            status = 'error';
            render();
        }
    }

    async function open() {
        if (!(await ensureSignedIn())) return;
        confirmId = null;
        dialog.showModal();
        startWatching();
    }

    dialog.addEventListener('close', () => {
        stopWatching?.();
        stopWatching = null;
    });

    dialog.addEventListener('click', async (ev) => {
        if (ev.target === dialog) {
            dialog.close();
            return;
        }
        const button = ev.target.closest('button');
        if (!button) return;
        if (button.dataset.ask) {
            confirmId = button.dataset.ask;
            render();
        } else if (button.dataset.deleteCancel) {
            confirmId = null;
            render();
        } else if (button.dataset.delete) {
            confirmId = null;
            try {
                await getStore().deleteSession(button.dataset.delete);
            } catch (err) {
                console.error('Delete failed:', err);
            }
            render();
        } else if (button.dataset.retry) {
            startWatching();
        }
    });

    $('history-close').addEventListener('click', () => dialog.close());
    $('history-add').addEventListener('click', openEntryForm);

    // ----- Add entry -----
    const fields = {
        date: $('entry-date'),
        start: $('entry-start'),
        stop: $('entry-stop'),
        note: $('entry-note'),
    };
    const preview = $('entry-preview');
    const saveButton = $('entry-save');

    function readForm() {
        return buildManualEntry(
            { date: fields.date.value, start: fields.start.value, stop: fields.stop.value, note: fields.note.value },
            Date.now(),
        );
    }

    function validateForm() {
        const { session, error } = readForm();
        const untouched = !fields.start.value || !fields.stop.value;
        preview.classList.toggle('bad', Boolean(error) && !untouched);
        preview.textContent = session
            ? formatDuration(session.activeMs)
            : untouched
                ? 'Pick a start and stop time'
                : error;
        saveButton.disabled = !session;
        return session;
    }

    function openEntryForm() {
        const today = dayKey(Date.now());
        fields.date.value = today;
        fields.date.max = today;
        fields.start.value = '';
        fields.stop.value = '';
        fields.note.value = '';
        validateForm();
        entryDialog.showModal();
    }

    for (const field of Object.values(fields)) field.addEventListener('input', validateForm);

    $('entry-cancel').addEventListener('click', () => entryDialog.close());
    entryDialog.addEventListener('click', (ev) => {
        if (ev.target === entryDialog) entryDialog.close();
    });
    $('entry-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const session = validateForm();
        if (!session) return;
        saveButton.disabled = true;
        try {
            // Not awaited to completion: offline, the write queues locally and the snapshot listener shows it at once.
            getStore().saveSession(crypto.randomUUID(), session).catch((err) => console.error('Entry save failed:', err));
            entryDialog.close();
        } catch (err) {
            console.error('Entry save failed:', err);
            preview.classList.add('bad');
            preview.textContent = 'Could not save, try again';
            saveButton.disabled = false;
        }
    });

    return { open };
}
