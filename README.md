# Timestamp Goblin

Chrome extension (Manifest V3) that persistently saves and restores YouTube watch progress.

[Chrome Web Store Link](https://chromewebstore.google.com/detail/timestamp-goblin/amhjjgahmkpgmppkkddkcjflgkbhnfhj)

## Setup

```bash
npm install
npm run build
```

## Load unpacked

1. Open Chrome and go to `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `dist/` folder.

## Production build and packaging

```bash
# Minified build
npm run build:prod

# Zip ready for Chrome Web Store upload
npm run package
```
