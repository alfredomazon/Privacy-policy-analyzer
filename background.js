import { setTabCache, getTabCache, clearTabCache } from "./lib/cache.js";
import {
  normalizeHeuristicResult,
  computeFromHeuristic,
} from "./lib/finalScore.js";
import { setToolbar, setScanningState } from "./lib/iconManager.js";

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const TOKEN_KEY = "gpt5ExtensionToken";

// Manual protection storage
const MANUAL_SITE_RULES_KEY = "manualSiteRules";

const DEFAULT_MANUAL_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: false,
  disableTrackingLinks: false,
};

const TOOLBAR_STATE_BY_TAB = new Map();
const LAST_URL_BY_TAB = new Map();
const SCANNING_TABS = new Set();

function sameToolbarState(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    a.score === b.score &&
    a.issuesCount === b.issuesCount &&
    a.levelHint === b.levelHint &&
    a.summary === b.summary
  );
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
  LAST_URL_BY_TAB.delete(tabId);
  SCANNING_TABS.delete(tabId);
}

async function setScanningForTab(tabId) {
  if (SCANNING_TABS.has(tabId)) return;

  SCANNING_TABS.add(tabId);

  try {
    await setScanningState(tabId);
  } catch (err) {
    console.error("Failed to set scanning state:", err);
  }
}

function clearScanningForTab(tabId) {
  SCANNING_TABS.delete(tabId);
}

function getStoredToggleState() {
  return chrome.storage.local.get([TOGGLE_KEY]);
}

function getStoredToken() {
  return chrome.storage.local.get([TOKEN_KEY]);
}

function getHostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function getAllManualSiteRules() {
  const res = await chrome.storage.local.get([MANUAL_SITE_RULES_KEY]);
  return res[MANUAL_SITE_RULES_KEY] || {};
}

async function getManualRulesForHost(hostname) {
  const allRules = await getAllManualSiteRules();
  return {
    ...DEFAULT_MANUAL_RULES,
    ...(allRules[hostname] || {}),
  };
}

async function setManualRulesForHost(hostname, rules) {
  const allRules = await getAllManualSiteRules();

  allRules[hostname] = {
    blockTrackers: !!rules.blockTrackers,
    blockThirdPartyScripts: !!rules.blockThirdPartyScripts,
    blockIframes: !!rules.blockIframes,
    removeAds: !!rules.removeAds,
    disableTrackingLinks: !!rules.disableTrackingLinks,
  };

  await chrome.storage.local.set({
    [MANUAL_SITE_RULES_KEY]: allRules,
  });
}

/**
 * Placeholder for DNR sync.
 * Later you can import your DNR manager and call it here.
 */
async function syncManualProtectionRules(hostname, rules) {
  // Example future hook:
  // await syncDnrRulesForSite(hostname, rules);
  return;
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

function shouldResetForNavigation(tabId, info) {
  if (!info.url) return false;

  const previousUrl = LAST_URL_BY_TAB.get(tabId) || "";
  const nextUrl = info.url || "";

  if (!previousUrl) {
    LAST_URL_BY_TAB.set(tabId, nextUrl);
    return true;
  }

  if (previousUrl !== nextUrl) {
    LAST_URL_BY_TAB.set(tabId, nextUrl);
    return true;
  }

  return false;
}

function handleTabLoading(tabId, info) {
  setScanningForTab(tabId);

  if (shouldResetForNavigation(tabId, info)) {
    clearTabCache(tabId);
    TOOLBAR_STATE_BY_TAB.delete(tabId);
  }
}

// Show “Scanning…” while page is loading/navigating
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "loading") {
    handleTabLoading(tabId, info);
    return;
  }

  if (info.status === "complete") {
    clearScanningForTab(tabId);

    if (tab?.url) {
      LAST_URL_BY_TAB.set(tabId, tab.url);
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

  chrome.storage.local.get([MANUAL_SITE_RULES_KEY], (res) => {
    if (res[MANUAL_SITE_RULES_KEY] === undefined) {
      chrome.storage.local.set({ [MANUAL_SITE_RULES_KEY]: {} });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return false;

  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url || "";

    if (tabId == null) {
      return false;
    }

    const { normalized, computed } = safeComputeToolbarState(msg.result);

    try {
      setTabCache(tabId, tabUrl, normalized);
      if (tabUrl) {
        LAST_URL_BY_TAB.set(tabId, tabUrl);
      }
    } catch (err) {
      console.error("Failed to cache heuristic result:", err);
    }

    clearScanningForTab(tabId);
    updateToolbarIfChanged(tabId, computed);
    return false;
  }

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

  if (msg.type === "getStatus") {
    chrome.storage.local.get([TOGGLE_KEY], (res) => {
      sendResponse({ enabled: !!res[TOGGLE_KEY] });
    });
    return true;
  }

  if (msg.type === "setStatus") {
    chrome.storage.local.set({ [TOGGLE_KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_RULES_FOR_ACTIVE_TAB") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        const hostname = getHostnameFromUrl(tab?.url || "");

        if (!hostname) {
          sendResponse({
            ok: false,
            hostname: "",
            rules: { ...DEFAULT_MANUAL_RULES },
            error: "Unsupported page.",
          });
          return;
        }

        const rules = await getManualRulesForHost(hostname);

        sendResponse({
          ok: true,
          hostname,
          rules,
        });
      } catch (err) {
        console.error("Failed to get manual rules for active tab:", err);
        sendResponse({
          ok: false,
          hostname: "",
          rules: { ...DEFAULT_MANUAL_RULES },
          error: err?.message || "Unknown error.",
        });
      }
    })();

    return true;
  }

  if (msg.type === "SET_RULES_FOR_HOST") {
    (async () => {
      try {
        const hostname = String(msg.hostname || "").trim().toLowerCase();
        const rules = msg.rules || {};

        if (!hostname) {
          sendResponse({
            ok: false,
            error: "Missing hostname.",
          });
          return;
        }

        await setManualRulesForHost(hostname, rules);
        await syncManualProtectionRules(hostname, rules);

        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "RULES_UPDATED",
            hostname,
            rules: {
              ...DEFAULT_MANUAL_RULES,
              ...rules,
            },
          }).catch(() => {});
        }

        sendResponse({ ok: true });
      } catch (err) {
        console.error("Failed to save manual rules:", err);
        sendResponse({
          ok: false,
          error: err?.message || "Unknown error.",
        });
      }
    })();

    return true;
  }

  if (msg.type === "analyzePolicy") {
    (async () => {
      try {
        const text = typeof msg.text === "string" ? msg.text.trim() : "";

        if (!text) {
          sendResponse({
            ok: false,
            error: "No policy text was provided for analysis.",
          });
          return;
        }

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

        const result = await callAnalyzeServer(text, token);
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

  return false;
});