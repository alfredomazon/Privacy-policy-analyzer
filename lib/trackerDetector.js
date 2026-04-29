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

    if (isThirdParty(hostname, pageHostname)) {
      thirdPartyResources.push({
        sourceType: resource.type,
        type: resource.type,
        url: resource.url,
        hostname,
      });
    }

    const hit = classifyTrackerUrl({
      url: resource.url,
      pageHostname,
      sourceType: resource.type,
      requestType: resource.type,
    });

    if (hit) {
      trackerHits.push(hit);
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

  const htmlText = document.documentElement?.outerHTML || "";
  const combined = `${inlineScripts}\n${htmlText.slice(0, 200000)}`;

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

function deriveBehaviorProfile({
  trackerHits,
  storageSignals,
  formSignals,
  fingerprintingHints,
  thirdPartyResources,
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
    thirdPartyResources.length >= 6;

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
      x.firstParty !== true
  );
  const hasHighSeverityTracker = trackerHits.some((x) => x.severity === "high");
  const hasStrongFingerprinting = fingerprintingHints.some(
    (x) => x.severity === "high" && confidenceRank(x.confidence) >= 2
  );
  const hasSharingStorage = storageSignals.some(
    (x) => String(x?.category || "").toLowerCase() === "sharing"
  );
  const maxConfidence = signals.reduce(
    (max, signal) => Math.max(max, confidenceRank(signal?.confidence)),
    0
  );

  if (hasStrongFingerprinting) return "high";
  if (hasHighConfidenceHighSeverityTracker) return "high";
  if (hasSharingStorage && trackerHits.length > 0) return "high";
  if (hasHighSeverityTracker && trackerHits.length >= 2) return "high";
  if (maxConfidence >= 2 && total >= 2) return "medium";
  if (trackerHits.length >= 2) return "medium";
  if (thirdPartyResources.length >= 6) return "medium";
  if (total >= 1) return "low";
  return "low";
}

function summarizeTrackerSignals({
  thirdPartyResources,
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
    thirdPartyResources.length >= 6 &&
    !trackerHits.some((x) => String(x?.category || "").toLowerCase() === "sharing")
  ) {
    const hosts = uniqBy(
      thirdPartyResources.map((x) => x.hostname).filter(Boolean),
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
}) {
  const vendors = uniqBy(
    trackerHits.map((hit) => hit.vendor).filter(Boolean),
    (x) => x
  );

  return {
    confidence,
    counts: {
      knownTrackers: trackerHits.length,
      vendors: vendors.length,
      storage: storageSignals.length,
      forms: formSignals.length,
      fingerprinting: fingerprintingHints.length,
      thirdParty: thirdPartyResources.length,
    },
    topVendors: vendors.slice(0, 6),
    bullets: summaryBullets,
  };
}

export function detectTrackerSignals({ networkSignals = [] } = {}) {
  const scriptAndIframe = collectScriptAndIframeSignals();
  const networkTrackerHits = normalizeNetworkSignals(
    networkSignals,
    scriptAndIframe.pageHostname
  );
  const trackerHits = uniqBy(
    sortSignalsByStrength([
      ...scriptAndIframe.trackerHits,
      ...networkTrackerHits,
    ]),
    (x) => `${x.id}|${x.sourceType}|${x.requestType}|${x.hostname}|${x.url}`
  ).slice(0, MAX_TRACKER_HITS);
  const storageSignals = collectStorageSignals();
  const formSignals = collectFormSignals();
  const fingerprintingHints = collectFingerprintingHints();

  const behaviorProfile = deriveBehaviorProfile({
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
  });

  const confidence = deriveConfidence({
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
  });

  const summaryBullets = summarizeTrackerSignals({
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
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
    thirdParty: scriptAndIframe.thirdPartyResources,
  };
  const summary = buildSummary({
    confidence,
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
    summaryBullets,
  });

  return {
    pageHostname: scriptAndIframe.pageHostname,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
    trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    behaviorProfile,
    confidence,
    summaryBullets,
    groups,
    summary,

    // Backward-friendly booleans for the mismatch engine
    tracking: behaviorProfile.tracking,
    sharing: behaviorProfile.sharing,
    location: behaviorProfile.location,
    payment_financial: behaviorProfile.financial,
    sensitive: behaviorProfile.sensitive,
    identifiers: behaviorProfile.identifiers,
  };
}
