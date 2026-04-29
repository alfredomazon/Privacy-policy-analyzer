// content/manualEnforcer.js

const DEFAULT_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: false,
  disableTrackingLinks: false,
};

let CURRENT_RULES = { ...DEFAULT_RULES };
let observer = null;
let scanCompleted = false;
let applyInProgress = false;
let trackerRegistryPromise = null;
let reportTimer = null;

const MAX_ACTIVITY_ITEMS = 60;
const ACTIVITY_ITEMS = new Map();

// ---------- helpers ----------
function getHostname() {
  try {
    return location.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isThirdParty(url) {
  try {
    const u = new URL(url, location.href);
    const pageHost = location.hostname.replace(/^www\./, "");
    const targetHost = u.hostname.replace(/^www\./, "");

    return (
      targetHost !== pageHost &&
      !targetHost.endsWith("." + pageHost)
    );
  } catch {
    return false;
  }
}

function markProcessed(el, key) {
  const attr = `data-evil-eye-${key}`;
  if (el.hasAttribute(attr)) return true;
  el.setAttribute(attr, "1");
  return false;
}

function hasActiveRules(rules = CURRENT_RULES) {
  return Object.values({ ...DEFAULT_RULES, ...(rules || {}) }).some(Boolean);
}

function getElementUrl(el) {
  if (!el) return "";

  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "object") return el.getAttribute("data") || "";

  return el.getAttribute("src") || el.getAttribute("href") || "";
}

function getElementRequestType(el) {
  const tag = String(el?.tagName || "").toLowerCase();
  if (tag === "script") return "script";
  if (tag === "iframe") return "iframe";
  if (tag === "img") return "image";
  if (tag === "link") return "link";
  if (tag === "source") return "media";
  return tag || "element";
}

function getHostFromUrl(url) {
  try {
    return new URL(url, location.href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function scheduleActivityReport() {
  clearTimeout(reportTimer);
  reportTimer = setTimeout(reportProtectionActivity, 120);
}

function buildActivitySnapshot() {
  const items = Array.from(ACTIVITY_ITEMS.values()).sort(
    (a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)
  );

  const counts = items.reduce((acc, item) => {
    const count = Number(item.count || 1);
    acc.total += count;
    acc[item.kind] = (acc[item.kind] || 0) + count;
    return acc;
  }, { total: 0 });

  return {
    active: hasActiveRules(),
    scanCompleted,
    rules: { ...DEFAULT_RULES, ...CURRENT_RULES },
    counts,
    items,
    updatedAt: Date.now(),
  };
}

function reportProtectionActivity() {
  try {
    chrome.runtime.sendMessage({
      type: "PROTECTION_ACTIVITY",
      activity: buildActivitySnapshot(),
    });
  } catch {
    // The page may be unloading or the extension context may be gone.
  }
}

function recordProtectionActivity({
  kind,
  action = "blocked",
  url = "",
  label = "",
  rule = "",
  tracker = null,
  requestType = "",
} = {}) {
  const key = [
    kind || "resource",
    action,
    tracker?.id || tracker?.vendor || "",
    url || label || rule,
  ].join("|");

  const previous = ACTIVITY_ITEMS.get(key);
  const next = {
    kind: kind || "resource",
    action,
    url,
    hostname: getHostFromUrl(url),
    label: label || tracker?.vendor || "Protected item",
    rule,
    requestType,
    trackerId: tracker?.id || "",
    vendor: tracker?.vendor || "",
    purpose: tracker?.purpose || "",
    category: tracker?.category || "",
    severity: tracker?.severity || "",
    confidence: tracker?.confidence || "",
    count: (previous?.count || 0) + 1,
    firstSeenAt: previous?.firstSeenAt || Date.now(),
    lastSeenAt: Date.now(),
  };

  ACTIVITY_ITEMS.set(key, next);

  while (ACTIVITY_ITEMS.size > MAX_ACTIVITY_ITEMS) {
    const oldestKey = ACTIVITY_ITEMS.keys().next().value;
    ACTIVITY_ITEMS.delete(oldestKey);
  }

  scheduleActivityReport();
}

async function getTrackerRegistry() {
  if (!trackerRegistryPromise) {
    trackerRegistryPromise = import(
      chrome.runtime.getURL("lib/trackerRegistry.js")
    ).catch(() => null);
  }

  return trackerRegistryPromise;
}

async function classifyProtectedUrl(url, requestType = "") {
  const registry = await getTrackerRegistry();
  if (!registry?.classifyTrackerUrl) return null;

  return registry.classifyTrackerUrl({
    url,
    pageHostname: getHostname(),
    sourceType: "protection",
    requestType,
  });
}

// ---------- DOM ENFORCEMENT ----------
async function removeIframes() {
  for (const el of document.querySelectorAll("iframe[src]")) {
    const src = el.getAttribute("src");
    if (src && isThirdParty(src)) {
      if (markProcessed(el, "blocked-iframe")) continue;
      const tracker = await classifyProtectedUrl(src, "iframe");
      recordProtectionActivity({
        kind: tracker ? "known-tracker" : "third-party-iframe",
        action: "removed",
        url: src,
        label: tracker?.vendor || "Third-party iframe",
        rule: "blockIframes",
        tracker,
        requestType: "iframe",
      });
      el.remove();
    }
  }
}

function removeAds() {
  const selectors = [
    '[class*=" ad-"]',
    '[class^="ad-"]',
    '[class*="ad-"]',
    '[id*="ad-"]',
    '[id^="ad_"]',
    '[class*="banner"]',
    '[class*="sponsor"]',
    '[id*="sponsor"]',
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]'
  ];

  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (markProcessed(el, "removed-ad")) return;
      recordProtectionActivity({
        kind: "ad-element",
        action: "hidden",
        label: "Obvious ad element",
        rule: "removeAds",
      });
      el.remove();
    });
  });
}

function disableTrackingLinks() {
  document.querySelectorAll("a[href]").forEach((a) => {
    if (markProcessed(a, "tracking-link")) return;

    const href = a.getAttribute("href") || "";
    const looksTracking =
      href.includes("utm_") ||
      href.includes("fbclid=") ||
      href.includes("gclid=") ||
      href.includes("tracking") ||
      href.includes("/redirect?") ||
      href.includes("/out?") ||
      href.includes("url=");

    if (!looksTracking) return;

    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Blocked tracking link:", href);
      },
      true
    );

    a.style.pointerEvents = "none";
    a.style.opacity = "0.65";
    a.title = "Blocked by Protect";

    recordProtectionActivity({
      kind: "tracking-link",
      action: "disabled",
      url: href,
      label: "Tracking-style link",
      rule: "disableTrackingLinks",
      requestType: "link",
    });
  });
}

async function removeKnownTrackers() {
  const selector = [
    "script[src]",
    "iframe[src]",
    "img[src]",
    "source[src]",
    "embed[src]",
    "object[data]",
    "link[href]",
  ].join(",");

  for (const el of document.querySelectorAll(selector)) {
    const url = getElementUrl(el);
    const requestType = getElementRequestType(el);
    if (!url || !isThirdParty(url)) continue;

    const tracker = await classifyProtectedUrl(url, requestType);
    if (!tracker) continue;
    if (markProcessed(el, "known-tracker")) continue;

    recordProtectionActivity({
      kind: "known-tracker",
      action: "removed",
      url,
      label: tracker.vendor || "Known tracker",
      rule: "blockTrackers",
      tracker,
      requestType,
    });

    el.remove();
  }
}

async function removeThirdPartyScripts() {
  for (const script of document.querySelectorAll("script[src]")) {
    const src = script.getAttribute("src");
    if (src && isThirdParty(src)) {
      if (markProcessed(script, "blocked-third-party-script")) continue;
      const tracker = await classifyProtectedUrl(src, "script");
      recordProtectionActivity({
        kind: tracker ? "known-tracker" : "third-party-script",
        action: "removed",
        url: src,
        label: tracker?.vendor || "Third-party script",
        rule: "blockThirdPartyScripts",
        tracker,
        requestType: "script",
      });
      script.remove();
    }
  }
}

// ---------- APPLY RULES ----------
async function applyRules(rules, { force = false } = {}) {
  if (!rules) return;
  if (!hasActiveRules(rules)) {
    ACTIVITY_ITEMS.clear();
    reportProtectionActivity();
    return;
  }

  if (!scanCompleted && !force) {
    reportProtectionActivity();
    return;
  }

  if (applyInProgress) return;
  applyInProgress = true;

  try {
    if (rules.blockTrackers) {
      await removeKnownTrackers();
    }

    if (rules.blockIframes) {
      await removeIframes();
    }

    if (rules.removeAds) {
      removeAds();
    }

    if (rules.disableTrackingLinks) {
      disableTrackingLinks();
    }

    if (rules.blockThirdPartyScripts) {
      await removeThirdPartyScripts();
    }
  } finally {
    applyInProgress = false;
    reportProtectionActivity();
  }
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    applyRules(CURRENT_RULES);
  });

  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });
}

// ---------- INITIAL LOAD ----------
async function init() {
  const hostname = getHostname();
  if (!hostname) return;

  try {
    const res = await chrome.runtime.sendMessage({
      type: "GET_RULES_FOR_ACTIVE_TAB"
    });

    if (res?.ok) {
      CURRENT_RULES = { ...DEFAULT_RULES, ...(res.rules || {}) };
      reportProtectionActivity();
    }
  } catch (err) {
    console.error("ManualEnforcer init failed:", err);
  }
}

// ---------- LISTEN FOR UPDATES ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RULES_UPDATED") {
    CURRENT_RULES = { ...DEFAULT_RULES, ...(msg.rules || {}) };
    applyRules(CURRENT_RULES);
  }

  if (msg?.type === "APPLY_PROTECTION_AFTER_SCAN") {
    scanCompleted = true;
    CURRENT_RULES = { ...DEFAULT_RULES, ...(msg.rules || CURRENT_RULES) };
    applyRules(CURRENT_RULES, { force: true });
    startObserver();
  }
});

// ---------- RUN ----------
init();
