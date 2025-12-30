# Timestamp Goblin

Chrome extension (Manifest V3) that persistently saves and restores YouTube watch progress.

## Setup

```bash
npm install
npm run build
```

## Load unpacked

1) Open Chrome and go to `chrome://extensions`.
2) Enable "Developer mode".
3) Click "Load unpacked" and select the `dist/` folder.

## Notes

- The build outputs `dist/content.js` and `dist/manifest.json`.
- The popup UI is at `dist/popup.html` with `dist/popup.js` and `dist/popup.css`.
- No background service worker is required for the MVP.
