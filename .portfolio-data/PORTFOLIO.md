## The What

No Sleep is a browser-based utility that prevents your computer from going to sleep. Open the page, leave the tab running, and your machine stays awake. It shows a live timer so you know how long it has been active, and includes a technical details panel where you can adjust the wake interval or pause the timer.

## The Why

Sometimes you need your computer to stay awake without installing software or changing system settings. Maybe you are running a long download, presenting on a shared screen, or keeping a remote session alive. No Sleep solves this with zero setup: just open a URL.

## The How

The page uses the Screen Wake Lock API, which is the browser-native way to request that the system stay awake. When the API is supported, it acquires a wake lock on page load and re-acquires it whenever the tab regains visibility (since browsers release wake locks when a tab is hidden). For transparency, the technical details panel shows a countdown to the next periodic wake function call and lets you adjust the interval.
