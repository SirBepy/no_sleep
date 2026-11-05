import { formatHms, parseHms, startedAtForElapsed } from './sessions.js';
import { createHistory } from './history.js';

const SAVE_INTERVAL_MS = 30000;
const SESSION_KEY = 'nosleep_session';

let wakeInterval = 30000;
let wakeTimer;
let runningTimer;
let startTime;
let elapsedMs = 0;
let isPaused = false;
let pausedMs = 0;
let pauseStartedAt = null;
let wakeLock = null;
let wakeLockSupported = false;
let audioCtx = null;
let silentOscillator = null;
// Current recording: id names the Firestore doc, startedAt is the wall-clock start.
let session = null;
// Firebase store module and signed-in user; both stay null when signed out or the SDK failed to load.
let store = null;
let user = null;
let editingTime = false;

function ensureAudioContext() {
    if (audioCtx) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        silentOscillator = audioCtx.createOscillator();
        silentOscillator.connect(gain);
        gain.connect(audioCtx.destination);
        silentOscillator.start();
    } catch (err) {
        console.error('AudioContext init failed:', err);
    }
}

async function startSilentAudio() {
    ensureAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (err) { console.error(err); }
    }
}

async function stopSilentAudio() {
    if (audioCtx && audioCtx.state === 'running') {
        try { await audioCtx.suspend(); } catch (err) { console.error(err); }
    }
}

async function requestWakeLock() {
    if (!wakeLockSupported) return false;

    try {
        wakeLock = await navigator.wakeLock.request('screen');

        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock released');
        });

        console.log('Wake Lock active');
        updateStatus(true);
        return true;
    } catch (err) {
        console.error('Wake Lock request failed:', err);
        updateStatus(false);
        return false;
    }
}

async function releaseWakeLock() {
    if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
    }
}

function updateStatus(isActive) {
    const statusElement = document.querySelector('.status');
    if (!statusElement) return;

    if (isActive) {
        statusElement.textContent = '✓ ACTIVE - Your computer will stay awake';
        statusElement.style.backgroundColor = '#e8f5e9';
        statusElement.style.color = '#2e7d32';
    } else {
        statusElement.textContent = '⚠ INACTIVE - Click to enable wake lock';
        statusElement.style.backgroundColor = '#fff3e0';
        statusElement.style.color = '#f57c00';
        statusElement.style.cursor = 'pointer';
    }
}

function preventSleep() {
    // Wake lock re-acquisition handled by visibility change
}

function currentElapsed() {
    return isPaused ? elapsedMs : elapsedMs + Date.now() - startTime;
}

function currentPausedMs() {
    return pausedMs + (isPaused ? Date.now() - pauseStartedAt : 0);
}

// sessionStorage keeps a reload inside the same tab on the same session instead of starting a new one.
function persistSession() {
    if (!session) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        id: session.id,
        startedAt: session.startedAt,
        elapsedMs: currentElapsed(),
        pausedMs: currentPausedMs(),
    }));
}

function restoreSession() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
        if (saved && saved.id && Number.isFinite(saved.startedAt)) {
            session = { id: saved.id, startedAt: saved.startedAt };
            elapsedMs = Number(saved.elapsedMs) || 0;
            pausedMs = Number(saved.pausedMs) || 0;
            return;
        }
    } catch (err) {
        console.warn('Ignoring unreadable saved session:', err);
    }
    session = { id: crypto.randomUUID(), startedAt: Date.now() };
}

// Fire-and-forget: the cache queues the write offline, and a failure only reaches the console.
function saveSessionNow() {
    if (!store || !user || !session) return;
    store.saveSession(session.id, {
        startedAt: session.startedAt,
        endedAt: Date.now(),
        activeMs: currentElapsed(),
        pausedMs: currentPausedMs(),
        manual: false,
    }).catch((err) => console.error('Session save failed:', err));
}

function renderTimer() {
    const timerElement = document.getElementById('time');
    if (!timerElement) return;

    persistSession();
    if (!editingTime) timerElement.textContent = formatHms(currentElapsed());
}

function updateTimer() {
    renderTimer();
    runningTimer = setInterval(renderTimer, 1000);
}

function setElapsed(ms) {
    elapsedMs = ms;
    startTime = Date.now();
    session.startedAt = startedAtForElapsed(Date.now(), ms, currentPausedMs());
    renderTimer();
    saveSessionNow();
}

function showTimeError(message) {
    const box = document.getElementById('time-error');
    if (!box) return;
    box.textContent = message;
    if (message) setTimeout(() => { if (box.textContent === message) box.textContent = ''; }, 3000);
}

function setupTimeEditing() {
    const display = document.getElementById('time');
    const input = document.getElementById('time-input');
    const cancel = document.getElementById('time-cancel');
    if (!display || !input || !cancel) return;

    function begin() {
        if (editingTime) return;
        editingTime = true;
        input.value = formatHms(currentElapsed());
        input.style.width = `${input.value.length + 1}ch`;
        display.hidden = true;
        input.hidden = false;
        cancel.hidden = false;
        showTimeError('');
        input.focus();
        input.select();
    }

    function finish() {
        editingTime = false;
        input.hidden = true;
        cancel.hidden = true;
        display.hidden = false;
        renderTimer();
    }

    // Click-away commits; an unparseable value is dropped rather than trapping her in the field.
    function commit(keepOpenOnError) {
        const ms = parseHms(input.value);
        if (ms === null) {
            showTimeError('Use hours:minutes:seconds, e.g. 01:30:00');
            if (!keepOpenOnError) finish();
            return;
        }
        finish();
        setElapsed(ms);
    }

    display.addEventListener('click', begin);
    display.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            begin();
        }
    });
    input.addEventListener('input', () => {
        input.style.width = `${Math.max(input.value.length, 8) + 1}ch`;
        showTimeError('');
    });
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit(true);
        else if (ev.key === 'Escape') finish();
    });
    input.addEventListener('blur', () => { if (editingTime) commit(false); });
    // mousedown fires before the input's blur, so preventing it stops blur from committing a cancelled edit.
    cancel.addEventListener('mousedown', (ev) => ev.preventDefault());
    cancel.addEventListener('click', finish);
}

function togglePause() {
    const pauseButton = document.getElementById('pause-toggle');
    const pauseHint = document.getElementById('pause-hint');
    if (!pauseButton) return;

    isPaused = !isPaused;

    if (isPaused) {
        elapsedMs += Date.now() - startTime;
        pauseStartedAt = Date.now();
        clearInterval(runningTimer);
        pauseButton.querySelector('span').textContent = 'Resume';
        pauseButton.classList.add('active');
        if (pauseHint) pauseHint.classList.add('visible');
    } else {
        pausedMs += Date.now() - pauseStartedAt;
        pauseStartedAt = null;
        startTime = Date.now();
        updateTimer();
        pauseButton.querySelector('span').textContent = 'Pause';
        pauseButton.classList.remove('active');
        if (pauseHint) pauseHint.classList.remove('visible');
    }
}

// ----- Account, saving and history -----

function renderAccount() {
    const button = document.getElementById('account-btn');
    const menu = document.getElementById('account-menu');
    const email = document.getElementById('account-email');
    if (!button) return;
    button.classList.toggle('signed-in', Boolean(user));
    button.replaceChildren();
    if (user) {
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
        button.append(avatar);
        button.title = 'Account';
        button.setAttribute('aria-label', 'Account');
        email.textContent = user.email || user.displayName || '';
    } else {
        const glyph = document.createElement('i');
        glyph.className = 'ph ph-user-circle';
        button.append(glyph);
        button.title = 'Sign in with Google to save your time';
        button.setAttribute('aria-label', 'Sign in with Google');
        menu.hidden = true;
    }
}

async function signInWithGoogle() {
    if (!store) return false;
    try {
        await store.signIn();
        return true;
    } catch (err) {
        // A closed popup is the common case and not worth alarming anyone about.
        console.warn('Sign-in did not complete:', err && err.code ? err.code : err);
        return false;
    }
}

async function ensureSignedIn() {
    if (user) return true;
    return signInWithGoogle();
}

async function setupCloud() {
    const accountButton = document.getElementById('account-btn');
    const menu = document.getElementById('account-menu');
    const history = createHistory({
        getStore: () => store,
        ensureSignedIn,
        getLiveId: () => (session ? session.id : null),
    });

    accountButton.addEventListener('click', async () => {
        if (user) menu.hidden = !menu.hidden;
        else await signInWithGoogle();
    });
    document.getElementById('signout-btn').addEventListener('click', async () => {
        menu.hidden = true;
        await store.signOutUser();
    });
    document.addEventListener('click', (ev) => {
        if (!ev.target.closest('#account')) menu.hidden = true;
    });
    document.getElementById('history-btn').addEventListener('click', history.open);

    // Firebase loads lazily: if the CDN is unreachable the timer and wake lock still work.
    try {
        store = await import('./store.js');
    } catch (err) {
        console.error('Firebase failed to load, time will not be saved:', err);
        return;
    }
    store.watchAuth((nextUser) => {
        user = nextUser;
        renderAccount();
        console.log(user ? `Signed in as ${user.email}` : 'Signed out');
        saveSessionNow();
    });
    setInterval(saveSessionNow, SAVE_INTERVAL_MS);
}

async function initialize() {
    wakeLockSupported = 'wakeLock' in navigator;

    if (wakeLockSupported) {
        console.log('Wake Lock API supported');
    } else {
        console.warn('Wake Lock API not supported in this browser');
        updateStatus(false);
    }

    const pauseButton = document.getElementById('pause-toggle');
    const statusElement = document.querySelector('.status');

    if (pauseButton) {
        pauseButton.addEventListener('click', togglePause);
    }

    if (statusElement) {
        statusElement.addEventListener('click', async () => {
            if (!wakeLock) {
                await requestWakeLock();
            }
        });
    }

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await stopSilentAudio();
            if (wakeLockSupported) await requestWakeLock();
        } else {
            await startSilentAudio();
            saveSessionNow();
        }
    });
    window.addEventListener('pagehide', saveSessionNow);

    document.addEventListener('click', ensureAudioContext, { once: true });

    restoreSession();
    startTime = Date.now();
    setupTimeEditing();
    setupCloud();

    wakeTimer = setInterval(preventSleep, wakeInterval);
    updateTimer();
    preventSleep();

    await requestWakeLock();
}

window.onload = initialize;
