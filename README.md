GPT-5 Mini Toggle (Chrome Extension - UI only)

What this extension does
- Provides a popup UI with a toggle labeled "Enable GPT-5 mini for all clients".
- Persists the setting locally using `chrome.storage.local` and exposes it to the background service worker via messages.

Important
- This extension only stores and exposes a local setting; it does NOT perform any server-side changes to actually enable GPT-5 mini for clients. Enabling GPT-5 mini across clients requires changes on the server-side or admin control-plane and appropriate authentication.

Load locally (unpacked)
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select this folder (where `manifest.json` lives).
4. Click the extension icon to open the popup and toggle the setting.

Files
- `manifest.json` — extension manifest (MV3).
- `background.js` — service worker managing the `gpt5Enabled` setting.
- `popup.html`, `popup.js`, `popup.css` — popup UI and logic.
- `icons/` — placeholder SVG icons.

Next steps (optional)
- Wire the toggle to an authenticated admin API to enact server-side changes.
- Replace placeholder icons with production PNGs.
- Add telemetry or user confirmation flows if necessary.
 
Server demo
- A simple demo admin server is included at `server/` that exposes `GET /status` and `POST /status` for toggling the flag. It requires an `X-Admin-Token` header when POSTing. See `server/README.md` for run instructions.
