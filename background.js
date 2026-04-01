import { setTabCache, getTabCache, clearTabCache } from "./lib/cache.js";
import {
  normalizeHeuristicResult,
  computeFromHeuristic,
} from "./lib/finalScore.js";
import { setToolbar, setScanningState } from "./lib/iconManager.js";

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const TOKEN_KEY = "gpt5ExtensionToken";

const TOOLBAR_STATE_BY_TAB = new Map();

// Show “Scanning…” while page is loading/navigating
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    setScanningState(tabId).catch((err) => {
      console.error("Failed to set scanning state:", err);
    });

    // Only clear cached result when the tab URL actually changes.
    if (info.url) {
      clearTabCache(tabId);
      TOOLBAR_STATE_BY_TAB.delete(tabId);
    }
  }
});

// Cleanup cache when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabCache(tabId);
  TOOLBAR_STATE_BY_TAB.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([TOGGLE_KEY], (res) => {
    if (res[TOGGLE_KEY] === undefined) {
      chrome.storage.local.set({ [TOGGLE_KEY]: false });
    }
  });
});

function sameToolbarState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  // Content script sends heuristic result
  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url || "";

    if (tabId != null) {
      const normalized = normalizeHeuristicResult(msg.result);
      setTabCache(tabId, tabUrl, normalized);

      const computed = computeFromHeuristic(normalized);
      const previousState = TOOLBAR_STATE_BY_TAB.get(tabId);

      if (!sameToolbarState(previousState, computed)) {
        TOOLBAR_STATE_BY_TAB.set(tabId, computed);

        setToolbar(tabId, computed).catch((err) => {
          console.error("Failed to update toolbar:", err);
        });
      }
    }

    return;
  }

  // Popup asks for cached heuristic result
  if (msg.type === "getHeuristic") {
    const tabId = msg.tabId;

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ ok: true, result: null });
        return;
      }

      const result = getTabCache(tabId, tab.url || "");
      sendResponse({ ok: true, result: result || null });
    });

    return true;
  }

  // Popup asks for toggle state
  if (msg.type === "getStatus") {
    chrome.storage.local.get([TOGGLE_KEY], (res) => {
      sendResponse({ enabled: !!res[TOGGLE_KEY] });
    });
    return true;
  }

  // Popup sets toggle state
  if (msg.type === "setStatus") {
    chrome.storage.local.set({ [TOGGLE_KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Popup asks background to call server
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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const r = await fetch(`${SERVER_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Extension-Token": token,
          },
          body: JSON.stringify({ text: msg.text }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

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
        sendResponse({
          ok: false,
          error:
            err?.name === "AbortError"
              ? "Analysis request timed out."
              : err?.message || String(err),
        });
      }
    })();

    return true;
  }
});