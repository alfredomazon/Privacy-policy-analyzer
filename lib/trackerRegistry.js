import { normalizeHostname, sameRegistrableDomain } from "./domainUtils.js";

export const TRACKER_RULES = [
  {
    id: "google_analytics",
    vendor: "Google Analytics",
    pattern: /google-analytics\.com|analytics\.google\.com/i,
    purpose: "analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
  },
  {
    id: "google_tag_manager",
    vendor: "Google Tag Manager",
    pattern: /googletagmanager\.com/i,
    purpose: "tag manager",
    category: "tracking",
    severity: "medium",
    confidence: "medium",
  },
  {
    id: "doubleclick",
    vendor: "DoubleClick",
    pattern: /doubleclick\.net|adservice\.google\.com/i,
    purpose: "advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
  },
  {
    id: "meta_pixel",
    vendor: "Meta/Facebook",
    pattern: /connect\.facebook\.net|facebook\.com\/tr|fbcdn\.net/i,
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
  },
  {
    id: "tiktok_pixel",
    vendor: "TikTok",
    pattern: /analytics\.tiktok\.com|business-api\.tiktok\.com/i,
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
  },
  {
    id: "hotjar",
    vendor: "Hotjar",
    pattern: /hotjar\.com|static\.hotjar\.com/i,
    purpose: "heatmap/session analytics",
    category: "tracking",
    severity: "high",
    confidence: "high",
  },
  {
    id: "fullstory",
    vendor: "FullStory",
    pattern: /fullstory\.com|edge\.fullstory\.com/i,
    purpose: "session replay",
    category: "tracking",
    severity: "high",
    confidence: "high",
  },
  {
    id: "segment",
    vendor: "Segment",
    pattern: /segment\.com|cdn\.segment\.com|api\.segment\.io/i,
    purpose: "customer data platform",
    category: "tracking",
    severity: "medium",
    confidence: "high",
  },
  {
    id: "mixpanel",
    vendor: "Mixpanel",
    pattern: /mixpanel\.com|cdn\.mxpnl\.com/i,
    purpose: "product analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
  },
  {
    id: "amplitude",
    vendor: "Amplitude",
    pattern: /amplitude\.com|cdn\.amplitude\.com/i,
    purpose: "product analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
  },
  {
    id: "heap",
    vendor: "Heap",
    pattern: /heap\.io/i,
    purpose: "product analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
  },
  {
    id: "adobe_analytics",
    vendor: "Adobe Analytics",
    pattern: /omtrdc\.net|2o7\.net|adobedc\.net/i,
    purpose: "analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
  },
  {
    id: "tealium",
    vendor: "Tealium",
    pattern: /tealiumiq\.com|tags\.tiqcdn\.com/i,
    purpose: "tag manager/customer data",
    category: "sharing",
    severity: "medium",
    confidence: "medium",
  },
  {
    id: "braze",
    vendor: "Braze",
    pattern: /braze\.com|appboy\.com/i,
    purpose: "messaging/customer engagement",
    category: "sharing",
    severity: "medium",
    confidence: "medium",
  },
  {
    id: "linkedin_insight",
    vendor: "LinkedIn Insights",
    pattern: /snap\.licdn\.com/i,
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
  },
  {
    id: "twitter_ads",
    vendor: "X/Twitter",
    pattern: /static\.ads-twitter\.com|analytics\.twitter\.com/i,
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
  },
  {
    id: "reddit_ads",
    vendor: "Reddit Ads",
    pattern: /redditstatic\.com\/ads|events\.redditmedia\.com/i,
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
  },
  {
    id: "crazy_egg",
    vendor: "Crazy Egg",
    pattern: /crazyegg\.com/i,
    purpose: "heatmap/session analytics",
    category: "tracking",
    severity: "high",
    confidence: "high",
  },
  {
    id: "microsoft_clarity",
    vendor: "Microsoft Clarity",
    pattern: /clarity\.ms/i,
    purpose: "session analytics",
    category: "tracking",
    severity: "high",
    confidence: "high",
  },
];

export const STORAGE_KEY_RULES = [
  { pattern: /^_ga/i, category: "tracking", severity: "medium", confidence: "medium", label: "Google Analytics identifier" },
  { pattern: /^_gid/i, category: "tracking", severity: "medium", confidence: "medium", label: "Google Analytics session key" },
  { pattern: /^_fbp/i, category: "sharing", severity: "high", confidence: "high", label: "Facebook tracking key" },
  { pattern: /^_gcl_/i, category: "sharing", severity: "high", confidence: "high", label: "Google Ads click identifier" },
  { pattern: /^ajs_/i, category: "tracking", severity: "medium", confidence: "medium", label: "Segment analytics key" },
  { pattern: /^mp_/i, category: "tracking", severity: "medium", confidence: "medium", label: "Mixpanel key" },
  { pattern: /^amplitude_/i, category: "tracking", severity: "medium", confidence: "medium", label: "Amplitude key" },
  { pattern: /heap/i, category: "tracking", severity: "medium", confidence: "medium", label: "Heap-related key" },
  { pattern: /tracking|tracker|analytics|telemetry/i, category: "tracking", severity: "medium", confidence: "low", label: "Tracking-related storage key" },
  { pattern: /fingerprint|deviceid|visitorid|sessionid/i, category: "identifiers", severity: "high", confidence: "medium", label: "Persistent identifier key" },
];

export const FORM_FIELD_RULES = [
  { pattern: /\bemail\b/i, category: "identifiers", severity: "medium", confidence: "low", label: "Email field" },
  { pattern: /\bphone|tel\b/i, category: "identifiers", severity: "medium", confidence: "low", label: "Phone field" },
  { pattern: /\bname|first.?name|last.?name|full.?name\b/i, category: "identifiers", severity: "medium", confidence: "low", label: "Name field" },
  { pattern: /\baddress|street|city|state|zip|postal\b/i, category: "identifiers", severity: "medium", confidence: "low", label: "Address field" },
  { pattern: /\bcard|credit|debit|cvv|cvc|billing\b/i, category: "financial", severity: "high", confidence: "medium", label: "Payment-related field" },
  { pattern: /\bssn|social security\b/i, category: "sensitive", severity: "high", confidence: "medium", label: "SSN-related field" },
  { pattern: /\bpassport|driver|license|government.?id\b/i, category: "sensitive", severity: "high", confidence: "medium", label: "Government ID field" },
  { pattern: /\bdate.?of.?birth|dob|birthdate\b/i, category: "sensitive", severity: "high", confidence: "medium", label: "Date of birth field" },
  { pattern: /\bhealth|medical|insurance\b/i, category: "sensitive", severity: "high", confidence: "medium", label: "Health-related field" },
  { pattern: /\blocation|latitude|longitude\b/i, category: "location", severity: "high", confidence: "medium", label: "Location-related field" },
];

export function safeHostnameFromUrl(url = "", baseUrl = "https://example.invalid/") {
  try {
    return normalizeHostname(new URL(url, baseUrl).hostname);
  } catch {
    return "";
  }
}

export function findTrackerRule(domainOrUrl = "") {
  return TRACKER_RULES.find((rule) => rule.pattern.test(domainOrUrl)) || null;
}

export function classifyTrackerUrl({
  url = "",
  pageHostname = "",
  sourceType = "network",
  requestType = "",
} = {}) {
  const hostname = safeHostnameFromUrl(url);
  if (!hostname) return null;

  const rule = findTrackerRule(url) || findTrackerRule(hostname);
  if (!rule) return null;

  const firstParty = sameRegistrableDomain(hostname, pageHostname);
  const confidence = firstParty && rule.confidence === "high" ? "medium" : rule.confidence;

  return {
    id: rule.id,
    sourceType,
    requestType,
    hostname,
    url,
    vendor: rule.vendor,
    purpose: rule.purpose,
    category: rule.category,
    severity: rule.severity,
    confidence,
    firstParty,
    reason: `Known ${rule.vendor} ${rule.purpose} endpoint`,
  };
}
