import { setTabCache, getTabCache, clearTabCache } from "./lib/cache.js";
import {
  normalizeHeuristicResult,
  computeFromHeuristic,
} from "./lib/finalScore.js";
import { setToolbar, setScanningState } from "./lib/iconManager.js";

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const TOKEN_KEY = "gpt5ExtensionToken";

// Show “Scanning…” while page is loading/navigating
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    setScanningState(tabId).catch((err) => {
      console.error("Failed to set scanning state:", err);
    });

    // Prevent stale popup data while new page loads.
    if (info.url) {
      clearTabCache(tabId);
    }
  }
});

// Cleanup cache when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabCache(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([TOGGLE_KEY], (res) => {
    if (res[TOGGLE_KEY] === undefined) {
      chrome.storage.local.set({ [TOGGLE_KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // 0) Content script sends heuristic result
  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;

    if (tabId != null) {
      const normalized = normalizeHeuristicResult(msg.result);

      setTabCache(tabId, normalized);

      const computed = computeFromHeuristic(normalized);
      setToolbar(tabId, computed).catch((err) => {
        console.error("Failed to update toolbar:", err);
      });
    }

    return;
  }

  // 0.5) Popup asks for heuristic result
  if (msg.type === "getHeuristic") {
    const tabId = msg.tabId;
    sendResponse({ ok: true, result: getTabCache(tabId) || null });
    return true;
  }

  // 1) Popup asks: what's toggle state?
  if (msg.type === "getStatus") {
    chrome.storage.local.get([TOGGLE_KEY], (res) => {
      sendResponse({ enabled: !!res[TOGGLE_KEY] });
    });
    return true;
  }

  // 2) Popup says: set toggle state
  if (msg.type === "setStatus") {
    chrome.storage.local.set({ [TOGGLE_KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // 3) Popup asks background to call your server
  if (msg.type === "analyzePolicy") {
    (async () => {
      try {
        const toggleRes = await chrome.storage.local.get([TOGGLE_KEY]);
        if (!toggleRes[TOGGLE_KEY]) {
          sendResponse({
            ok: false,
            error: "Analyzer is disabled. Turn it on first.",
          });
          return;
        }

        const stored = await chrome.storage.local.get([TOKEN_KEY]);
        const token = stored[TOKEN_KEY];

        if (!token) {
          sendResponse({
            ok: false,
            error: "Missing Extension Token. Paste it in the popup settings.",
          });
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
            error: data?.error || `HTTP ${r.status}`,
            details: data,
          });
          return;
        }

        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();

    return true;
  }
});