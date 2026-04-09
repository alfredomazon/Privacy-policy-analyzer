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

function sameToolbarState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeComputeToolbarState(result) {
  try {
    const normalized = normalizeHeuristicResult(result);
    const computed = computeFromHeuristic(normalized);

    return {
      normalized,
      computed,
    };
  } catch (err) {
    console.error("Failed to normalize or compute toolbar state:", err);

    return {
      normalized: result || null,
      computed: {
        score: 0,
        issuesCount: 0,
        levelHint: "none",
        summary: "No analysis yet",
      },
    };
  }
}

async function updateToolbarIfChanged(tabId, computed) {
  const previousState = TOOLBAR_STATE_BY_TAB.get(tabId);

  if (sameToolbarState(previousState, computed)) {
    return;
  }

  TOOLBAR_STATE_BY_TAB.set(tabId, computed);

  try {
    await setToolbar(tabId, computed);
  } catch (err) {
    console.error("Failed to update toolbar:", err);
  }
}

function resetTabState(tabId) {
  clearTabCache(tabId);
  TOOLBAR_STATE_BY_TAB.delete(tabId);
}

async function setScanningForTab(tabId) {
  try {
    await setScanningState(tabId);
  } catch (err) {
    console.error("Failed to set scanning state:", err);
  }
}

function getStoredToggleState() {
  return chrome.storage.local.get([TOGGLE_KEY]);
}

function getStoredToken() {
  return chrome.storage.local.get([TOKEN_KEY]);
}

async function callAnalyzeServer(text, token) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${SERVER_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Token": token,
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || `HTTP ${response.status}`,
        details: data,
      };
    }

    return {
      ok: true,
      data,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Show “Scanning…” while page is loading/navigating
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    setScanningForTab(tabId);

    // Only clear cached result when the URL actually changes.
    if (info.url) {
      resetTabState(tabId);
    }
  }
});

// Cleanup cache when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  resetTabState(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([TOGGLE_KEY], (res) => {
    if (res[TOGGLE_KEY] === undefined) {
      chrome.storage.local.set({ [TOGGLE_KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  // Content script sends heuristic result
  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url || "";

    if (tabId == null) {
      return;
    }

    const { normalized, computed } = safeComputeToolbarState(msg.result);

    try {
      setTabCache(tabId, tabUrl, normalized);
    } catch (err) {
      console.error("Failed to cache heuristic result:", err);
    }

    updateToolbarIfChanged(tabId, computed);
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

      try {
        const result = getTabCache(tabId, tab.url || "");
        sendResponse({ ok: true, result: result || null });
      } catch (err) {
        console.error("Failed to read cached heuristic result:", err);
        sendResponse({ ok: true, result: null });
      }
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
        const toggleRes = await getStoredToggleState();

        if (!toggleRes[TOGGLE_KEY]) {
          sendResponse({
            ok: false,
            error: "Analyzer is disabled. Turn it on first.",
          });
          return;
        }

        const stored = await getStoredToken();
        const token = stored[TOKEN_KEY];

        if (!token) {
          sendResponse({
            ok: false,
            error: "Missing Extension Token. Paste it in the popup settings.",
          });
          return;
        }

        const result = await callAnalyzeServer(msg.text, token);
        sendResponse(result);
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