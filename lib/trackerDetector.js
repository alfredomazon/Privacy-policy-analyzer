// lib/trackerDetector.js

const KNOWN_TRACKER_RULES = [
  { name: "Google Analytics", pattern: /google-analytics\.com|analytics\.google\.com/i, category: "tracking", severity: "medium" },
  { name: "Google Tag Manager", pattern: /googletagmanager\.com/i, category: "tracking", severity: "medium" },
  { name: "DoubleClick", pattern: /doubleclick\.net|adservice\.google\.com/i, category: "sharing", severity: "high" },
  { name: "Meta/Facebook", pattern: /connect\.facebook\.net|facebook\.com\/tr|fbcdn\.net/i, category: "sharing", severity: "high" },
  { name: "TikTok", pattern: /analytics\.tiktok\.com|business-api\.tiktok\.com/i, category: "sharing", severity: "high" },
  { name: "Hotjar", pattern: /hotjar\.com|static\.hotjar\.com/i, category: "tracking", severity: "high" },
  { name: "FullStory", pattern: /fullstory\.com|edge\.fullstory\.com/i, category: "tracking", severity: "high" },
  { name: "Segment", pattern: /segment\.com|cdn\.segment\.com/i, category: "tracking", severity: "medium" },
  { name: "Mixpanel", pattern: /mixpanel\.com|cdn\.mxpnl\.com/i, category: "tracking", severity: "medium" },
  { name: "Amplitude", pattern: /amplitude\.com|cdn\.amplitude\.com/i, category: "tracking", severity: "medium" },
  { name: "Heap", pattern: /heap\.io/i, category: "tracking", severity: "medium" },
  { name: "Adobe Analytics", pattern: /omtrdc\.net|2o7\.net|adobedc\.net/i, category: "tracking", severity: "medium" },
  { name: "Tealium", pattern: /tealiumiq\.com|tags\.tiqcdn\.com/i, category: "sharing", severity: "medium" },
  { name: "Braze", pattern: /braze\.com|appboy\.com/i, category: "sharing", severity: "medium" },
  { name: "LinkedIn Insights", pattern: /snap\.licdn\.com/i, category: "sharing", severity: "high" },
  { name: "X/Twitter", pattern: /static\.ads-twitter\.com|analytics\.twitter\.com/i, category: "sharing", severity: "high" },
  { name: "Reddit Ads", pattern: /redditstatic\.com\/ads|events\.redditmedia\.com/i, category: "sharing", severity: "high" },
  { name: "Crazy Egg", pattern: /crazyegg\.com/i, category: "tracking", severity: "high" },
  { name: "Microsoft Clarity", pattern: /clarity\.ms/i, category: "tracking", severity: "high" },
];

const SUSPICIOUS_STORAGE_KEY_RULES = [
  { pattern: /^_ga/i, category: "tracking", severity: "medium", label: "Google Analytics identifier" },
  { pattern: /^_gid/i, category: "tracking", severity: "medium", label: "Google Analytics session key" },
  { pattern: /^_fbp/i, category: "sharing", severity: "high", label: "Facebook tracking key" },
  { pattern: /^_gcl_/i, category: "sharing", severity: "high", label: "Google Ads click identifier" },
  { pattern: /^ajs_/i, category: "tracking", severity: "medium", label: "Segment analytics key" },
  { pattern: /^mp_/i, category: "tracking", severity: "medium", label: "Mixpanel key" },
  { pattern: /^amplitude_/i, category: "tracking", severity: "medium", label: "Amplitude key" },
  { pattern: /heap/i, category: "tracking", severity: "medium", label: "Heap-related key" },
  { pattern: /tracking|tracker|analytics|telemetry/i, category: "tracking", severity: "medium", label: "Tracking-related storage key" },
  { pattern: /fingerprint|deviceid|visitorid|sessionid/i, category: "identifiers", severity: "high", label: "Persistent identifier key" },
];

const SENSITIVE_FORM_RULES = [
  { pattern: /\bemail\b/i, category: "identifiers", severity: "medium", label: "Email field" },
  { pattern: /\bphone|tel\b/i, category: "identifiers", severity: "medium", label: "Phone field" },
  { pattern: /\bname|first.?name|last.?name|full.?name\b/i, category: "identifiers", severity: "medium", label: "Name field" },
  { pattern: /\baddress|street|city|state|zip|postal\b/i, category: "identifiers", severity: "medium", label: "Address field" },
  { pattern: /\bcard|credit|debit|cvv|cvc|billing\b/i, category: "financial", severity: "high", label: "Payment-related field" },
  { pattern: /\bssn|social security\b/i, category: "sensitive", severity: "high", label: "SSN-related field" },
  { pattern: /\bpassport|driver|license|government.?id\b/i, category: "sensitive", severity: "high", label: "Government ID field" },
  { pattern: /\bdate.?of.?birth|dob|birthdate\b/i, category: "sensitive", severity: "high", label: "Date of birth field" },
  { pattern: /\bhealth|medical|insurance\b/i, category: "sensitive", severity: "high", label: "Health-related field" },
  { pattern: /\blocation|latitude|longitude\b/i, category: "location", severity: "high", label: "Location-related field" },
];

const FINGERPRINTING_KEYWORDS = [
  /canvas/i,
  /webgl/i,
  /audiocontext/i,
  /deviceMemory/i,
  /hardwareConcurrency/i,
  /navigator\.plugins/i,
  /navigator\.languages/i,
  /fingerprint/i,
];

function safeHostname(url) {
  try {
    return new URL(url, window.location.href).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function baseDomain(hostname) {
  const parts = String(hostname || "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function isThirdParty(hostname, pageHostname) {
  if (!hostname || !pageHostname) return false;
  return baseDomain(hostname) !== baseDomain(pageHostname);
}

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

function findKnownTracker(domainOrUrl) {
  return KNOWN_TRACKER_RULES.find((rule) => rule.pattern.test(domainOrUrl)) || null;
}

function collectScriptAndIframeSignals() {
  const pageHostname = window.location.hostname.toLowerCase();

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
    const hostname = safeHostname(resource.url);
    if (!hostname) continue;

    if (isThirdParty(hostname, pageHostname)) {
      thirdPartyResources.push({
        type: resource.type,
        url: resource.url,
        hostname,
      });
    }

    const known = findKnownTracker(resource.url) || findKnownTracker(hostname);
    if (known) {
      trackerHits.push({
        sourceType: resource.type,
        hostname,
        url: resource.url,
        vendor: known.name,
        category: known.category,
        severity: known.severity,
      });
    }
  }

  return {
    pageHostname,
    thirdPartyResources: uniqBy(
      thirdPartyResources,
      (x) => `${x.type}|${x.hostname}|${x.url}`
    ),
    trackerHits: uniqBy(
      trackerHits,
      (x) => `${x.sourceType}|${x.vendor}|${x.hostname}|${x.url}`
    ),
  };
}

function collectStorageSignals() {
  const hits = [];

  function scanStorage(storageObj, storageType) {
    if (!storageObj) return;

    for (let i = 0; i < storageObj.length; i++) {
      const key = storageObj.key(i);
      if (!key) continue;

      for (const rule of SUSPICIOUS_STORAGE_KEY_RULES) {
        if (rule.pattern.test(key)) {
          hits.push({
            storageType,
            key,
            category: rule.category,
            severity: rule.severity,
            label: rule.label,
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

  return uniqBy(hits, (x) => `${x.storageType}|${x.key}|${x.category}`);
}

function collectFormSignals() {
  const fields = Array.from(document.querySelectorAll("input, textarea, select"));
  const hits = [];

  for (const field of fields) {
    const haystack = [
      field.name,
      field.id,
      field.type,
      field.placeholder,
      field.autocomplete,
      field.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack) continue;

    for (const rule of SENSITIVE_FORM_RULES) {
      if (rule.pattern.test(haystack)) {
        hits.push({
          category: rule.category,
          severity: rule.severity,
          label: rule.label,
          fieldType: field.type || field.tagName.toLowerCase(),
          name: field.name || "",
          id: field.id || "",
          autocomplete: field.autocomplete || "",
        });
      }
    }
  }

  return uniqBy(
    hits,
    (x) => `${x.category}|${x.label}|${x.fieldType}|${x.name}|${x.id}|${x.autocomplete}`
  );
}

function collectFingerprintingHints() {
  const inlineScripts = Array.from(document.scripts)
    .filter((s) => !s.src)
    .map((s) => s.textContent || "")
    .join("\n");

  const htmlText = document.documentElement?.outerHTML || "";
  const combined = `${inlineScripts}\n${htmlText.slice(0, 200000)}`;

  const hints = [];

  for (const pattern of FINGERPRINTING_KEYWORDS) {
    if (pattern.test(combined)) {
      hints.push(pattern.source);
    }
  }

  return uniqBy(hints, (x) => x).map((keyword) => ({
    keyword,
    category: "tracking",
    severity: "high",
    signalType: "fingerprinting",
  }));
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

  const profile = {
    tracking:
      trackerCategories.has("tracking") ||
      storageCategories.has("tracking") ||
      fingerprintingHints.length > 0,

    sharing:
      trackerCategories.has("sharing") ||
      thirdPartyResources.length >= 3,

    location:
      formCategories.has("location"),

    financial:
      formCategories.has("financial"),

    sensitive:
      formCategories.has("sensitive"),

    identifiers:
      formCategories.has("identifiers") ||
      storageCategories.has("identifiers"),
  };

  return profile;
}

function deriveConfidence({
  trackerHits,
  storageSignals,
  formSignals,
  fingerprintingHints,
  thirdPartyResources,
}) {
  const total =
    trackerHits.length +
    storageSignals.length +
    formSignals.length +
    fingerprintingHints.length;

  if (fingerprintingHints.length > 0) return "high";
  if (trackerHits.some((x) => x.severity === "high")) return "high";
  if (formSignals.some((x) => x.severity === "high")) return "high";
  if (total >= 4) return "medium";
  if (thirdPartyResources.length >= 3) return "medium";
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
    const vendors = uniqBy(trackerHits.map((x) => x.vendor), (x) => x).slice(0, 4);
    bullets.push(
      `Known tracking or data-sharing services were detected, including ${vendors.join(", ")}.`
    );
  }

  if (behaviorProfile.sharing && thirdPartyResources.length && !trackerHits.length) {
    const hosts = uniqBy(thirdPartyResources.map((x) => x.hostname), (x) => x).slice(0, 4);
    bullets.push(
      `This page loads several third-party resources, including ${hosts.join(", ")}.`
    );
  }

  if (storageSignals.length) {
    const labels = uniqBy(storageSignals.map((x) => x.label), (x) => x).slice(0, 3);
    bullets.push(
      `The page stores browser identifiers or tracking-related keys such as ${labels.join(", ")}.`
    );
  }

  if (formSignals.length) {
    const labels = uniqBy(formSignals.map((x) => x.label), (x) => x).slice(0, 3);
    bullets.push(
      `This page appears to request user data such as ${labels.join(", ")}.`
    );
  }

  if (fingerprintingHints.length) {
    bullets.push(
      "Code patterns consistent with browser fingerprinting were detected."
    );
  }

  return bullets;
}

export function detectTrackerSignals() {
  const scriptAndIframe = collectScriptAndIframeSignals();
  const storageSignals = collectStorageSignals();
  const formSignals = collectFormSignals();
  const fingerprintingHints = collectFingerprintingHints();

  const behaviorProfile = deriveBehaviorProfile({
    trackerHits: scriptAndIframe.trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
  });

  const confidence = deriveConfidence({
    trackerHits: scriptAndIframe.trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
  });

  const summaryBullets = summarizeTrackerSignals({
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
    trackerHits: scriptAndIframe.trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    behaviorProfile,
  });

  return {
    pageHostname: scriptAndIframe.pageHostname,
    thirdPartyResources: scriptAndIframe.thirdPartyResources,
    trackerHits: scriptAndIframe.trackerHits,
    storageSignals,
    formSignals,
    fingerprintingHints,
    behaviorProfile,
    confidence,
    summaryBullets,

    // Backward-friendly booleans for the mismatch engine
    tracking: behaviorProfile.tracking,
    sharing: behaviorProfile.sharing,
    location: behaviorProfile.location,
    payment_financial: behaviorProfile.financial,
    sensitive: behaviorProfile.sensitive,
    identifiers: behaviorProfile.identifiers,
  };
}