# Test the native popup

Run `pnpm run test:popup` after changes to the popup layout. It builds the extension and opens the actual toolbar popup in a temporary Chrome profile with one sample video. The test checks the popup size, visible video area, footer, and storage rendering, then closes its test browser and removes the temporary profile.

The test uses an installed Chrome browser and Node.js. It adds no package dependencies. On macOS, it uses `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. On Linux, it uses `google-chrome` and needs a graphical session, such as Xvfb in CI. Set `BROWSER_BIN` to test another Chromium browser executable. The browser must support `Extensions.loadUnpacked` and `chrome.action.openPopup`.

The test does not set a viewport size. Chrome [sizes an extension popup from its content](https://developer.chrome.com/docs/extensions/reference/api/action#popup). Limiting the body to `100vw` or `100vh` during that initial size calculation can collapse it. A normal browser tab with a fixed viewport does not reproduce this failure. The popup therefore declares its width and height in pixels.

For diagnosis, `POPUP_DIST` can select an existing build folder and `POPUP_SCREENSHOT` can select an output PNG path when calling `node scripts/check-popup.mjs` directly.
