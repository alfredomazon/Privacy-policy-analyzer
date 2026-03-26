const CACHE = {};

export function setTabCache(tabId, data) {
  CACHE[tabId] = {
    data,
    timestamp: Date.now(),
  };
}

export function getTabCache(tabId) {
  return CACHE[tabId]?.data || null;
}

export function clearTabCache(tabId) {
  delete CACHE[tabId];
}