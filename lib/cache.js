const CACHE = {};
const TTL = 1000 * 60 * 3; // 3 minutes

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";

    // remove tracking junk
    ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"].forEach(
      (k) => u.searchParams.delete(k)
    );

    return u.toString();
  } catch {
    return url;
  }
}

export function setTabCache(tabId, url, data) {
  CACHE[tabId] = {
    url: normalizeUrl(url),
    data,
    timestamp: Date.now(),
  };
}

export function getTabCache(tabId, url) {
  const entry = CACHE[tabId];
  if (!entry) return null;

  const now = Date.now();

  // ❌ expired
  if (now - entry.timestamp > TTL) {
    delete CACHE[tabId];
    return null;
  }

  // ❌ wrong page (navigation happened)
  if (entry.url !== normalizeUrl(url)) {
    return null;
  }

  return entry.data;
}

export function clearTabCache(tabId) {
  delete CACHE[tabId];
}