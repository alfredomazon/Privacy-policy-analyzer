// background.js (service worker)

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";

// MUST match what popup.js saves for the extension token input:
const TOKEN_KEY = "gpt5ExtensionToken";

// --- Heuristic cache (per tab) ---
const HEURISTIC_BY_TAB = {};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([TOGGLE_KEY], (res) => {
    if (res[TOGGLE_KEY] === undefined) {
      chrome.storage.local.set({ [TOGGLE_KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // ==============================
  // 0) Content script sends heuristic result
  // ==============================
  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      HEURISTIC_BY_TAB[tabId] = msg.result;
    }
    // no response needed
    return;
  }

  // ==============================
  // 0.5) Popup asks for heuristic result
  // ==============================
  if (msg.type === "getHeuristic") {
    const tabId = msg.tabId;
    sendResponse({ ok: true, result: HEURISTIC_BY_TAB[tabId] || null });
    return true;
  }

  // ==============================
  // 1) popup asks: what's toggle state?
  // ==============================
  if (msg.type === "getStatus") {
    chrome.storage.local.get([TOGGLE_KEY], (res) => {
      sendResponse({ enabled: !!res[TOGGLE_KEY] });
    });
    return true;
  }

  // ==============================
  // 2) popup says: set toggle state
  // ==============================
  if (msg.type === "setStatus") {
    chrome.storage.local.set({ [TOGGLE_KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // ==============================
  // 3) popup says: analyze this text (GPT mode)
  // ==============================
  if (msg.type === "analyzePolicy") {
    (async () => {
      try {
        // (Optional) block analyze if your toggle is off
        const toggleRes = await chrome.storage.local.get([TOGGLE_KEY]);
        if (!toggleRes[TOGGLE_KEY]) {
          sendResponse({ ok: false, error: "Analyzer is disabled. Turn it on first." });
          return;
        }

        // get extension token from storage (same place popup saves it)
        const stored = await chrome.storage.local.get([TOKEN_KEY]);
        const token = stored[TOKEN_KEY];

        if (!token) {
          sendResponse({ ok: false, error: "Missing Extension Token. Paste it in the popup settings." });
          return;
        }

        const r = await fetch(`${SERVER_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Extension-Token": token,
          },
          body: JSON.stringify({ text: msg.text }),
        });

        const data = await r.json().catch(() => null);

        if (!r.ok) {
          sendResponse({
            ok: false,
            error: (data && data.error) ? data.error : `HTTP ${r.status}`,
            details: data,
          });
          return;
        }

        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();

    return true; // keep channel open
  }
});
