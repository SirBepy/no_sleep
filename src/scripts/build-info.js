// ============================================================
// BUILD INFO
// Reusable build metadata injection for GitHub Pages projects.
// ============================================================
//
// HOW TO USE IN A NEW PROJECT:
//
// 1. Copy this file into your project root (or src/ for React).
//
// 2. Add the following step to your GitHub Actions workflow,
//    placed *before* "Setup Pages" for vanilla, or before your
//    build command (npm run build) for React/Vite:
//
//      - name: Inject build info
//        run: |
//          BUILD_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
//          PROJECT=$(basename "$GITHUB_REPOSITORY")
//          BUILD_INFO=$(find . -name "build-info.js" -not -path "./.git/*")
//          sed -i "s|BUILD_TIMESTAMP_PLACEHOLDER|$BUILD_TIME|g" $BUILD_INFO
//          sed -i "s|PROJECT_NAME_PLACEHOLDER|$PROJECT|g" $BUILD_INFO
//
//    Using find means this works regardless of where build-info.js lives in your repo.
//
// 3a. Vanilla HTML — include this script tag (no other setup needed,
//     it logs to console automatically when the page loads):
//
//       <script type="module" src="build-info.js"></script>
//
// 3b. React/Vite — import it once in your entry point (main.jsx / index.jsx).
//     It logs automatically on import. Use the named exports if you also
//     want to display the values in a component:
//
//       import { PROJECT_NAME, BUILD_TIMESTAMP, getRelativeTime } from './build-info';
//
// NOTE: The placeholders below stay as-is in source. The workflow replaces
// them at deploy time only, so locally you'll see the raw placeholder strings.
// ============================================================

export const BUILD_TIMESTAMP = 'BUILD_TIMESTAMP_PLACEHOLDER';
export const PROJECT_NAME = 'PROJECT_NAME_PLACEHOLDER';

export function getRelativeTime(utcDateString) {
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

// Self-initialize: runs automatically when this module is loaded or imported.
console.log(`%c${PROJECT_NAME}`, 'font-size: 16px; font-weight: bold; color: #2c3e50;');
console.log(`Last updated: ${getRelativeTime(BUILD_TIMESTAMP)}`);
