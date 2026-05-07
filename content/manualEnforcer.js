// content/manualEnforcer.js

const DEFAULT_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: true,
  disableTrackingLinks: false,
  blockScamPopups: true,
};

let CURRENT_RULES = { ...DEFAULT_RULES };
let observer = null;
let scanCompleted = false;
let applyInProgress = false;
let trackerRegistryPromise = null;
let protectionRulesPromise = null;
let scamPopupPatternsPromise = null;
let reportTimer = null;

const MAX_ACTIVITY_ITEMS = 60;
const ACTIVITY_ITEMS = new Map();
const SCAM_POPUP_GUARD_ATTR = "data-evil-eye-block-scam-popups";
const SCAM_POPUP_ACTIVITY_EVENT = "evil-eye-popup-guard-activity";

const GENERIC_AD_SELECTORS = [
  '[data-ad]',
  '[data-ad-unit]',
  '[data-ad-unit-path]',
  '[data-advertisement]',
  '[data-google-query-id]',
  '[data-ad-slot]',
  '[data-ad-client]',
  '[aria-label*="advertisement" i]',
  '[title*="advertisement" i]',
  '[id="ad"]',
  '[id="ads"]',
  '[id^="ad-"]',
  '[id^="ad_"]',
  '[id$="-ad"]',
  '[id$="_ad"]',
  '[id*="advertisement"]',
  '[id*="ad-slot"]',
  '[id*="adslot"]',
  '[id*="ad-container"]',
  '[id*="adcontainer"]',
  '[id*="billboard"]',
  '[id*="leaderboard"]',
  '[id*="mpu"]',
  '[id*="dfp"]',
  '[id*="gpt"]',
  '[class~="ad"]',
  '[class~="ads"]',
  '[class^="ad-"]',
  '[class*=" ad-"]',
  '[class$="-ad"]',
  '[class*="-ad "]',
  '[class*="ad-banner"]',
  '[class*="ad-slot"]',
  '[class*="adslot"]',
  '[class*="ad-container"]',
  '[class*="adcontainer"]',
  '[class*="advertisement"]',
  '[class*="billboard"]',
  '[class*="leaderboard"]',
  '[class*="commercial-unit"]',
  '[class*="mpu"]',
  '[class*="dfp"]',
  '[class*="gpt"]',
  '[class*="sponsored"]',
  '[id*="sponsored"]',
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',
];

const FLOATING_VIDEO_SELECTORS = [
  "video",
  "iframe[src]",
  '[class*="floating" i]',
  '[class*="float" i]',
  '[class*="sticky" i]',
  '[class*="dock" i]',
  '[class*="outstream" i]',
  '[class*="video-player" i]',
  '[class*="jwplayer" i]',
  '[class*="vjs" i]',
  '[class*="primis" i]',
  '[class*="connatix" i]',
  '[class*="teads" i]',
  '[id*="floating" i]',
  '[id*="sticky" i]',
  '[id*="outstream" i]',
  '[id*="video-player" i]',
];

const STICKY_AD_SHELL_SELECTORS = [
  '[data-ad]',
  '[data-ad-unit]',
  '[data-ad-unit-path]',
  '[data-advertisement]',
  '[data-google-query-id]',
  '[id*="ad" i]',
  '[id*="advert" i]',
  '[id*="billboard" i]',
  '[id*="leaderboard" i]',
  '[id*="mpu" i]',
  '[id*="dfp" i]',
  '[id*="gpt" i]',
  '[class*=" ad" i]',
  '[class^="ad" i]',
  '[class*="advert" i]',
  '[class*="billboard" i]',
  '[class*="leaderboard" i]',
  '[class*="commercial-unit" i]',
  '[class*="mpu" i]',
  '[class*="dfp" i]',
  '[class*="gpt" i]',
];

const YOUTUBE_AD_SELECTORS = [
  "ytd-ad-slot-renderer",
  "ytd-promoted-video-renderer",
  "ytd-promoted-sparkles-web-renderer",
  "ytd-display-ad-renderer",
  "ytd-companion-slot-renderer",
  "ytd-in-feed-ad-layout-renderer",
  "ytd-ad-shelf-renderer",
  "ytd-player-legacy-desktop-watch-ads-renderer",
  "ytd-rich-item-renderer ytd-ad-slot-renderer",
  "ytd-rich-section-renderer ytd-ad-slot-renderer",
  "ytd-video-renderer ytd-ad-slot-renderer",
  "#player-ads",
  "#masthead-ad",
  ".ytp-ad-module",
  ".ytp-ad-overlay-container",
  ".ytp-ad-player-overlay",
  ".ytp-ad-text-overlay",
  ".ytp-ad-image-overlay",
  ".ytp-ad-survey",
  ".video-ads",
];

const YOUTUBE_SKIP_AD_SELECTORS = [
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-modern",
  "button.ytp-ad-skip-button",
  "button.ytp-ad-skip-button-modern",
];

const SCAM_POPUP_CANDIDATE_SELECTORS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[class*="modal" i]',
  '[class*="overlay" i]',
  '[class*="popup" i]',
  '[class*="pop-up" i]',
  '[id*="modal" i]',
  '[id*="overlay" i]',
  '[id*="popup" i]',
  '[style*="position: fixed" i]',
  '[style*="position:fixed" i]',
  '[style*="z-index" i]',
];

const SCAM_INSTALL_CLICKABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "button",
  "[role='button']",
  "input[type='button']",
  "input[type='submit']",
];

// ---------- helpers ----------
function getHostname() {
  try {
    return location.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isYouTubePage() {
  const host = getHostname();
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

function isYouTubeCoreResource(url) {
  if (!isYouTubePage()) return false;

  const host = getHostFromUrl(url);
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com") ||
    host === "ytimg.com" ||
    host.endsWith(".ytimg.com") ||
    host === "googlevideo.com" ||
    host.endsWith(".googlevideo.com") ||
    host === "gstatic.com" ||
    host.endsWith(".gstatic.com") ||
    host === "ggpht.com" ||
    host.endsWith(".ggpht.com")
  );
}

function isCriticalYouTubeElement(el) {
  if (!el || !isYouTubePage()) return false;

  return !!(
    el.matches?.(
      [
        "html",
        "body",
        "ytd-app",
        "ytd-page-manager",
        "ytd-watch-flexy",
        "ytd-masthead",
        "ytd-searchbox",
        "#masthead",
        "#container",
        "#content",
        "#primary",
        "#secondary",
        "#columns",
        "#movie_player",
        ".html5-video-player",
        "video",
        "form",
        "input",
      ].join(",")
    ) ||
    el.closest?.(
      [
        "ytd-searchbox",
        "form#search-form",
        "#search",
        "#search-input",
        "[role='search']",
      ].join(",")
    )
  );
}

function containsCriticalYouTubeElement(el) {
  if (!el || !isYouTubePage()) return false;

  return !!el.querySelector?.(
    [
      "ytd-masthead",
      "ytd-searchbox",
      "form#search-form",
      "#search",
      "#search-input",
      "[role='search']",
      "#movie_player",
      ".html5-video-player",
      "video",
    ].join(",")
  );
}

function getYouTubeAdRemovalTarget(el) {
  if (!el) return null;

  const feedContainer = el.closest?.(
    [
      "ytd-rich-item-renderer",
      "ytd-rich-section-renderer",
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-grid-video-renderer",
    ].join(",")
  );

  return feedContainer || el;
}

function getAdRemovalTarget(el) {
  if (!el) return null;
  return isYouTubePage() ? getYouTubeAdRemovalTarget(el) : el;
}

function isSafeAdRemovalTarget(el) {
  if (!el) return false;
  if (el === document.documentElement || el === document.body) return false;

  if (isYouTubePage()) {
    return !isCriticalYouTubeElement(el) && !containsCriticalYouTubeElement(el);
  }

  const tag = String(el.tagName || "").toLowerCase();
  if (["html", "body", "main", "header", "nav", "form", "input", "video"].includes(tag)) {
    return false;
  }

  return !el.querySelector?.("main, header, nav, form, input, video, [role='search']");
}

function isPageChromeOrPrimaryContent(el) {
  if (!el) return true;
  if (el === document.documentElement || el === document.body) return true;

  const tag = String(el.tagName || "").toLowerCase();
  if (["html", "body", "main", "header", "nav", "form"].includes(tag)) {
    return true;
  }

  return !!(
    el.matches?.("[role='banner'], [role='navigation'], [role='main'], [role='search']") ||
    el.querySelector?.("main, header, nav, form, [role='search']")
  );
}

function hasCloseControl(el) {
  return !!el?.querySelector?.(
    [
      'button[aria-label*="close" i]',
      '[role="button"][aria-label*="close" i]',
      '[title*="close" i]',
      '[class*="close" i]',
      '[id*="close" i]',
    ].join(",")
  );
}

function hasVideoContent(el) {
  return !!(
    el?.matches?.("video, iframe[src]") ||
    el?.querySelector?.("video, iframe[src]")
  );
}

function isLikelyVideoWidgetDescriptor(el) {
  return /\b(video|player|jwplayer|vjs|outstream|float|floating|sticky|dock|primis|connatix|teads|aniview|brid|advert|ad)\b/i.test(
    getElementDescriptor(el)
  );
}

function isNearViewportEdge(rect) {
  const edgePadding = 96;

  return (
    rect.right >= window.innerWidth - edgePadding ||
    rect.bottom >= window.innerHeight - edgePadding ||
    rect.left <= edgePadding ||
    rect.top <= edgePadding
  );
}

function isLikelyFloatingVideoContainer(el) {
  if (!el || isPageChromeOrPrimaryContent(el) || !hasVideoContent(el)) {
    return false;
  }

  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width < 180 || rect.height < 90) return false;

  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const areaRatio = (rect.width * rect.height) / viewportArea;
  const zIndex = Number.parseInt(style.zIndex || "0", 10);
  const floating =
    style.position === "fixed" ||
    style.position === "sticky" ||
    zIndex >= 1000;
  const lowerCornerPlayer =
    zIndex >= 100 &&
    rect.right >= window.innerWidth - 96 &&
    rect.bottom >= window.innerHeight - 96;

  if (!floating || !isNearViewportEdge(rect) || areaRatio > 0.35) {
    return false;
  }

  return isLikelyVideoWidgetDescriptor(el) || hasCloseControl(el) || lowerCornerPlayer;
}

function getFloatingVideoRemovalTarget(el) {
  let node = el;

  for (let depth = 0; node && depth < 7; depth += 1) {
    if (isLikelyFloatingVideoContainer(node)) return node;
    node = node.parentElement;
  }

  return null;
}

function isLikelyAdShellDescriptor(el) {
  return /\b(ad|ads|advert|advertisement|sponsor|sponsored|billboard|leaderboard|mpu|dfp|gpt|google-query-id|commercial-unit)\b/i.test(
    getElementDescriptor(el)
  );
}

function isLikelyStickyAdShell(el) {
  if (!el || isPageChromeOrPrimaryContent(el) || !isLikelyAdShellDescriptor(el)) {
    return false;
  }

  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 250 || rect.height < 40) return false;

  const zIndex = Number.parseInt(style.zIndex || "0", 10);
  const stickyOrFixed =
    style.position === "fixed" ||
    style.position === "sticky" ||
    zIndex >= 1000;
  const topWhitespaceAd =
    rect.top <= 180 &&
    rect.height >= 70 &&
    rect.width >= Math.min(320, window.innerWidth * 0.5);

  return stickyOrFixed || topWhitespaceAd;
}

function collapseEmptyAdAncestor(startEl) {
  let node = startEl;

  for (let depth = 0; node && depth < 3; depth += 1) {
    if (isPageChromeOrPrimaryContent(node) || !isLikelyAdShellDescriptor(node)) {
      break;
    }

    const text = (node.innerText || node.textContent || "").trim();
    const hasMedia = !!node.querySelector?.("img, video, iframe, embed, object");
    const rect = node.getBoundingClientRect();
    const parent = node.parentElement;

    if (text.length > 30 || hasMedia || rect.height < 30) {
      break;
    }

    node.remove();
    node = parent;
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

function getElementDescriptor(el) {
  if (!el) return "";

  return [
    el.getAttribute?.("role") || "",
    el.getAttribute?.("aria-label") || "",
    el.getAttribute?.("data-testid") || "",
    el.getAttribute?.("data-ad") || "",
    el.getAttribute?.("data-ad-unit") || "",
    el.getAttribute?.("data-ad-unit-path") || "",
    el.getAttribute?.("data-google-query-id") ? "google-query-id" : "",
    el.id || "",
    el.className || "",
  ].join(" ");
}

function getClickableUrl(el) {
  const link = el?.closest?.("a[href], area[href]");
  if (link) return link.getAttribute("href") || "";

  const form = el?.closest?.("form[action]");
  if (form) return form.getAttribute("action") || "";

  return getElementUrl(el);
}

function getClickableText(el) {
  if (!el) return "";

  return [
    el.innerText || el.textContent || "",
    el.getAttribute?.("aria-label") || "",
    el.getAttribute?.("title") || "",
    el.getAttribute?.("value") || "",
    getElementDescriptor(el),
  ].join(" ");
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
    const pending = chrome.runtime.sendMessage({
      type: "PROTECTION_ACTIVITY",
      activity: buildActivitySnapshot(),
    });

    if (pending?.catch) {
      pending.catch(() => {});
    }
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
  confidence = "",
  reason = "",
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
    confidence: confidence || tracker?.confidence || "",
    reason: reason || tracker?.reason || "",
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

async function getProtectionRules() {
  if (!protectionRulesPromise) {
    protectionRulesPromise = import(
      chrome.runtime.getURL("lib/protectionRules.js")
    ).catch(() => null);
  }

  return protectionRulesPromise;
}

async function getScamPopupPatterns() {
  if (!scamPopupPatternsPromise) {
    scamPopupPatternsPromise = import(
      chrome.runtime.getURL("lib/scamPopupPatterns.js")
    ).catch(() => null);
  }

  return scamPopupPatternsPromise;
}

function syncScamPopupGuardFlag(rules = CURRENT_RULES) {
  const root = document.documentElement;
  if (!root) {
    document.addEventListener(
      "DOMContentLoaded",
      () => syncScamPopupGuardFlag(rules),
      { once: true }
    );
    return;
  }

  if (rules.blockScamPopups) {
    root.setAttribute(SCAM_POPUP_GUARD_ATTR, "1");
  } else {
    root.removeAttribute(SCAM_POPUP_GUARD_ATTR);
  }
}

function setupScamPopupActivityBridge() {
  window.addEventListener(
    SCAM_POPUP_ACTIVITY_EVENT,
    (event) => {
      if (!CURRENT_RULES.blockScamPopups) return;

      const detail = event.detail || {};
      recordProtectionActivity({
        kind: detail.kind || "popup-scam",
        action: detail.action || "blocked",
        url: detail.url || "",
        label: detail.label || "Scam-style popup",
        rule: "blockScamPopups",
        requestType: detail.requestType || "popup",
        confidence: detail.confidence || "",
        reason: detail.reason || "",
      });
    },
    true
  );
}

function getProtectionKind(matched, fallback) {
  if (!matched) return fallback;
  if (matched.id === "third_party_script") return "third-party-script";
  if (matched.id === "third_party_iframe") return "third-party-iframe";
  if (/static ad filter/i.test(matched.reason || "")) return "ad-resource";
  return "known-tracker";
}

async function classifyProtectedUrl(url, requestType = "", rules = CURRENT_RULES) {
  const protectionRules = await getProtectionRules();
  if (protectionRules?.classifyProtectionRequest) {
    const matched = protectionRules.classifyProtectionRequest({
      url,
      pageHostname: getHostname(),
      requestType,
      rules,
    });

    if (matched) return matched;
  }

  const registry = await getTrackerRegistry();
  if (!registry?.classifyTrackerUrl) return null;

  return registry.classifyTrackerUrl({
    url,
    pageHostname: getHostname(),
    sourceType: "protection",
    requestType,
  });
}

async function sanitizeUrl(rawUrl = "") {
  const protectionRules = await getProtectionRules();
  if (!protectionRules?.sanitizeTrackingUrl) {
    return { changed: false, url: rawUrl, removedParams: [], unwrapped: false };
  }

  return protectionRules.sanitizeTrackingUrl(rawUrl, location.href);
}

// ---------- DOM ENFORCEMENT ----------
function isVisibleOverlayCandidate(el) {
  if (!el || el === document.documentElement || el === document.body) {
    return false;
  }

  const style = getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width < 180 || rect.height < 90) return false;

  const position = style.position;
  const zIndex = Number.parseInt(style.zIndex || "0", 10);
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const areaRatio = (rect.width * rect.height) / viewportArea;

  return (
    position === "fixed" ||
    position === "sticky" ||
    zIndex >= 1000 ||
    areaRatio >= 0.18 ||
    /\b(dialog|modal|overlay|popup|pop-up)\b/i.test(getElementDescriptor(el))
  );
}

function releasePageLock() {
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue;

    if (el.style.overflow === "hidden") el.style.overflow = "";
    if (el.style.position === "fixed") el.style.position = "";
  }
}

async function removeScamPopups() {
  const patterns = await getScamPopupPatterns();
  if (!patterns?.classifyScamPopupSignal && !patterns?.textLooksLikeScamPopup) return;

  const selector = SCAM_POPUP_CANDIDATE_SELECTORS.join(",");
  for (const el of document.querySelectorAll(selector)) {
    if (!isVisibleOverlayCandidate(el)) continue;

    const text = (el.innerText || el.textContent || "").slice(0, 2400);
    const descriptor = getElementDescriptor(el);
    const combined = `${descriptor} ${text}`;

    const classification = patterns.classifyScamPopupSignal
      ? patterns.classifyScamPopupSignal({ text: combined })
      : {
          level: patterns.textLooksLikeScamPopup(combined) ? "likely" : "normal",
          label: "Likely scam",
          reason: "",
        };

    if (classification.level !== "likely") continue;
    if (markProcessed(el, "removed-scam-popup")) continue;

    recordProtectionActivity({
      kind: "popup-scam",
      action: "removed",
      label: classification.label || "Likely scam",
      rule: "blockScamPopups",
      requestType: "overlay",
      confidence: classification.level,
      reason: classification.reason,
    });

    el.remove();
    releasePageLock();
  }
}

async function disableScamInstallLinks() {
  const patterns = await getScamPopupPatterns();
  if (!patterns?.classifyScamPopupSignal) return;

  const selector = SCAM_INSTALL_CLICKABLE_SELECTORS.join(",");
  for (const el of document.querySelectorAll(selector)) {
    if (el.hasAttribute("data-evil-eye-scam-install-link")) continue;

    const url = getClickableUrl(el);
    const text = getClickableText(el);
    const nearbyText = [
      text,
      el.closest?.('[role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="overlay" i], [class*="popup" i]')?.innerText || "",
    ].join(" ");

    const classification = patterns.classifyScamPopupSignal({
      text: nearbyText,
      url,
    });

    const reason = String(classification.reason || "");
    const shouldBlock =
      classification.level === "likely" &&
      /install|download|notification/.test(reason);

    if (!shouldBlock) continue;
    if (markProcessed(el, "scam-install-link")) continue;

    el.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );

    el.setAttribute(
      "title",
      reason === "notification trap"
        ? "Blocked suspicious notification prompt by Protect"
        : "Blocked unwanted install prompt by Protect"
    );
    el.style.pointerEvents = "none";
    el.style.opacity = "0.65";

    recordProtectionActivity({
      kind: reason === "notification trap" ? "notification-trap" : "unwanted-install",
      action: "disabled",
      url,
      label:
        reason === "notification trap"
          ? "Suspicious notification prompt"
          : "Unwanted install prompt",
      rule: "blockScamPopups",
      requestType: "click",
      confidence: classification.level,
      reason,
    });
  }
}

async function removeIframes() {
  for (const el of document.querySelectorAll("iframe[src]")) {
    const src = el.getAttribute("src");
    if (src && isThirdParty(src)) {
      if (isYouTubeCoreResource(src)) continue;
      if (markProcessed(el, "blocked-iframe")) continue;
      const tracker = await classifyProtectedUrl(src, "iframe");
      recordProtectionActivity({
        kind: getProtectionKind(tracker, "third-party-iframe"),
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
  const selectors = isYouTubePage()
    ? YOUTUBE_AD_SELECTORS
    : GENERIC_AD_SELECTORS;

  if (isYouTubePage()) {
    for (const button of document.querySelectorAll(YOUTUBE_SKIP_AD_SELECTORS.join(","))) {
      if (button.disabled || button.getAttribute("aria-disabled") === "true") continue;
      if (markProcessed(button, "skipped-youtube-ad")) continue;
      button.click();
      recordProtectionActivity({
        kind: "ad-element",
        action: "clicked",
        label: "YouTube skip ad button",
        rule: "removeAds",
      });
    }
  }

  removeFloatingVideoAds();
  removeStickyAdShells();

  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      const target = getAdRemovalTarget(el);

      if (!isSafeAdRemovalTarget(target)) return;
      if (markProcessed(target, "removed-ad")) return;

      const parent = target.parentElement;
      recordProtectionActivity({
        kind: "ad-element",
        action: "hidden",
        label: isYouTubePage() ? "YouTube ad element" : "Obvious ad element",
        rule: "removeAds",
      });
      target.remove();
      collapseEmptyAdAncestor(parent);
    });
  });

  removeFloatingVideoAds();
  removeStickyAdShells();
}

function removeFloatingVideoAds() {
  if (isYouTubePage()) return;

  for (const el of document.querySelectorAll(FLOATING_VIDEO_SELECTORS.join(","))) {
    const target = getFloatingVideoRemovalTarget(el);
    if (!target) continue;
    if (markProcessed(target, "removed-floating-video")) continue;

    recordProtectionActivity({
      kind: "ad-element",
      action: "hidden",
      label: "Floating video player",
      rule: "removeAds",
      requestType: "video",
      reason: "Fixed or sticky corner video module",
    });

    target.remove();
  }
}

function removeStickyAdShells() {
  for (const el of document.querySelectorAll(STICKY_AD_SHELL_SELECTORS.join(","))) {
    if (!isLikelyStickyAdShell(el)) continue;
    if (markProcessed(el, "removed-sticky-ad-shell")) continue;

    recordProtectionActivity({
      kind: "ad-element",
      action: "hidden",
      label: "Sticky ad container",
      rule: "removeAds",
      requestType: "element",
      reason: "Sticky or top ad container",
    });

    el.remove();
  }
}

async function disableTrackingLinks() {
  for (const a of document.querySelectorAll("a[href]")) {
    if (markProcessed(a, "tracking-link")) continue;

    const href = a.getAttribute("href") || "";
    const cleaned = await sanitizeUrl(href);
    const absoluteHref = (() => {
      try {
        return new URL(href, location.href).toString();
      } catch {
        return href;
      }
    })();
    const looksTracking =
      cleaned.changed ||
      href.includes("tracking") ||
      href.includes("/redirect?") ||
      href.includes("/out?");

    if (!looksTracking) continue;

    if (cleaned.changed && cleaned.url && cleaned.url !== absoluteHref) {
      a.setAttribute("href", cleaned.url);
      a.title = cleaned.unwrapped
        ? "Tracking redirect cleaned by Protect"
        : "Tracking parameters removed by Protect";

      recordProtectionActivity({
        kind: "tracking-link",
        action: cleaned.unwrapped ? "unwrapped" : "cleaned",
        url: href,
        label: cleaned.unwrapped ? "Tracking redirect" : "Tracking parameters",
        rule: "disableTrackingLinks",
        requestType: "link",
      });

      continue;
    }

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
  }
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

    const tracker = await classifyProtectedUrl(url, requestType, {
      ...CURRENT_RULES,
      blockIframes: false,
      blockThirdPartyScripts: false,
      removeAds: false,
    });
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
      if (isYouTubeCoreResource(src)) continue;
      if (markProcessed(script, "blocked-third-party-script")) continue;
      const tracker = await classifyProtectedUrl(src, "script");
      recordProtectionActivity({
        kind: getProtectionKind(tracker, "third-party-script"),
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
    if (rules.blockScamPopups) {
      await removeScamPopups();
      await disableScamInstallLinks();
    }

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
      await disableTrackingLinks();
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

function stopObserver() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
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
      syncScamPopupGuardFlag(CURRENT_RULES);
      reportProtectionActivity();

      if (hasActiveRules(CURRENT_RULES)) {
        startObserver();
        applyRules(CURRENT_RULES, { force: true });
      }
    }
  } catch (err) {
    console.error("ManualEnforcer init failed:", err);
  }
}

// ---------- LISTEN FOR UPDATES ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RULES_UPDATED") {
    CURRENT_RULES = { ...DEFAULT_RULES, ...(msg.rules || {}) };
    syncScamPopupGuardFlag(CURRENT_RULES);

    if (hasActiveRules(CURRENT_RULES)) {
      startObserver();
      applyRules(CURRENT_RULES, { force: true });
    } else {
      stopObserver();
      applyRules(CURRENT_RULES, { force: true });
    }
  }

  if (msg?.type === "APPLY_PROTECTION_AFTER_SCAN") {
    scanCompleted = true;
    CURRENT_RULES = { ...DEFAULT_RULES, ...(msg.rules || CURRENT_RULES) };
    syncScamPopupGuardFlag(CURRENT_RULES);
    applyRules(CURRENT_RULES, { force: true });
    startObserver();
  }
});

// ---------- RUN ----------
setupScamPopupActivityBridge();
syncScamPopupGuardFlag(CURRENT_RULES);
if (hasActiveRules(CURRENT_RULES)) {
  startObserver();
  applyRules(CURRENT_RULES, { force: true });
}
init();
