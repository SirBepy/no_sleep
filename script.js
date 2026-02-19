const BUILD_TIMESTAMP = 'BUILD_TIMESTAMP_PLACEHOLDER';

let wakeInterval = 30000;
let countdownTimer;
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
    resetCountdown();
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
    if (!pauseButton) return;

    isPaused = !isPaused;

    if (isPaused) {
        elapsedMs += Date.now() - startTime;
        clearInterval(runningTimer);
        pauseButton.querySelector('span').textContent = 'Resume';
        pauseButton.classList.add('paused');
    } else {
        startTime = Date.now();
        updateTimer();
        pauseButton.querySelector('span').textContent = 'Pause timer';
        pauseButton.classList.remove('paused');
    }
}

function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;

    let secondsLeft = Math.floor(wakeInterval / 1000);

    clearInterval(countdownTimer);

    countdownTimer = setInterval(() => {
        secondsLeft--;
        countdownElement.textContent = secondsLeft;

        if (secondsLeft <= 0) {
            secondsLeft = Math.floor(wakeInterval / 1000);
        }
    }, 1000);
}

function resetCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;

    const secondsLeft = Math.floor(wakeInterval / 1000);
    countdownElement.textContent = secondsLeft;
}

function showError(message) {
    const errorElement = document.getElementById('interval-error');
    if (!errorElement) return;

    errorElement.textContent = message;
    errorElement.style.display = 'block';

    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 3000);
}

function updateWakeInterval() {
    const intervalInput = document.getElementById('interval');
    if (!intervalInput) return;

    const newInterval = parseInt(intervalInput.value);

    if (newInterval >= 5 && newInterval <= 300) {
        wakeInterval = newInterval * 1000;

        clearInterval(wakeTimer);
        clearInterval(countdownTimer);

        wakeTimer = setInterval(preventSleep, wakeInterval);

        resetCountdown();
        updateCountdown();
    } else {
        showError('Please enter a value between 5 and 300 seconds.');
        intervalInput.value = Math.floor(wakeInterval / 1000);
    }
}

function toggleDetails() {
    const detailsSection = document.getElementById('technical-details');
    const toggleButton = document.getElementById('details-toggle');

    if (!detailsSection || !toggleButton) return;

    detailsSection.classList.toggle('visible');
    toggleButton.classList.toggle('open');
}

function getRelativeTime(utcDateString) {
    const buildDate = new Date(utcDateString);
    const now = new Date();
    const diffMs = now - buildDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let relative;
    if (diffMins < 1) relative = 'just now';
    else if (diffMins < 60) relative = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    else if (diffHours < 24) relative = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    else relative = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    const localTime = buildDate.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    return `${relative} (${localTime})`;
}

async function initialize() {
    console.log(`%cNo Sleep App`, 'font-size: 16px; font-weight: bold; color: #2c3e50;');
    console.log(`Last updated: ${getRelativeTime(BUILD_TIMESTAMP)}`);

    wakeLockSupported = 'wakeLock' in navigator;

    if (wakeLockSupported) {
        console.log('Wake Lock API supported');
    } else {
        console.warn('Wake Lock API not supported in this browser');
        updateStatus(false);
    }

    const intervalInput = document.getElementById('interval');
    const updateButton = document.getElementById('update-interval');
    const toggleButton = document.getElementById('details-toggle');
    const pauseButton = document.getElementById('pause-toggle');
    const statusElement = document.querySelector('.status');

    if (intervalInput) {
        intervalInput.value = Math.floor(wakeInterval / 1000);
    }

    if (updateButton) {
        updateButton.addEventListener('click', updateWakeInterval);
    }

    if (toggleButton) {
        toggleButton.addEventListener('click', toggleDetails);
    }

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
    updateCountdown();
    updateTimer();
    preventSleep();

    await requestWakeLock();
}

window.onload = initialize;
