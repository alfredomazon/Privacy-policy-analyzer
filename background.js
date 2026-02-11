const KEY = 'gpt5Enabled';
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const EXTENSION_TOKEN_KEY = "gpt5ServerToken";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([KEY], (res) => {
    if (res[KEY] === undefined) {
      chrome.storage.local.set({ [KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'getStatus') {
    chrome.storage.local.get([KEY], (res) => {
      sendResponse({ enabled: !!res[KEY] });
    });
    return true; // indicate async response
  }

  if (msg.type === 'setStatus') {
    chrome.storage.local.set({ [KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true; // indicate async response
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "analyzePolicy") return;

  (async () => {
    try {
      // get token from storage (same place your popup saves it)
      const stored = await chrome.storage.local.get([EXTENSION_TOKEN_KEY]);
      const token = stored[EXTENSION_TOKEN_KEY];

      if (!token) {
        sendResponse({ ok: false, error: "Missing Extension Token in settings." });
        return;
      }

      const r = await fetch(`${SERVER_URL}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Extension-Token": token
        },
        body: JSON.stringify({ text: msg.text })
      });

      const data = await r.json().catch(() => null);

      if (!r.ok) {
        sendResponse({
          ok: false,
          error: (data && data.error) ? data.error : `HTTP ${r.status}`,
          details: data
        });
        return;
      }

      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true; // IMPORTANT: keep the message channel open for async response
});
