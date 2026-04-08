let wakeInterval = 30000;
let wakeTimer;
let runningTimer;
let startTime;
let elapsedMs = 0;
let isPaused = false;
let wakeLock = null;
let wakeLockSupported = false;

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

function renderTimer() {
    const timerElement = document.getElementById('time');
    if (!timerElement) return;

    const current = elapsedMs + Date.now() - startTime;
    sessionStorage.setItem('nosleep_elapsed', current);

    const totalSeconds = Math.floor(current / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    timerElement.textContent = [hours, minutes, seconds]
        .map(n => n.toString().padStart(2, '0'))
        .join(':');
}

function updateTimer() {
    renderTimer();
    runningTimer = setInterval(renderTimer, 1000);
}

function togglePause() {
    const pauseButton = document.getElementById('pause-toggle');
    const pauseHint = document.getElementById('pause-hint');
    if (!pauseButton) return;

    isPaused = !isPaused;

    if (isPaused) {
        elapsedMs += Date.now() - startTime;
        clearInterval(runningTimer);
        pauseButton.querySelector('span').textContent = 'Resume';
        pauseButton.classList.add('active');
        if (pauseHint) pauseHint.classList.add('visible');
    } else {
        startTime = Date.now();
        updateTimer();
        pauseButton.querySelector('span').textContent = 'Pause';
        pauseButton.classList.remove('active');
        if (pauseHint) pauseHint.classList.remove('visible');
    }
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
        if (document.visibilityState === 'visible' && wakeLockSupported) {
            await requestWakeLock();
        }
    });

    elapsedMs = parseInt(sessionStorage.getItem('nosleep_elapsed') || '0');
    startTime = Date.now();

    wakeTimer = setInterval(preventSleep, wakeInterval);
    updateTimer();
    preventSleep();

    await requestWakeLock();
}

window.onload = initialize;
