import { setTabCache, getTabCache, clearTabCache } from "./lib/cache.js";
import {
  normalizeHeuristicResult,
  computeFromHeuristic,
  scoreToLevel,
} from "./lib/finalScore.js";
import { setToolbar, setScanningState } from "./lib/iconManager.js";
import { classifyTrackerUrl } from "./lib/trackerRegistry.js";
import { buildDynamicProtectionRulesForHost } from "./lib/protectionRules.js";

// Manual protection storage
const MANUAL_SITE_RULES_KEY = "manualSiteRules";
const MANUAL_DNR_RULE_IDS_KEY = "manualDnrRuleIds";
const DNR_RULE_ID_START = 10000;

const DEFAULT_MANUAL_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: true,
  disableTrackingLinks: false,
  blockScamPopups: true,
};

const TOOLBAR_STATE_BY_TAB = new Map();
const LAST_URL_BY_TAB = new Map();
const SCANNING_TABS = new Set();
const NETWORK_TRACKER_SIGNALS_BY_TAB = new Map();
const PROTECTION_ACTIVITY_BY_TAB = new Map();
const LAST_PROTECTION_ACTIVITY_BY_TAB = new Map();
const PROTECTION_MUTATED_TABS = new Set();
const MAX_NETWORK_TRACKER_SIGNALS = 80;
const PENDING_POLICY_EVIDENCE_BY_TAB = new Map();
const POLICY_EVIDENCE_RETRY_DELAYS = [250, 700, 1400, 2600, 4200];

function sendTabMessageSafely(tabId, message) {
  if (tabId == null || tabId < 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

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

function safeComputeToolbarState(result, { protectionActivity = null } = {}) {
  try {
    const input =
      protectionActivity && result
        ? {
            ...result,
            protectionActivity,
          }
        : result;
    const normalized = normalizeHeuristicResult(input);
    const computed = computeFromHeuristic(normalized);
    const toolbarLevel = scoreToLevel(computed.score);

    return {
      normalized:
        normalized && typeof normalized === "object"
          ? {
              ...normalized,
              toolbarState: {
                ...computed,
                level: toolbarLevel,
              },
            }
          : normalized,
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

async function updateToolbarIfChanged(tabId, computed, { force = false } = {}) {
  const previousState = TOOLBAR_STATE_BY_TAB.get(tabId);

  if (!force && sameToolbarState(previousState, computed)) {
    return;
  }

  TOOLBAR_STATE_BY_TAB.set(tabId, computed);

  try {
    await setToolbar(tabId, computed);
  } catch (err) {
    console.error("Failed to update toolbar:", err);
  }
}

function cacheHeuristicForTab(
  tabId,
  tabUrl,
  result,
  { forceToolbar = false } = {}
) {
  if (tabId == null) return null;

  const rawNormalized = normalizeHeuristicResult(result);
  const { normalized, computed } = safeComputeToolbarState(rawNormalized, {
    protectionActivity: getProtectionActivity(tabId),
  });

  try {
    setTabCache(tabId, tabUrl || "", rawNormalized);
    if (tabUrl) {
      LAST_URL_BY_TAB.set(tabId, tabUrl);
    }
  } catch (err) {
    console.error("Failed to cache heuristic result:", err);
  }

  clearScanningForTab(tabId);
  updateToolbarIfChanged(tabId, computed, { force: forceToolbar });
  return normalized;
}

async function requestHeuristicFromTab(
  tabId,
  { force = false, forceToolbar = false } = {}
) {
  if (tabId == null) return null;

  const response = await sendTabMessageSafely(tabId, {
    type: "REQUEST_HEURISTIC_RESULT",
    force,
  });

  if (!response?.ok || !response.result) return null;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return cacheHeuristicForTab(tabId, tab?.url || "", response.result, {
    forceToolbar,
  });
}

function resetTabState(tabId) {
  clearTabCache(tabId);
  TOOLBAR_STATE_BY_TAB.delete(tabId);
  LAST_URL_BY_TAB.delete(tabId);
  SCANNING_TABS.delete(tabId);
  clearNetworkTrackerSignals(tabId);
  clearProtectionActivity(tabId);
  PROTECTION_MUTATED_TABS.delete(tabId);
  clearPendingPolicyEvidence(tabId);
}

async function setScanningForTab(tabId) {
  if (SCANNING_TABS.has(tabId)) return;

  SCANNING_TABS.add(tabId);
  TOOLBAR_STATE_BY_TAB.delete(tabId);

  try {
    await setScanningState(tabId);
  } catch (err) {
    console.error("Failed to set scanning state:", err);
  }
}

function clearScanningForTab(tabId) {
  SCANNING_TABS.delete(tabId);
}

function getHostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getNetworkTrackerSignals(tabId) {
  return NETWORK_TRACKER_SIGNALS_BY_TAB.get(tabId) || [];
}

function clearNetworkTrackerSignals(tabId) {
  NETWORK_TRACKER_SIGNALS_BY_TAB.delete(tabId);
}

function clearProtectionActivity(tabId) {
  PROTECTION_ACTIVITY_BY_TAB.delete(tabId);
  LAST_PROTECTION_ACTIVITY_BY_TAB.delete(tabId);
}

function getProtectionActivity(tabId) {
  return PROTECTION_ACTIVITY_BY_TAB.get(tabId) || {
    active: false,
    scanCompleted: false,
    counts: { total: 0 },
    items: [],
  };
}

function hasActiveManualRules(rules = {}) {
  return Object.values({ ...DEFAULT_MANUAL_RULES, ...(rules || {}) }).some(Boolean);
}

function getActiveProtectionRuleSet(rules = {}) {
  const merged = { ...DEFAULT_MANUAL_RULES, ...(rules || {}) };
  return new Set(
    Object.entries(merged)
      .filter(([, enabled]) => !!enabled)
      .map(([key]) => key)
  );
}

function filterProtectionItemsForRules(items = [], rules = {}) {
  const activeRules = getActiveProtectionRuleSet(rules);
  if (!activeRules.size) return [];

  return items.filter((item) => {
    const rule = String(item?.rule || "");
    return !rule || activeRules.has(rule);
  });
}

function protectionItemMatchesActiveRule(item = {}, activeRules = new Set()) {
  const rule = String(item?.rule || "");
  return activeRules.size > 0 && (!rule || activeRules.has(rule));
}

function countProtectionItems(items = []) {
  return items.reduce((acc, item) => {
    const count = Number(item.count || 1);
    acc.total += count;
    acc[item.kind || "resource"] =
      (acc[item.kind || "resource"] || 0) + count;
    return acc;
  }, { total: 0 });
}

function enrichProtectionActivityItem(item = {}, pageHostname = "") {
  const url = typeof item.url === "string" ? item.url : "";
  const classified = url
    ? classifyTrackerUrl({
        url,
        pageHostname,
        sourceType: "protection",
        requestType: item.requestType || item.kind || "",
      })
    : null;

  if (!classified) return item;

  return {
    ...item,
    trackerId: item.trackerId || classified.id || "",
    vendor: item.vendor || classified.vendor || "",
    purpose: item.purpose || classified.purpose || "",
    category: item.category || classified.category || "",
    severity: item.severity || classified.severity || "",
    confidence: item.confidence || classified.confidence || "",
  };
}

function rememberProtectionActivity(tabId, tabUrl, activity = {}) {
  if (tabId == null || tabId < 0) return;

  const pageHostname = getHostnameFromUrl(tabUrl || LAST_URL_BY_TAB.get(tabId) || "");
  const rules = { ...DEFAULT_MANUAL_RULES, ...(activity.rules || {}) };
  const active = !!activity.active && hasActiveManualRules(rules);
  const activeRules = getActiveProtectionRuleSet(rules);
  let items = Array.isArray(activity.items)
    ? activity.items
        .map((item) => enrichProtectionActivityItem(item, pageHostname))
        .filter((item) => protectionItemMatchesActiveRule(item, activeRules))
        .slice(0, 80)
    : [];

  if (active && !items.length) {
    const previous = LAST_PROTECTION_ACTIVITY_BY_TAB.get(tabId);
    items = filterProtectionItemsForRules(previous?.items || [], rules);
  }

  const counts = countProtectionItems(items);
  const snapshot = {
    active,
    scanCompleted: activity.scanCompleted === true,
    rules,
    counts,
    items,
    updatedAt: activity.updatedAt || Date.now(),
  };

  PROTECTION_ACTIVITY_BY_TAB.set(tabId, snapshot);

  if (!active) {
    LAST_PROTECTION_ACTIVITY_BY_TAB.delete(tabId);
  }

  if (active && items.length) {
    PROTECTION_MUTATED_TABS.add(tabId);
    LAST_PROTECTION_ACTIVITY_BY_TAB.set(tabId, snapshot);
  }
}

function refreshToolbarFromCachedResult(tabId, tabUrl = "", { force = false } = {}) {
  if (tabId == null) return;

  const url = tabUrl || LAST_URL_BY_TAB.get(tabId) || "";
  const cached = getTabCache(tabId, url);
  if (!cached) return;

  const { computed } = safeComputeToolbarState(cached, {
    protectionActivity: getProtectionActivity(tabId),
  });

  updateToolbarIfChanged(tabId, computed, { force });
}

async function notifyProtectionAfterScan(tabId, tabUrl) {
  if (tabId == null || tabId < 0) return;

  const hostname = getHostnameFromUrl(tabUrl || "");
  if (!hostname) return;

  const rules = await getManualRulesForHost(hostname);
  await sendTabMessageSafely(tabId, {
    type: "APPLY_PROTECTION_AFTER_SCAN",
    hostname,
    rules,
  });
}

function rememberPendingPolicyEvidence(tabId, payload) {
  if (tabId == null || !payload?.quote) return;

  PENDING_POLICY_EVIDENCE_BY_TAB.set(tabId, {
    quote: String(payload.quote || ""),
    url: String(payload.url || ""),
    createdAt: Date.now(),
  });
}

function clearPendingPolicyEvidence(tabId) {
  PENDING_POLICY_EVIDENCE_BY_TAB.delete(tabId);
}

function schedulePolicyEvidenceHighlight(tabId, attempt = 0) {
  const delay = POLICY_EVIDENCE_RETRY_DELAYS[attempt];
  if (delay == null) return;

  setTimeout(() => {
    sendPendingPolicyEvidenceToTab(tabId, attempt);
  }, delay);
}

async function sendPendingPolicyEvidenceToTab(tabId, attempt = 0) {
  const pending = PENDING_POLICY_EVIDENCE_BY_TAB.get(tabId);
  if (!pending) return;

  try {
    const response = await sendTabMessageSafely(tabId, {
      type: "HIGHLIGHT_POLICY_EVIDENCE",
      ...pending,
    });

    if (response?.ok) {
      clearPendingPolicyEvidence(tabId);
      return;
    }
  } catch {
    // The content script may not be loaded yet. Retry briefly below.
  }

  schedulePolicyEvidenceHighlight(tabId, attempt + 1);
}

function getNetworkSignalKey(signal) {
  return [
    signal.id || signal.vendor || "",
    signal.sourceType || "",
    signal.requestType || "",
    signal.hostname || "",
    signal.url || "",
  ].join("|");
}

function rememberNetworkTrackerSignal(tabId, signal) {
  if (tabId == null || tabId < 0 || !signal) return;

  const current = NETWORK_TRACKER_SIGNALS_BY_TAB.get(tabId) || [];
  const nextKey = getNetworkSignalKey(signal);

  if (current.some((item) => getNetworkSignalKey(item) === nextKey)) {
    return;
  }

  const next = [
    ...current,
    {
      ...signal,
      sourceType: signal.sourceType || "network",
      observedAt: Date.now(),
    },
  ].slice(-MAX_NETWORK_TRACKER_SIGNALS);

  NETWORK_TRACKER_SIGNALS_BY_TAB.set(tabId, next);
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
    blockScamPopups: !!rules.blockScamPopups,
  };

  await chrome.storage.local.set({
    [MANUAL_SITE_RULES_KEY]: allRules,
  });
}

async function getStoredDnrRuleIds() {
  const res = await chrome.storage.local.get([MANUAL_DNR_RULE_IDS_KEY]);
  return res[MANUAL_DNR_RULE_IDS_KEY] || {};
}

async function setStoredDnrRuleIds(value) {
  await chrome.storage.local.set({
    [MANUAL_DNR_RULE_IDS_KEY]: value || {},
  });
}

function nextDnrRuleStart(existingMap = {}) {
  const used = Object.values(existingMap)
    .flat()
    .map((value) => Number(value))
    .filter(Number.isFinite);

  if (!used.length) return DNR_RULE_ID_START;
  return Math.max(...used) + 1;
}

function isOwnedDnrRuleId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id >= DNR_RULE_ID_START;
}

function uniqueDnrRuleIds(values = []) {
  return [...new Set(values.map(Number).filter(isOwnedDnrRuleId))];
}

async function getOwnedDynamicRules() {
  if (!chrome.declarativeNetRequest?.getDynamicRules) return [];

  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return Array.isArray(rules)
      ? rules.filter((rule) => isOwnedDnrRuleId(rule?.id))
      : [];
  } catch {
    return [];
  }
}

async function getOwnedDynamicRuleIdsForHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return [];

  const rules = await getOwnedDynamicRules();
  return rules
    .filter((rule) => {
      const initiators = rule?.condition?.initiatorDomains || [];
      return initiators.includes(host);
    })
    .map((rule) => rule.id);
}

async function syncManualProtectionRules(hostname, rules) {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;

  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return;

  const existingMap = await getStoredDnrRuleIds();
  const orphanRuleIds = await getOwnedDynamicRuleIdsForHost(host);
  const removeRuleIds = uniqueDnrRuleIds([
    ...(Array.isArray(existingMap[host]) ? existingMap[host] : []),
    ...orphanRuleIds,
  ]);
  const startId = nextDnrRuleStart(existingMap);
  const addRules = buildDynamicProtectionRulesForHost({
    hostname: host,
    rules: { ...DEFAULT_MANUAL_RULES, ...(rules || {}) },
    startId,
  }).map(({ _filterId, ...rule }) => rule);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });

  const nextMap = { ...existingMap };
  if (addRules.length) {
    nextMap[host] = addRules.map((rule) => rule.id);
  } else {
    delete nextMap[host];
  }

  await setStoredDnrRuleIds(nextMap);
}

async function syncAllManualProtectionRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;

  const allRules = await getAllManualSiteRules();
  const existingMap = await getStoredDnrRuleIds();
  const ownedRuleIds = (await getOwnedDynamicRules()).map((rule) => rule.id);
  const removeRuleIds = uniqueDnrRuleIds([
    ...Object.values(existingMap).flat(),
    ...ownedRuleIds,
  ]);
  const nextMap = {};
  const addRules = [];
  let nextId = DNR_RULE_ID_START;

  for (const [hostname, rules] of Object.entries(allRules)) {
    const built = buildDynamicProtectionRulesForHost({
      hostname,
      rules: { ...DEFAULT_MANUAL_RULES, ...(rules || {}) },
      startId: nextId,
    });

    if (!built.length) continue;

    addRules.push(...built.map(({ _filterId, ...rule }) => rule));
    nextMap[hostname] = built.map((rule) => rule.id);
    nextId = Math.max(...nextMap[hostname]) + 1;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });
  await setStoredDnrRuleIds(nextMap);
}

async function fetchLinkedPolicyDocument(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return {
        ok: false,
        error: "not_html",
      };
    }

    const html = await response.text();
    if (!html) {
      return {
        ok: false,
        error: "empty_html",
      };
    }

    return {
      ok: true,
      url: response.url || url,
      html,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "timeout"
          : err?.message || String(err),
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
    clearNetworkTrackerSignals(tabId);
    clearProtectionActivity(tabId);
    PROTECTION_MUTATED_TABS.delete(tabId);
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

chrome.tabs.onActivated.addListener(({ tabId }) => {
  requestHeuristicFromTab(tabId, { forceToolbar: true }).catch(() => null);
});

// Cleanup cache when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  resetTabState(tabId);
});

if (chrome.webRequest?.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId == null || details.tabId < 0) return;
      if (details.type === "main_frame") return;

      const pageUrl =
        LAST_URL_BY_TAB.get(details.tabId) ||
        details.documentUrl ||
        details.initiator ||
        "";
      const pageHostname = getHostnameFromUrl(pageUrl);
      if (!pageHostname) return;

      const signal = classifyTrackerUrl({
        url: details.url,
        pageHostname,
        sourceType: "network",
        requestType: details.type || "",
      });

      if (signal) {
        rememberNetworkTrackerSignal(details.tabId, signal);
      }
    },
    { urls: ["<all_urls>"] }
  );
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([MANUAL_SITE_RULES_KEY], (res) => {
    if (res[MANUAL_SITE_RULES_KEY] === undefined) {
      chrome.storage.local.set({ [MANUAL_SITE_RULES_KEY]: {} });
    }
  });

  syncAllManualProtectionRules().catch((err) => {
    console.error("Failed to sync protection network rules:", err);
  });
});

chrome.runtime.onStartup?.addListener(() => {
  syncAllManualProtectionRules().catch((err) => {
    console.error("Failed to sync protection network rules:", err);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && PENDING_POLICY_EVIDENCE_BY_TAB.has(tabId)) {
    sendPendingPolicyEvidenceToTab(tabId, 0);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return false;

  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url || "";

    if (tabId == null) {
      return false;
    }

    cacheHeuristicForTab(tabId, tabUrl, msg.result);
    notifyProtectionAfterScan(tabId, tabUrl);
    return false;
  }

  if (msg.type === "getHeuristic") {
    (async () => {
      const tabId = msg.tabId;
      const tab = await chrome.tabs.get(tabId).catch(() => null);

      if (!tab) {
        sendResponse({ ok: true, result: null });
        return;
      }

      try {
        const cached = getTabCache(tabId, tab.url || "");
        const protectionActivity = getProtectionActivity(tabId);
        const protectionHasActed =
          Number(protectionActivity?.counts?.total || 0) > 0;
        const pageWasMutatedByProtection = PROTECTION_MUTATED_TABS.has(tabId);

        if (
          cached &&
          (!msg.force || protectionHasActed || pageWasMutatedByProtection)
        ) {
          const { normalized, computed } = safeComputeToolbarState(cached, {
            protectionActivity,
          });
          updateToolbarIfChanged(tabId, computed, {
            force: !!msg.repaintToolbar,
          });
          sendResponse({ ok: true, result: normalized });
          return;
        }

        const refreshed = await requestHeuristicFromTab(tabId, {
          force: !!msg.force,
          forceToolbar: true,
        });

        sendResponse({ ok: true, result: refreshed || cached || null });
      } catch (err) {
        console.error("Failed to read cached heuristic result:", err);
        sendResponse({ ok: true, result: null });
      }
    })();

    return true;
  }

  if (msg.type === "GET_TRACKER_NETWORK_SIGNALS") {
    const tabId = sender.tab?.id ?? msg.tabId;

    sendResponse({
      ok: true,
      signals: tabId == null ? [] : getNetworkTrackerSignals(tabId),
    });
    return false;
  }

  if (msg.type === "PROTECTION_ACTIVITY") {
    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url || "";

    if (tabId != null) {
      rememberProtectionActivity(tabId, tabUrl, msg.activity || {});
      refreshToolbarFromCachedResult(tabId, tabUrl, { force: true });
    }

    return false;
  }

  if (msg.type === "GET_PROTECTION_ACTIVITY") {
    const tabId = msg.tabId;
    sendResponse({
      ok: true,
      activity: tabId == null ? getProtectionActivity(null) : getProtectionActivity(tabId),
    });
    return false;
  }

  if (msg.type === "OPEN_POLICY_EVIDENCE") {
    (async () => {
      try {
        const url = typeof msg.url === "string" ? msg.url.trim() : "";
        const quote = typeof msg.quote === "string" ? msg.quote.trim() : "";

        if (!url || !quote) {
          sendResponse({
            ok: false,
            error: "Missing policy URL or evidence quote.",
          });
          return;
        }

        const tab = await chrome.tabs.create({ url });
        rememberPendingPolicyEvidence(tab.id, {
          quote,
          url,
        });
        schedulePolicyEvidenceHighlight(tab.id, 0);

        sendResponse({ ok: true, tabId: tab.id });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || String(err),
        });
      }
    })();

    return true;
  }

  if (msg.type === "REQUEST_PENDING_POLICY_EVIDENCE") {
    const tabId = sender.tab?.id;
    const pending =
      tabId == null ? null : PENDING_POLICY_EVIDENCE_BY_TAB.get(tabId);

    sendResponse({
      ok: true,
      pending: pending || null,
    });
    return false;
  }

  if (msg.type === "POLICY_EVIDENCE_HIGHLIGHT_RESULT") {
    if (sender.tab?.id != null && msg.ok) {
      clearPendingPolicyEvidence(sender.tab.id);
    }

    return false;
  }

  if (msg.type === "GET_RULES_FOR_ACTIVE_TAB") {
    (async () => {
      try {
        const tab =
          sender.tab ||
          (await chrome.tabs
            .query({
              active: true,
              currentWindow: true,
            })
            .then((tabs) => tabs[0]));

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

        if (tab?.id != null) {
          const mergedRules = {
            ...DEFAULT_MANUAL_RULES,
            ...rules,
          };

          await sendTabMessageSafely(tab.id, {
            type: "RULES_UPDATED",
            hostname,
            rules: mergedRules,
          });

          const existingActivity = getProtectionActivity(tab.id);
          rememberProtectionActivity(tab.id, tab.url || "", {
            active: hasActiveManualRules(mergedRules),
            scanCompleted: existingActivity?.scanCompleted === true,
            rules: mergedRules,
            items: existingActivity?.items || [],
            updatedAt: Date.now(),
          });
          refreshToolbarFromCachedResult(tab.id, tab.url || "", { force: true });
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

  if (msg.type === "FETCH_LINKED_POLICY_DOCUMENT") {
    (async () => {
      try {
        const url = typeof msg.url === "string" ? msg.url.trim() : "";

        if (!url) {
          sendResponse({
            ok: false,
            error: "Missing URL.",
          });
          return;
        }

        const result = await fetchLinkedPolicyDocument(url);
        sendResponse(result);
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || String(err),
        });
      }
    })();

    return true;
  }

  return false;
});
