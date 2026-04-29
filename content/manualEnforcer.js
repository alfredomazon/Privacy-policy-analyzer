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

// ---------- DOM ENFORCEMENT ----------
function removeIframes() {
  document.querySelectorAll("iframe[src]").forEach((el) => {
    const src = el.getAttribute("src");
    if (src && isThirdParty(src)) {
      el.remove();
    }
  });
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
    a.title = "Blocked by Evil Eye manual protection";
  });
}

function removeThirdPartyScripts() {
  document.querySelectorAll("script[src]").forEach((script) => {
    const src = script.getAttribute("src");
    if (src && isThirdParty(src)) {
      script.remove();
    }
  });
}

// ---------- APPLY RULES ----------
function applyRules(rules) {
  if (!rules) return;

  if (rules.blockIframes) {
    removeIframes();
  }

  if (rules.removeAds) {
    removeAds();
  }

  if (rules.disableTrackingLinks) {
    disableTrackingLinks();
  }

  if (rules.blockThirdPartyScripts) {
    removeThirdPartyScripts();
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
      applyRules(CURRENT_RULES);
      startObserver();
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
});

// ---------- RUN ----------
init();