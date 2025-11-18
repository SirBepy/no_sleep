let wakeInterval = 30000; // Default 30 seconds
let countdownTimer;
let wakeTimer;

// Function to prevent sleep by performing a minimal operation
function preventSleep() {
    // Create a small, invisible canvas element and get its context
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    // Draw a tiny dot on the canvas (minimal GPU/CPU activity)
    if (ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.01)';
        ctx.fillRect(0, 0, 1, 1);
    }

    // Force a minimal DOM reflow
    document.body.classList.toggle('active-no-sleep');
    document.body.classList.toggle('active-no-sleep');

    // Reset countdown
    resetCountdown();
}

// Timer function to display running time
function updateTimer() {
    const timerElement = document.getElementById('time');
    let seconds = 0;
    let minutes = 0;
    let hours = 0;

    setInterval(() => {
        seconds++;
        if (seconds >= 60) {
            seconds = 0;
            minutes++;
            if (minutes >= 60) {
                minutes = 0;
                hours++;
            }
        }

        const displayHours = hours.toString().padStart(2, '0');
        const displayMinutes = minutes.toString().padStart(2, '0');
        const displaySeconds = seconds.toString().padStart(2, '0');

        timerElement.textContent = `${displayHours}:${displayMinutes}:${displaySeconds}`;
    }, 1000);
}

// Function to update the countdown timer
function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
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

// Function to reset the countdown timer
function resetCountdown() {
    const countdownElement = document.getElementById('countdown');
    let secondsLeft = Math.floor(wakeInterval / 1000);
    countdownElement.textContent = secondsLeft;
}

// Function to update the wake interval
function updateWakeInterval() {
    const intervalInput = document.getElementById('interval');
    const newInterval = parseInt(intervalInput.value);

    // Validate input
    if (newInterval >= 5 && newInterval <= 300) {
        wakeInterval = newInterval * 1000;

        // Clear existing timers
        clearInterval(wakeTimer);
        clearInterval(countdownTimer);

        // Set new timer
        wakeTimer = setInterval(preventSleep, wakeInterval);

        // Reset countdown
        resetCountdown();
        updateCountdown();
    } else {
        alert('Please enter a value between 5 and 300 seconds.');
        intervalInput.value = Math.floor(wakeInterval / 1000);
    }
}

// Toggle technical details section
function toggleDetails() {
    const detailsSection = document.getElementById('technical-details');
    const toggleButton = document.getElementById('details-toggle');

    detailsSection.classList.toggle('visible');
    toggleButton.classList.toggle('open');
}

// Set up event listeners
document.getElementById('update-interval').addEventListener('click', updateWakeInterval);
document.getElementById('details-toggle').addEventListener('click', toggleDetails);

// Initialize the page
function initialize() {
    // Set initial interval value
    document.getElementById('interval').value = Math.floor(wakeInterval / 1000);

    // Start the wake timer
    wakeTimer = setInterval(preventSleep, wakeInterval);

    // Start the countdown
    updateCountdown();

    // Start the running timer
    updateTimer();

    // Initial call to prevent sleep
    preventSleep();
}

// Initialize everything when the page loads
window.onload = initialize;
