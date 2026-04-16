// In-memory cache: Map<tabId, Map<normalizedUrl, { data, timestamp }>>
const CACHE = new Map();

const TTL = 1000 * 60 * 3; // 3 minutes
const MAX_ENTRIES_PER_TAB = 5; // prevent memory bloat

function normalizeUrl(url = "") {
  try {
    const u = new URL(url);
    u.hash = "";

    const junkParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
    ];

    for (const key of junkParams) {
      u.searchParams.delete(key);
    }

    // Keep query ordering stable
    u.searchParams.sort();

    return u.toString();
  } catch {
    return String(url || "");
  }
}

function isValidTabId(tabId) {
  return Number.isInteger(tabId) && tabId >= 0;
}

function makeEntry(data) {
  return {
    data,
    timestamp: Date.now(),
  };
}

function isExpired(entry, now = Date.now()) {
  return !entry || now - entry.timestamp > TTL;
}

function getTabMap(tabId, createIfMissing = false) {
  if (!isValidTabId(tabId)) return null;

  if (!CACHE.has(tabId) && createIfMissing) {
    CACHE.set(tabId, new Map());
  }

  return CACHE.get(tabId) || null;
}

function deleteTabMapIfEmpty(tabId, tabMap) {
  if (tabMap && tabMap.size === 0) {
    CACHE.delete(tabId);
  }
}

function cleanupTabCache(tabId, tabMap) {
  if (!tabMap) return;

  const now = Date.now();

  for (const [url, entry] of tabMap.entries()) {
    if (isExpired(entry, now)) {
      tabMap.delete(url);
    }
  }

  if (tabMap.size > MAX_ENTRIES_PER_TAB) {
    const sorted = [...tabMap.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    const excess = tabMap.size - MAX_ENTRIES_PER_TAB;

    for (let i = 0; i < excess; i++) {
      tabMap.delete(sorted[i][0]);
    }
  }

  deleteTabMapIfEmpty(tabId, tabMap);
}

export function setTabCache(tabId, url, data) {
  if (!isValidTabId(tabId)) return;

  const normalized = normalizeUrl(url);
  if (!normalized) return;

  const tabMap = getTabMap(tabId, true);
  if (!tabMap) return;

  tabMap.set(normalized, makeEntry(data));
  cleanupTabCache(tabId, tabMap);
}

export function getTabCache(tabId, url) {
  const tabMap = getTabMap(tabId, false);
  if (!tabMap) return null;

  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  const entry = tabMap.get(normalized);
  if (!entry) return null;

  if (isExpired(entry)) {
    tabMap.delete(normalized);
    deleteTabMapIfEmpty(tabId, tabMap);
    return null;
  }

  // Refresh active entries so frequently opened popup checks
  // do not let useful results expire too quickly.
  entry.timestamp = Date.now();

  return entry.data;
}

export function clearTabCache(tabId) {
  if (!isValidTabId(tabId)) return;
  CACHE.delete(tabId);
}

export function cleanupAllCaches() {
  for (const [tabId, tabMap] of CACHE.entries()) {
    cleanupTabCache(tabId, tabMap);
  }
}