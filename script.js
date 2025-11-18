const BUILD_TIMESTAMP = 'BUILD_TIMESTAMP_PLACEHOLDER';

let wakeInterval = 30000;
let countdownTimer;
let wakeTimer;
let runningTimer;
let startTime;

function preventSleep() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    if (ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        ctx.fillRect(0, 0, 1, 1);
    }

    document.body.classList.toggle('active-no-sleep');
    document.body.classList.toggle('active-no-sleep');

    resetCountdown();
}

function updateTimer() {
    const timerElement = document.getElementById('time');
    if (!timerElement) return;

    runningTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const totalSeconds = Math.floor(elapsed / 1000);

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const displayHours = hours.toString().padStart(2, '0');
        const displayMinutes = minutes.toString().padStart(2, '0');
        const displaySeconds = seconds.toString().padStart(2, '0');

        timerElement.textContent = `${displayHours}:${displayMinutes}:${displaySeconds}`;
    }, 1000);
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

function initialize() {
    console.log(`%cNo Sleep App`, 'font-size: 16px; font-weight: bold; color: #2c3e50;');
    console.log(`Last updated: ${BUILD_TIMESTAMP}`);

    const intervalInput = document.getElementById('interval');
    const updateButton = document.getElementById('update-interval');
    const toggleButton = document.getElementById('details-toggle');

    if (intervalInput) {
        intervalInput.value = Math.floor(wakeInterval / 1000);
    }

    if (updateButton) {
        updateButton.addEventListener('click', updateWakeInterval);
    }

    if (toggleButton) {
        toggleButton.addEventListener('click', toggleDetails);
    }

    startTime = Date.now();

    wakeTimer = setInterval(preventSleep, wakeInterval);
    updateCountdown();
    updateTimer();
    preventSleep();
}

window.onload = initialize;
