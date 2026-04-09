// In-memory cache: { [tabId]: Map<normalizedUrl, entry> }
const CACHE = new Map();

const TTL = 1000 * 60 * 3; // 3 minutes
const MAX_ENTRIES_PER_TAB = 5; // prevent memory bloat

function normalizeUrl(url) {
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

    return u.toString();
  } catch {
    return url;
  }
}

function getTabMap(tabId) {
  if (!CACHE.has(tabId)) {
    CACHE.set(tabId, new Map());
  }
  return CACHE.get(tabId);
}

function isExpired(entry) {
  return Date.now() - entry.timestamp > TTL;
}

function cleanupTabCache(tabMap) {
  const now = Date.now();

  for (const [url, entry] of tabMap.entries()) {
    if (now - entry.timestamp > TTL) {
      tabMap.delete(url);
    }
  }

  // limit size per tab
  if (tabMap.size > MAX_ENTRIES_PER_TAB) {
    const sorted = [...tabMap.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    const excess = tabMap.size - MAX_ENTRIES_PER_TAB;

    for (let i = 0; i < excess; i++) {
      tabMap.delete(sorted[i][0]);
    }
  }
}

export function setTabCache(tabId, url, data) {
  const normalized = normalizeUrl(url);
  const tabMap = getTabMap(tabId);

  tabMap.set(normalized, {
    data,
    timestamp: Date.now(),
  });

  cleanupTabCache(tabMap);
}

export function getTabCache(tabId, url) {
  const tabMap = CACHE.get(tabId);
  if (!tabMap) return null;

  const normalized = normalizeUrl(url);
  const entry = tabMap.get(normalized);

  if (!entry) return null;

  if (isExpired(entry)) {
    tabMap.delete(normalized);
    return null;
  }

  return entry.data;
}

export function clearTabCache(tabId) {
  CACHE.delete(tabId);
}

// Optional: global cleanup (safe + lightweight)
export function cleanupAllCaches() {
  for (const [tabId, tabMap] of CACHE.entries()) {
    cleanupTabCache(tabMap);

    if (tabMap.size === 0) {
      CACHE.delete(tabId);
    }
  }
}