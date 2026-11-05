## Project

Type: html
Deploy: github-pages

## Structure

index.html, sw.js, src/scripts/script.js (timer, wake lock, session saving), src/scripts/sessions.js (pure logic), src/scripts/history.js (History and Add entry dialogs), src/scripts/store.js (Firebase), src/scripts/firebase-config.js, src/scripts/build-info.js, src/styles/styles.css, tests/sessions.test.js, assets/favicon.ico

## Rules

- No build step, no npm
- Page uses Wake Lock API to prevent system sleep
- Time tracking: Google sign-in plus Firestore at `users/{uid}/noSleepSessions/{id}` in the shared `generic-sirbepy-project` (the existing `users/{uid}/**` rule covers it, do not deploy rules from here). Firebase SDK comes from the gstatic CDN, pinned in `store.js`, and loads lazily so the timer and wake lock never depend on it.
- Pure logic goes in `sessions.js` and is tested with `node --test` (no dependencies)
