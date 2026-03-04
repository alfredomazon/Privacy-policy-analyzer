privacy-policy-analyzer

What this extension does
- Provides a popup UI with a toggle labeled "Enable GPT-5 mini for all clients".
- Persists the setting locally using `chrome.storage.local` and exposes it to the background service worker via messages.
- Chrome extension popup
- User pastes privacy policy text
- User clicks **Analyze**
- Extension sends the text to https://privacy-policy-analyzer-1.onrender.com
- Server calls OpenAI
- Server returns structured results
- Extension displays results

System Architecture

The project has **two main components**:

### A) Chrome Extension (Frontend)
Contains:
- popup UI (`popup.html`, `popup.css`)
- popup logic (`popup.js`)
- background service worker (`background.js`)

Responsibilities:
- UI + user interaction
- store token locally
- send requests to server
- show results

### B) Node.js + Express Server (Backend)
Contains:
- Express server (`server/server.js`)
- dependencies (`server/package.json`)

Responsibilities:
- validate incoming token
- call OpenAI securely
- return JSON response
- rate-limit requests
- allow optional server toggle `/status`

---

Important
- This extension stores and exposes a local setting; Enabling GPT-5 mini across clients requires changes on the server-side or admin control-plane and appropriate authentication.


Why it was built this Way

### The key security issue
If you put an OpenAI API key inside:

- `popup.js`
- `background.js`
- `manifest.json`

…then anyone can extract the key and drain your credits.

### The correct solution
Instead, the extension calls **https://privacy-policy-analyzer-1.onrender.com**, and the server calls OpenAI.

This keeps your OpenAI key private and lets user control:

- rate limits
- abuse protection
- enabling/disabling AI



Load locally (unpacked)
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select this folder (where `manifest.json` lives).
4. Click the extension icon to open the popup and toggle the setting.

