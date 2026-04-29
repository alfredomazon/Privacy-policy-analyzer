// lib/trackerDetector.js

import { sameRegistrableDomain } from "./domainUtils.js";
import {
  classifyTrackerUrl,
  FORM_FIELD_RULES,
  safeHostnameFromUrl,
  STORAGE_KEY_RULES,
} from "./trackerRegistry.js";

const MAX_TRACKER_HITS = 80;
const MAX_THIRD_PARTY_RESOURCES = 80;
const MAX_VENDOR_SUMMARIES = 12;

const ROUTINE_COMMERCE_TRACKER_IDS = new Set([
  "google_analytics",
  "google_tag_manager",
  "doubleclick",
  "adobe_analytics",
]);

const COMMERCE_URL_PATTERN =
  /\b(?:shop|store|product|cart|checkout|bag|basket|order|purchase|shipping|billing)\b/i;

const ROUTINE_FORM_CATEGORIES = new Set(["identifiers", "financial"]);
const SENSITIVE_FORM_CATEGORIES = new Set(["sensitive", "location"]);

const THIRD_PARTY_RESOURCE_RULES = [
  {
    id: "cdn_infrastructure",
    label: "CDN or static asset host",
    pattern: /(?:^|\.)((?:cloudflare|fastly|unpkg|cdnjs|bootstrapcdn)\.com|cloudfront\.net|akamaihd\.net|jsdelivr\.net)$/i,
    purpose: "asset delivery",
    severity: "low",
    confidence: "low",
    likelyBenign: true,
  },
  {
    id: "font_provider",
    label: "Font provider",
    pattern: /(?:^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|typekit\.net|use\.typekit\.net)$/i,
    purpose: "fonts",
    severity: "low",
    confidence: "low",
    likelyBenign: true,
  },
  {
    id: "media_embed",
    label: "Media embed",
    pattern: /(?:^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|vimeo\.com|player\.vimeo\.com)$/i,
    purpose: "embedded media",
    severity: "low",
    confidence: "low",
    likelyBenign: true,
  },
  {
    id: "payment_provider",
    label: "Payment provider",
    pattern: /(?:^|\.)(stripe\.com|paypal\.com|paypalobjects\.com|klarna\.com|affirm\.com|afterpay\.com)$/i,
    purpose: "payments",
    severity: "medium",
    confidence: "medium",
    likelyBenign: false,
  },
  {
    id: "auth_provider",
    label: "Authentication provider",
    pattern: /(?:^|\.)(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|auth0\.com)$/i,
    purpose: "authentication",
    severity: "low",
    confidence: "low",
    likelyBenign: true,
  },
  {
    id: "support_widget",
    label: "Support or chat widget",
    pattern: /(?:^|\.)(intercom\.io|intercomcdn\.com|zendesk\.com|zdassets\.com|drift\.com)$/i,
    purpose: "customer support",
    severity: "medium",
    confidence: "medium",
    likelyBenign: false,
  },
  {
    id: "maps_widget",
    label: "Map widget",
    pattern: /(?:^|\.)(maps\.googleapis\.com|maps\.gstatic\.com|mapbox\.com)$/i,
    purpose: "maps/location features",
    severity: "medium",
    confidence: "medium",
    likelyBenign: false,
  },
];

const FINGERPRINTING_PATTERNS = [
  {
    id: "canvas_readback",
    label: "Canvas readback",
    pattern: /\b(?:toDataURL|getImageData)\s*\(/i,
    category: "tracking",
    severity: "high",
    confidence: "high",
    weight: 3,
  },
  {
    id: "webgl_renderer",
    label: "WebGL renderer probe",
    pattern: /WEBGL_debug_renderer_info|getParameter\s*\(\s*(?:gl\.)?(?:UNMASKED_VENDOR_WEBGL|UNMASKED_RENDERER_WEBGL)/i,
    category: "tracking",
    severity: "high",
    confidence: "high",
    weight: 3,
  },
  {
    id: "audio_context",
    label: "AudioContext probe",
    pattern: /\b(?:AudioContext|webkitAudioContext)\b/i,
    category: "tracking",
    severity: "high",
    confidence: "medium",
    weight: 2,
  },
  {
    id: "hardware_concurrency",
    label: "CPU core count",
    pattern: /navigator\.hardwareConcurrency\b/i,
    category: "tracking",
    severity: "medium",
    confidence: "medium",
    weight: 1,
  },
  {
    id: "device_memory",
    label: "Device memory",
    pattern: /navigator\.deviceMemory\b/i,
    category: "tracking",
    severity: "medium",
    confidence: "medium",
    weight: 1,
  },
  {
    id: "navigator_plugins",
    label: "Browser plugin list",
    pattern: /navigator\.plugins\b/i,
    category: "tracking",
    severity: "medium",
    confidence: "medium",
    weight: 1,
  },
  {
    id: "navigator_languages",
    label: "Language list",
    pattern: /navigator\.languages\b/i,
    category: "tracking",
    severity: "medium",
    confidence: "low",
    weight: 1,
  },
  {
    id: "fingerprint_library",
    label: "Fingerprinting library reference",
    pattern: /\bfingerprint(?:js|ing)?\b/i,
    category: "tracking",
    severity: "high",
    confidence: "medium",
    weight: 2,
  },
];

function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function severityRank(value = "") {
  const severity = String(value || "").toLowerCase();
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function confidenceRank(value = "") {
  const confidence = String(value || "").toLowerCase();
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  if (confidence === "low") return 1;
  return 0;
}

function sortSignalsByStrength(items = []) {
  return [...items].sort((a, b) => {
    const severityDiff = severityRank(b?.severity) - severityRank(a?.severity);
    if (severityDiff) return severityDiff;

    const confidenceDiff = confidenceRank(b?.confidence) - confidenceRank(a?.confidence);
    if (confidenceDiff) return confidenceDiff;

    return String(a?.vendor || a?.label || a?.hostname || "").localeCompare(
      String(b?.vendor || b?.label || b?.hostname || "")
    );
  });
}

function capSeverity(value = "", maxValue = "medium") {
  return severityRank(value) > severityRank(maxValue) ? maxValue : value || maxValue;
}

function capConfidence(value = "", maxValue = "medium") {
  return confidenceRank(value) > confidenceRank(maxValue) ? maxValue : value || maxValue;
}

function isRoutineCommerceFormSignal(signal = {}) {
  const category = String(signal?.category || "").toLowerCase();
  return ROUTINE_FORM_CATEGORIES.has(category);
}

function detectCommerceContext(formSignals = [], pageUrl = getPageUrl()) {
  const routineFormCount = formSignals.filter(isRoutineCommerceFormSignal).length;
  const hasSensitiveForm = formSignals.some((signal) =>
    SENSITIVE_FORM_CATEGORIES.has(String(signal?.category || "").toLowerCase())
  );
  const hasFinancialForm = formSignals.some(
    (signal) => String(signal?.category || "").toLowerCase() === "financial"
  );

  let commerceUrl = false;
  try {
    const parsed = new URL(pageUrl);
    commerceUrl = COMMERCE_URL_PATTERN.test(`${parsed.hostname} ${parsed.pathname}`);
  } catch {
    commerceUrl = COMMERCE_URL_PATTERN.test(String(pageUrl || ""));
  }

  return (
    commerceUrl ||
    (routineFormCount >= 2 && !hasSensitiveForm) ||
    (hasFinancialForm && routineFormCount >= 1)
  );
}

function isRoutineCommerceTrackerHit(hit = {}) {
  return ROUTINE_COMMERCE_TRACKER_IDS.has(String(hit?.id || "").toLowerCase());
}

function isRoutineCommerceStorageSignal(signal = {}) {
  const label = String(signal?.label || "");
  const key = String(signal?.key || "");

  return (
    /Google Analytics|Google Ads click|Segment|Mixpanel|Amplitude|Heap|session/i.test(
      label
    ) ||
    /^_gcl_/i.test(key) ||
    /^_ga|^_gid|^ajs_|^mp_|^amplitude_|heap|sessionid|session_id/i.test(key)
  );
}

function normalizeCommerceTrackerHit(hit = {}, commerceContext = false) {
  if (!commerceContext || !isRoutineCommerceTrackerHit(hit)) return hit;

  return {
    ...hit,
    severity: capSeverity(hit.severity, "medium"),
    confidence: capConfidence(hit.confidence, "medium"),
    routineCommerce: true,
    impact: "routine",
    reason: `${hit.reason || "Tracker endpoint"}; common on commerce pages for analytics, tags, or ad conversion measurement`,
  };
}

function normalizeCommerceStorageSignal(signal = {}, commerceContext = false) {
  if (!commerceContext || !isRoutineCommerceStorageSignal(signal)) return signal;

  const isSessionKey = /sessionid|session_id/i.test(String(signal.key || ""));

  return {
    ...signal,
    severity: isSessionKey ? "low" : capSeverity(signal.severity, "medium"),
    confidence: isSessionKey ? "low" : capConfidence(signal.confidence, "medium"),
    routineCommerce: true,
    impact: "routine",
    reason: `${signal.reason || signal.label || "Storage key"}; common on commerce pages for analytics, ad attribution, or session continuity`,
  };
}

function normalizeCommerceFormSignal(signal = {}, commerceContext = false) {
  if (!commerceContext || !isRoutineCommerceFormSignal(signal)) return signal;

  const category = String(signal?.category || "").toLowerCase();

  return {
    ...signal,
    severity: category === "financial" ? "medium" : "low",
    confidence: "low",
    routineCommerce: true,
    impact: "routine",
    reason: `${signal.reason || signal.label || "Form field"}; common on checkout, account, or order pages`,
  };
}

function normalizeCommerceThirdPartyResource(resource = {}, commerceContext = false) {
  if (
    !commerceContext ||
    !resource?.knownTracker ||
    !ROUTINE_COMMERCE_TRACKER_IDS.has(String(resource?.trackerId || "").toLowerCase())
  ) {
    return resource;
  }

  return {
    ...resource,
    severity: capSeverity(resource.severity, "medium"),
    confidence: capConfidence(resource.confidence, "medium"),
    routineCommerce: true,
    impact: "routine",
  };
}

function isHighImpactSignal(signal = {}) {
  return signal?.routineCommerce !== true && severityRank(signal?.severity) >= 3;
}

function getPageHostname() {
  try {
    return String(window.location.hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

function getPageUrl() {
  try {
    return String(window.location.href || "https://example.invalid/");
  } catch {
    return "https://example.invalid/";
  }
}

function getResourceHostname(url) {
  return safeHostnameFromUrl(url, getPageUrl());
}

function isThirdParty(hostname, pageHostname) {
  if (!hostname || !pageHostname) return false;
  return !sameRegistrableDomain(hostname, pageHostname);
}

function classifyThirdPartyResource(resource, hostname, trackerHit = null) {
  if (trackerHit) {
    return {
      sourceType: resource.type,
      type: resource.type,
      url: resource.url,
      hostname,
      trackerId: trackerHit.id || "",
      kind: "known_tracker",
      label: trackerHit.vendor || "Known tracker",
      purpose: trackerHit.purpose || "tracking",
      severity: trackerHit.severity || "medium",
      confidence: trackerHit.confidence || "medium",
      likelyBenign: false,
      knownTracker: true,
    };
  }

  const matched = THIRD_PARTY_RESOURCE_RULES.find((rule) =>
    rule.pattern.test(hostname)
  );

  if (matched) {
    return {
      sourceType: resource.type,
      type: resource.type,
      url: resource.url,
      hostname,
      kind: matched.id,
      label: matched.label,
      purpose: matched.purpose,
      severity: matched.severity,
      confidence: matched.confidence,
      likelyBenign: matched.likelyBenign,
      knownTracker: false,
    };
  }

  return {
    sourceType: resource.type,
    type: resource.type,
    url: resource.url,
    hostname,
    kind: resource.type === "iframe" ? "unknown_iframe" : "unknown_script",
    label: resource.type === "iframe" ? "Unknown third-party iframe" : "Unknown third-party script",
    purpose: "unknown",
    severity: "low",
    confidence: "low",
    likelyBenign: false,
    knownTracker: false,
  };
}

function collectScriptAndIframeSignals() {
  const pageHostname = getPageHostname();

  const scripts = Array.from(document.querySelectorAll("script[src]"))
    .map((el) => el.src)
    .filter(Boolean);

  const iframes = Array.from(document.querySelectorAll("iframe[src]"))
    .map((el) => el.src)
    .filter(Boolean);

  const allResources = [
    ...scripts.map((url) => ({ type: "script", url })),
    ...iframes.map((url) => ({ type: "iframe", url })),
  ];

  const thirdPartyResources = [];
  const trackerHits = [];

  for (const resource of allResources) {
    const hostname = getResourceHostname(resource.url);
    if (!hostname) continue;

    const hit = classifyTrackerUrl({
      url: resource.url,
      pageHostname,
      sourceType: resource.type,
      requestType: resource.type,
    });

    if (hit) {
      trackerHits.push(hit);
    }

    if (isThirdParty(hostname, pageHostname)) {
      thirdPartyResources.push(classifyThirdPartyResource(resource, hostname, hit));
    }
  }

  return {
    pageHostname,
    thirdPartyResources: uniqBy(
      thirdPartyResources,
      (x) => `${x.sourceType}|${x.hostname}|${x.url}`
    ).slice(0, MAX_THIRD_PARTY_RESOURCES),
    trackerHits: uniqBy(
      sortSignalsByStrength(trackerHits),
      (x) => `${x.id}|${x.sourceType}|${x.requestType}|${x.hostname}|${x.url}`
    ).slice(0, MAX_TRACKER_HITS),
  };
}

function normalizeNetworkSignals(networkSignals, pageHostname) {
  if (!Array.isArray(networkSignals)) return [];

  const hits = [];

  for (const signal of networkSignals) {
    if (!signal) continue;

    if (signal.vendor && signal.url) {
      hits.push({
        ...signal,
        sourceType: signal.sourceType || "network",
        requestType: signal.requestType || "",
        firstParty:
          typeof signal.firstParty === "boolean"
            ? signal.firstParty
            : sameRegistrableDomain(signal.hostname, pageHostname),
      });
      continue;
    }

    if (signal.url) {
      const classified = classifyTrackerUrl({
        url: signal.url,
        pageHostname,
        sourceType: signal.sourceType || "network",
        requestType: signal.requestType || "",
      });

      if (classified) hits.push(classified);
    }
  }

  return uniqBy(
    sortSignalsByStrength(hits),
    (x) => `${x.id}|${x.sourceType}|${x.requestType}|${x.hostname}|${x.url}`
  ).slice(0, MAX_TRACKER_HITS);
}

function collectStorageSignals() {
  const hits = [];

  function scanStorage(storageObj, storageType) {
    if (!storageObj) return;

    for (let i = 0; i < storageObj.length; i++) {
      const key = storageObj.key(i);
      if (!key) continue;

      for (const rule of STORAGE_KEY_RULES) {
        if (rule.pattern.test(key)) {
          hits.push({
            sourceType: storageType,
            storageType,
            key,
            category: rule.category,
            severity: rule.severity,
            confidence: rule.confidence,
            label: rule.label,
            reason: `${rule.label} found in ${storageType}`,
          });
        }
      }
    }
  }

  try {
    scanStorage(window.localStorage, "localStorage");
  } catch {}

  try {
    scanStorage(window.sessionStorage, "sessionStorage");
  } catch {}

  return uniqBy(
    sortSignalsByStrength(hits),
    (x) => `${x.storageType}|${x.key}|${x.category}|${x.label}`
  );
}

function collectFormSignals() {
  const fields = Array.from(document.querySelectorAll("input, textarea, select"));
  const hits = [];

  for (const field of fields) {
    const fieldType =
      field.type || String(field.tagName || "field").toLowerCase();

    const haystack = [
      field.name,
      field.id,
      fieldType,
      field.placeholder,
      field.autocomplete,
      field.getAttribute?.("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack) continue;

    for (const rule of FORM_FIELD_RULES) {
      if (rule.pattern.test(haystack)) {
        hits.push({
          sourceType: "form",
          category: rule.category,
          severity: rule.severity,
          confidence: rule.confidence,
          label: rule.label,
          fieldType,
          name: field.name || "",
          id: field.id || "",
          autocomplete: field.autocomplete || "",
          reason: `${rule.label} visible on the page`,
        });
      }
    }
  }

  return uniqBy(
    sortSignalsByStrength(hits),
    (x) => `${x.category}|${x.label}|${x.fieldType}|${x.name}|${x.id}|${x.autocomplete}`
  );
}

function collectFingerprintingHints() {
  const inlineScripts = Array.from(document.scripts || [])
    .filter((s) => !s.src)
    .map((s) => s.textContent || "")
    .join("\n");

  const combined = inlineScripts.slice(0, 200000);
  if (!combined.trim()) return [];

  const hits = [];

  for (const rule of FINGERPRINTING_PATTERNS) {
    if (rule.pattern.test(combined)) {
      hits.push({
        id: rule.id,
        keyword: rule.label,
        label: rule.label,
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        signalType: "fingerprinting",
        sourceType: "script",
        reason: `${rule.label} pattern appeared in page scripts`,
        weight: rule.weight,
      });
    }
  }

  const totalWeight = hits.reduce((sum, hit) => sum + (hit.weight || 0), 0);
  const hasStrongSignal = hits.some((hit) => (hit.weight || 0) >= 3);

  // A single weak browser-property reference is common in legitimate feature checks.
  if (!hasStrongSignal && totalWeight < 3) return [];

  return uniqBy(
    sortSignalsByStrength(hits),
    (x) => `${x.signalType}|${x.id}`
  ).map(({ weight, ...hit }) => hit);
}

function getTrackerCategoryCounts(trackerHits) {
  const counts = {
    tracking: 0,
    sharing: 0,
  };

  for (const hit of trackerHits) {
    const category = String(hit?.category || "").toLowerCase();
    if (category === "tracking") counts.tracking += 1;
    if (category === "sharing") counts.sharing += 1;
  }

  return counts;
}

function summarizeVendors(trackerHits = []) {
  const byVendor = new Map();

  for (const hit of trackerHits) {
    const vendor = hit?.vendor || hit?.hostname || "Unknown service";
    const existing =
      byVendor.get(vendor) || {
        vendor,
        count: 0,
        purposes: new Set(),
        sourceTypes: new Set(),
        hostnames: new Set(),
        severity: "low",
        confidence: "low",
        category: "",
        firstPartyOnly: true,
        routineCommerce: true,
        highImpact: false,
      };

    existing.count += 1;
    if (hit?.purpose) existing.purposes.add(hit.purpose);
    if (hit?.sourceType) existing.sourceTypes.add(hit.sourceType);
    if (hit?.requestType) existing.sourceTypes.add(hit.requestType);
    if (hit?.hostname) existing.hostnames.add(hit.hostname);

    if (severityRank(hit?.severity) > severityRank(existing.severity)) {
      existing.severity = hit.severity;
    }
    if (confidenceRank(hit?.confidence) > confidenceRank(existing.confidence)) {
      existing.confidence = hit.confidence;
    }
    if (!existing.category && hit?.category) existing.category = hit.category;
    if (hit?.firstParty !== true) existing.firstPartyOnly = false;
    if (hit?.routineCommerce !== true) existing.routineCommerce = false;
    if (isHighImpactSignal(hit)) existing.highImpact = true;

    byVendor.set(vendor, existing);
  }

  return Array.from(byVendor.values())
    .map((item) => ({
      ...item,
      purposes: Array.from(item.purposes).slice(0, 4),
      sourceTypes: Array.from(item.sourceTypes).slice(0, 4),
      hostnames: Array.from(item.hostnames).slice(0, 4),
    }))
    .sort((a, b) => {
      const severityDiff = severityRank(b.severity) - severityRank(a.severity);
      if (severityDiff) return severityDiff;

      const confidenceDiff = confidenceRank(b.confidence) - confidenceRank(a.confidence);
      if (confidenceDiff) return confidenceDiff;

      return b.count - a.count;
    })
    .slice(0, MAX_VENDOR_SUMMARIES);
}

function buildThirdPartyProfile(thirdPartyResources = []) {
  const domains = uniqBy(
    thirdPartyResources.map((resource) => resource.hostname).filter(Boolean),
    (x) => x
  );
  const benign = thirdPartyResources.filter((resource) => resource.likelyBenign);
  const knownTrackers = thirdPartyResources.filter((resource) => resource.knownTracker);
  const meaningful = thirdPartyResources.filter((resource) => {
    if (resource.knownTracker) return true;
    if (resource.likelyBenign) return false;
    if (severityRank(resource.severity) >= 2) return true;
    return resource.kind === "unknown_script" || resource.kind === "unknown_iframe";
  });
  const unknown = thirdPartyResources.filter((resource) =>
    String(resource.kind || "").startsWith("unknown_")
  );
  const meaningfulDomains = uniqBy(
    meaningful.map((resource) => resource.hostname).filter(Boolean),
    (x) => x
  );
  const labels = uniqBy(
    meaningful.map((resource) => resource.label).filter(Boolean),
    (x) => x
  ).slice(0, 5);

  return {
    total: thirdPartyResources.length,
    domains: domains.length,
    benign: benign.length,
    knownTrackers: knownTrackers.length,
    meaningful: meaningful.length,
    meaningfulDomains: meaningfulDomains.length,
    unknown: unknown.length,
    labels,
  };
}

function deriveBehaviorProfile({
  trackerHits,
  storageSignals,
  formSignals,
  fingerprintingHints,
  thirdPartyResources,
  thirdPartyProfile = buildThirdPartyProfile(thirdPartyResources),
}) {
  const trackerCategories = new Set(
    trackerHits.map((x) => String(x?.category || "").toLowerCase())
  );

  const storageCategories = new Set(
    storageSignals.map((x) => String(x?.category || "").toLowerCase())
  );

  const formCategories = new Set(
    formSignals.map((x) => String(x?.category || "").toLowerCase())
  );

  const trackerCounts = getTrackerCategoryCounts(trackerHits);

  const tracking =
    trackerCategories.has("tracking") ||
    storageCategories.has("tracking") ||
    fingerprintingHints.length > 0;

  const sharing =
    trackerCategories.has("sharing") ||
    storageSignals.some((x) => String(x?.category || "").toLowerCase() === "sharing") ||
    trackerCounts.sharing >= 1 ||
    thirdPartyProfile.meaningful >= 6 ||
    thirdPartyProfile.meaningfulDomains >= 4;

  const location = formCategories.has("location");
  const financial = formCategories.has("financial");
  const sensitive = formCategories.has("sensitive");

  const identifiers =
    formCategories.has("identifiers") ||
    storageCategories.has("identifiers");

  return {
    tracking,
    sharing,
    location,
    financial,
    sensitive,
    identifiers,
  };
}

function deriveConfidence({
  trackerHits,
  storageSignals,
  formSignals,
  fingerprintingHints,
  thirdPartyResources,
  vendorSummary = summarizeVendors(trackerHits),
  thirdPartyProfile = buildThirdPartyProfile(thirdPartyResources),
}) {
  const signals = [
    ...trackerHits,
    ...storageSignals,
    ...formSignals,
    ...fingerprintingHints,
  ];

  const total = signals.length;
  const hasHighConfidenceHighSeverityTracker = trackerHits.some(
    (x) =>
      x.severity === "high" &&
      x.confidence === "high" &&
      x.routineCommerce !== true &&
      x.firstParty !== true
  );
  const hasHighSeverityTracker = vendorSummary.some((x) => x.highImpact === true);
  const hasStrongFingerprinting = fingerprintingHints.some(
    (x) => x.severity === "high" && confidenceRank(x.confidence) >= 2
  );
  const hasSharingStorage = storageSignals.some(
    (x) =>
      String(x?.category || "").toLowerCase() === "sharing" &&
      x.routineCommerce !== true &&
      severityRank(x?.severity) >= 3
  );
  const maxConfidence = signals.reduce(
    (max, signal) => Math.max(max, confidenceRank(signal?.confidence)),
    0
  );

  if (hasStrongFingerprinting) return "high";
  if (hasHighConfidenceHighSeverityTracker) return "high";
  if (hasSharingStorage && trackerHits.length > 0) return "high";
  if (hasHighSeverityTracker && vendorSummary.length >= 2) return "high";
  if (maxConfidence >= 2 && total >= 2) return "medium";
  if (vendorSummary.length >= 2) return "medium";
  if (thirdPartyProfile.meaningful >= 6 || thirdPartyProfile.meaningfulDomains >= 4) {
    return "medium";
  }
  if (total >= 1) return "low";
  return "low";
}

function summarizeTrackerSignals({
  thirdPartyResources,
  thirdPartyProfile,
  trackerHits,
  storageSignals,
  formSignals,
  fingerprintingHints,
  behaviorProfile,
}) {
  const bullets = [];

  if (trackerHits.length) {
    const vendors = uniqBy(
      trackerHits.map((x) => x.vendor).filter(Boolean),
      (x) => x
    ).slice(0, 4);
    bullets.push(
      `Known tracking or data-sharing services were detected, including ${vendors.join(", ")}.`
    );
  }

  if (
    behaviorProfile.sharing &&
    (thirdPartyProfile?.meaningful >= 6 || thirdPartyProfile?.meaningfulDomains >= 4) &&
    !trackerHits.some((x) => String(x?.category || "").toLowerCase() === "sharing")
  ) {
    const hosts = uniqBy(
      thirdPartyResources
        .filter((x) => !x.likelyBenign)
        .map((x) => x.hostname)
        .filter(Boolean),
      (x) => x
    ).slice(0, 4);
    bullets.push(
      `This page loads several third-party resources, including ${hosts.join(", ")}.`
    );
  }

  if (storageSignals.length) {
    const labels = uniqBy(
      storageSignals.map((x) => x.label).filter(Boolean),
      (x) => x
    ).slice(0, 3);
    bullets.push(
      `The page stores browser identifiers or tracking-related keys such as ${labels.join(", ")}.`
    );
  }

  if (formSignals.length) {
    const labels = uniqBy(
      formSignals.map((x) => x.label).filter(Boolean),
      (x) => x
    ).slice(0, 3);
    bullets.push(
      `This page appears to request user data such as ${labels.join(", ")}.`
    );
  }

  if (fingerprintingHints.length) {
    bullets.push(
      "Code patterns more strongly associated with browser fingerprinting were detected."
    );
  }

  return bullets;
}

function buildSummary({
  confidence,
  trackerHits,
  storageSignals,
  formSignals,
  fingerprintingHints,
  thirdPartyResources,
  summaryBullets,
  vendorSummary,
  thirdPartyProfile,
  riskScore,
  riskLevel,
}) {
  const vendors = Array.isArray(vendorSummary) && vendorSummary.length
    ? vendorSummary.map((item) => item.vendor).filter(Boolean)
    : uniqBy(
        trackerHits.map((hit) => hit.vendor).filter(Boolean),
        (x) => x
      );
  const allSignals = [
    ...trackerHits,
    ...storageSignals,
    ...formSignals,
    ...fingerprintingHints,
  ];
  const routineSignals = allSignals.filter(
    (signal) => signal?.routineCommerce === true
  ).length;
  const highImpactSignals = allSignals.filter(isHighImpactSignal).length;
  const signalCount = allSignals.length;

  return {
    confidence,
    riskScore,
    riskLevel,
    counts: {
      knownTrackers: trackerHits.length,
      vendors: vendors.length,
      storage: storageSignals.length,
      forms: formSignals.length,
      fingerprinting: fingerprintingHints.length,
      thirdParty: thirdPartyResources.length,
      meaningfulThirdParty: thirdPartyProfile?.meaningful || 0,
      thirdPartyDomains: thirdPartyProfile?.domains || 0,
      routine: routineSignals,
      highImpact: highImpactSignals,
    },
    vendors: vendorSummary || [],
    thirdPartyProfile: thirdPartyProfile || null,
    topVendors: vendors.slice(0, 6),
    bullets: summaryBullets,
    routineOnly: signalCount > 0 && routineSignals > 0 && highImpactSignals === 0,
  };
}

function computeTrackerRiskScore({
  vendorSummary = [],
  storageSignals = [],
  formSignals = [],
  fingerprintingHints = [],
  thirdPartyProfile = {},
}) {
  let score = 0;

  for (const vendor of vendorSummary) {
    if (vendor.routineCommerce === true) {
      score += vendor.severity === "medium" ? 4 : 2;
    } else if (vendor.severity === "high") {
      score += 12;
    } else if (vendor.severity === "medium") {
      score += 7;
    } else {
      score += 3;
    }

    if (vendor.confidence === "high" && vendor.routineCommerce !== true) score += 3;
    if (vendor.category === "sharing" && vendor.routineCommerce !== true) score += 4;
  }

  const storageScore = storageSignals.reduce((sum, signal) => {
    if (signal.routineCommerce === true) return sum + 1;
    if (signal.severity === "high") return sum + 5;
    if (signal.severity === "medium") return sum + 3;
    return sum + 1;
  }, 0);
  const formScore = formSignals.reduce((sum, signal) => {
    if (signal.routineCommerce === true) {
      return sum + (signal.category === "financial" ? 1.5 : 0.5);
    }
    if (signal.severity === "high") return sum + 4;
    if (signal.severity === "medium") return sum + 2;
    return sum + 0.5;
  }, 0);

  score += Math.min(12, storageScore);
  score += Math.min(10, formScore);
  score += Math.min(18, fingerprintingHints.length * 8);
  score += Math.min(10, (thirdPartyProfile.meaningful || 0) * 1.5);

  const riskScore = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel = riskScore >= 55 ? "high" : riskScore >= 24 ? "medium" : "low";

  return { riskScore, riskLevel };
}

export function detectTrackerSignals({ networkSignals = [] } = {}) {
  const scriptAndIframe = collectScriptAndIframeSignals();
  const networkTrackerHits = normalizeNetworkSignals(
    networkSignals,
    scriptAndIframe.pageHostname
  );
  const rawStorageSignals = collectStorageSignals();
  const rawFormSignals = collectFormSignals();
  const commerceContext = detectCommerceContext(rawFormSignals, getPageUrl());
  const trackerHits = uniqBy(
    sortSignalsByStrength(
      [...scriptAndIframe.trackerHits, ...networkTrackerHits].map((hit) =>
        normalizeCommerceTrackerHit(hit, commerceContext)
      )
    ),
    (x) => `${x.id}|${x.sourceType}|${x.requestType}|${x.hostname}|${x.url}`
  ).slice(0, MAX_TRACKER_HITS);
  const storageSignals = sortSignalsByStrength(
    rawStorageSignals.map((signal) =>
      normalizeCommerceStorageSignal(signal, commerceContext)
    )
  );
  const formSignals = sortSignalsByStrength(
    rawFormSignals.map((signal) =>
      normalizeCommerceFormSignal(signal, commerceContext)
    )
  );
  const fingerprintingHints = collectFingerprintingHints();
  const vendorSummary = summarizeVendors(trackerHits);
  const thirdPartyResources = scriptAndIframe.thirdPartyResources.map((resource) =>
    normalizeCommerceThirdPartyResource(resource, commerceContext)
  );
  const thirdPartyProfile = buildThirdPartyProfile(thirdPartyResources);

  const behaviorProfile = deriveBehaviorProfile({
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources,
    thirdPartyProfile,
  });

  const confidence = deriveConfidence({
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources,
    vendorSummary,
    thirdPartyProfile,
  });
  const { riskScore, riskLevel } = computeTrackerRiskScore({
    vendorSummary,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyProfile,
  });

  const summaryBullets = summarizeTrackerSignals({
    thirdPartyResources,
    thirdPartyProfile,
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    behaviorProfile,
  });

  const groups = {
    knownTrackers: trackerHits,
    storage: storageSignals,
    forms: formSignals,
    fingerprinting: fingerprintingHints,
    thirdParty: thirdPartyResources,
    vendors: vendorSummary,
  };
  const summary = buildSummary({
    confidence,
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources,
    summaryBullets,
    vendorSummary,
    thirdPartyProfile,
    riskScore,
    riskLevel,
  });

  return {
    pageHostname: scriptAndIframe.pageHostname,
    thirdPartyResources,
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    behaviorProfile,
    confidence,
    riskScore,
    riskLevel,
    summaryBullets,
    groups,
    summary,
    commerceContext,

    // Backward-friendly booleans for the mismatch engine
    tracking: behaviorProfile.tracking,
    sharing: behaviorProfile.sharing,
    location: behaviorProfile.location,
    payment_financial: behaviorProfile.financial,
    sensitive: behaviorProfile.sensitive,
    identifiers: behaviorProfile.identifiers,
  };
}
