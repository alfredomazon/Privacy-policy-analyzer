import {
  getDomainBrandToken,
  getRegistrableDomain,
  sameRegistrableDomain,
} from "./domainUtils.js";
import { classifyTrackerUrl } from "./trackerRegistry.js";

const TRACKER_RESOURCE_TYPES = [
  "script",
  "image",
  "xmlhttprequest",
  "sub_frame",
  "ping",
  "websocket",
  "other",
];

const AD_RESOURCE_TYPES = [
  "script",
  "image",
  "xmlhttprequest",
  "sub_frame",
  "ping",
  "media",
  "other",
];

const THIRD_PARTY_SCRIPT_TYPES = ["script"];
const THIRD_PARTY_FRAME_TYPES = ["sub_frame"];

const TRACKER_BLOCK_FILTERS = [
  {
    id: "google_analytics",
    label: "Google Analytics",
    domains: ["google-analytics.com", "analytics.google.com"],
    purpose: "analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "google_tag_manager",
    label: "Google Tag Manager",
    domains: ["googletagmanager.com"],
    purpose: "tag manager",
    category: "tracking",
    severity: "medium",
    confidence: "medium",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "doubleclick",
    label: "DoubleClick",
    domains: ["doubleclick.net", "adservice.google.com"],
    purpose: "advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "meta_pixel",
    label: "Meta/Facebook",
    domains: ["connect.facebook.net", "facebook.com"],
    urlIncludes: ["/tr", "/fbevents"],
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "tiktok_pixel",
    label: "TikTok Pixel",
    domains: ["analytics.tiktok.com", "business-api.tiktok.com"],
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "linkedin_insight",
    label: "LinkedIn Insights",
    domains: ["snap.licdn.com"],
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "session_replay",
    label: "Session replay or heatmap service",
    domains: [
      "hotjar.com",
      "static.hotjar.com",
      "fullstory.com",
      "edge.fullstory.com",
      "clarity.ms",
      "crazyegg.com",
    ],
    purpose: "session replay",
    category: "tracking",
    severity: "high",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "product_analytics",
    label: "Product analytics",
    domains: [
      "segment.com",
      "cdn.segment.com",
      "api.segment.io",
      "mixpanel.com",
      "cdn.mxpnl.com",
      "amplitude.com",
      "cdn.amplitude.com",
      "heap.io",
    ],
    purpose: "product analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
  {
    id: "adobe_analytics",
    label: "Adobe Analytics",
    domains: ["omtrdc.net", "2o7.net", "adobedc.net"],
    purpose: "analytics",
    category: "tracking",
    severity: "medium",
    confidence: "high",
    resourceTypes: TRACKER_RESOURCE_TYPES,
  },
];

const AD_BLOCK_FILTERS = [
  {
    id: "google_ads",
    label: "Google ad request",
    domains: [
      "doubleclick.net",
      "googlesyndication.com",
      "googleadservices.com",
      "adservice.google.com",
      "securepubads.g.doubleclick.net",
      "pagead2.googlesyndication.com",
    ],
    purpose: "advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
    resourceTypes: AD_RESOURCE_TYPES,
  },
  {
    id: "social_ads",
    label: "Social ad pixel",
    domains: [
      "connect.facebook.net",
      "analytics.tiktok.com",
      "business-api.tiktok.com",
      "snap.licdn.com",
      "static.ads-twitter.com",
      "analytics.twitter.com",
      "events.redditmedia.com",
    ],
    purpose: "social advertising",
    category: "sharing",
    severity: "high",
    confidence: "high",
    resourceTypes: AD_RESOURCE_TYPES,
  },
];

const CORE_RESOURCE_ALLOWLIST = [
  {
    hostPattern: /(^|\.)youtube\.com$/i,
    resourceDomains: [
      "youtube.com",
      "youtube-nocookie.com",
      "ytimg.com",
      "googlevideo.com",
      "gstatic.com",
      "ggpht.com",
    ],
  },
];

const AFFILIATED_RESOURCE_ALLOWLIST = [
  {
    hostPattern: /(^|\.)walmart\.com$/i,
    resourceDomains: ["walmartimages.com"],
  },
  {
    hostPattern: /(^|\.)bestbuy\.com$/i,
    resourceDomains: ["bbystatic.com", "bestbuy.ca"],
  },
  {
    hostPattern: /(^|\.)target\.com$/i,
    resourceDomains: ["targetimg1.com"],
  },
];

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_reader",
  "utm_viz_id",
  "utm_pubreferrer",
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "vero_id",
  "yclid",
  "_hsenc",
  "_hsmi",
]);

const REDIRECT_PARAM_CANDIDATES = [
  "url",
  "u",
  "target",
  "redirect",
  "redirect_url",
  "destination",
  "dest",
  "to",
  "r",
];

function normalizeHost(hostname = "") {
  return String(hostname || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./i, "")
    .toLowerCase();
}

function getHostFromUrl(url = "", baseUrl = "https://example.invalid/") {
  try {
    return normalizeHost(new URL(url, baseUrl).hostname);
  } catch {
    return "";
  }
}

function domainMatches(hostname = "", domain = "") {
  const host = normalizeHost(hostname);
  const target = normalizeHost(domain);

  return !!host && !!target && (host === target || host.endsWith(`.${target}`));
}

function filterMatchesUrl(filter, url = "", requestHost = "") {
  const hostMatches = (filter.domains || []).some((domain) =>
    domainMatches(requestHost, domain)
  );

  if (!hostMatches) return false;

  if (Array.isArray(filter.urlIncludes) && filter.urlIncludes.length) {
    const lowerUrl = String(url || "").toLowerCase();
    return filter.urlIncludes.some((needle) =>
      lowerUrl.includes(String(needle).toLowerCase())
    );
  }

  return true;
}

function normalizeRequestType(type = "") {
  const value = String(type || "").toLowerCase();

  if (value === "iframe" || value === "frame") return "sub_frame";
  if (value === "fetch" || value === "xhr") return "xmlhttprequest";
  if (value === "img") return "image";
  if (value === "link") return "stylesheet";

  return value || "other";
}

function isThirdPartyRequest(url = "", pageHostname = "") {
  const requestHost = getHostFromUrl(url);
  return !!requestHost && !!pageHostname && !sameRegistrableDomain(requestHost, pageHostname);
}

function isCoreAllowedResource(url = "", pageHostname = "") {
  const pageHost = normalizeHost(pageHostname);
  const requestHost = getHostFromUrl(url);

  return CORE_RESOURCE_ALLOWLIST.some(
    (entry) =>
      entry.hostPattern.test(pageHost) &&
      entry.resourceDomains.some((domain) => domainMatches(requestHost, domain))
  );
}

function isKnownAffiliatedResource(url = "", pageHostname = "") {
  const pageHost = normalizeHost(pageHostname);
  const requestHost = getHostFromUrl(url);

  return AFFILIATED_RESOURCE_ALLOWLIST.some(
    (entry) =>
      entry.hostPattern.test(pageHost) &&
      entry.resourceDomains.some((domain) => domainMatches(requestHost, domain))
  );
}

function isLikelyBrandedAssetDomain(url = "", pageHostname = "") {
  const requestHost = getHostFromUrl(url);
  const pageBrand = getDomainBrandToken(pageHostname);
  const requestBrand = getDomainBrandToken(requestHost);

  if (!pageBrand || !requestBrand || pageBrand.length < 4) return false;

  return requestBrand === pageBrand || requestBrand.startsWith(pageBrand);
}

function isAffiliatedResource(url = "", pageHostname = "") {
  return (
    isKnownAffiliatedResource(url, pageHostname) ||
    isLikelyBrandedAssetDomain(url, pageHostname)
  );
}

function classificationFromFilter(filter, url, requestType, reason) {
  return {
    id: filter.id,
    vendor: filter.label,
    label: filter.label,
    purpose: filter.purpose,
    category: filter.category,
    severity: filter.severity,
    confidence: filter.confidence,
    url,
    hostname: getHostFromUrl(url),
    requestType,
    sourceType: "protection",
    reason,
  };
}

export function classifyProtectionRequest({
  url = "",
  pageHostname = "",
  requestType = "",
  rules = {},
} = {}) {
  if (!url || !pageHostname || isCoreAllowedResource(url, pageHostname)) {
    return null;
  }

  const normalizedType = normalizeRequestType(requestType);
  const requestHost = getHostFromUrl(url);
  const thirdParty = isThirdPartyRequest(url, pageHostname);

  if (rules.blockTrackers) {
    const tracker = classifyTrackerUrl({
      url,
      pageHostname,
      sourceType: "protection",
      requestType: normalizedType,
    });

    if (tracker) {
      return {
        ...tracker,
        label: tracker.vendor,
        reason: "Matched known tracker rule",
      };
    }

    const staticTracker = TRACKER_BLOCK_FILTERS.find(
      (filter) =>
        filter.resourceTypes.includes(normalizedType) &&
        filterMatchesUrl(filter, url, requestHost)
    );

    if (staticTracker) {
      return classificationFromFilter(
        staticTracker,
        url,
        normalizedType,
        "Matched static tracker filter"
      );
    }
  }

  if (rules.removeAds) {
    const adFilter = AD_BLOCK_FILTERS.find(
      (filter) =>
        filter.resourceTypes.includes(normalizedType) &&
        filterMatchesUrl(filter, url, requestHost)
    );

    if (adFilter) {
      return classificationFromFilter(
        adFilter,
        url,
        normalizedType,
        "Matched static ad filter"
      );
    }
  }

  if (
    rules.blockThirdPartyScripts &&
    thirdParty &&
    normalizedType === "script" &&
    !isAffiliatedResource(url, pageHostname)
  ) {
    return {
      id: "third_party_script",
      vendor: "Third-party script",
      label: "Third-party script",
      purpose: "third-party script",
      category: "tracking",
      severity: "medium",
      confidence: "medium",
      url,
      hostname: requestHost,
      requestType: normalizedType,
      sourceType: "protection",
      reason: "Third-party script blocked by site rule",
    };
  }

  if (
    rules.blockIframes &&
    thirdParty &&
    normalizedType === "sub_frame" &&
    !isAffiliatedResource(url, pageHostname)
  ) {
    return {
      id: "third_party_iframe",
      vendor: "Third-party iframe",
      label: "Third-party iframe",
      purpose: "third-party iframe",
      category: "tracking",
      severity: "medium",
      confidence: "medium",
      url,
      hostname: requestHost,
      requestType: normalizedType,
      sourceType: "protection",
      reason: "Third-party iframe blocked by site rule",
    };
  }

  return null;
}

function dnrConditionForFilter(hostname, filter, extra = {}) {
  return {
    initiatorDomains: [
      ...new Set(
        [normalizeHost(hostname), getRegistrableDomain(hostname)].filter(Boolean)
      ),
    ],
    requestDomains: filter.domains.map(normalizeHost).filter(Boolean),
    resourceTypes: filter.resourceTypes,
    ...extra,
  };
}

export function buildDynamicProtectionRulesForHost({
  hostname = "",
  rules = {},
  startId = 1,
} = {}) {
  const host = normalizeHost(hostname);
  if (!host) return [];

  const out = [];
  let nextId = startId;

  const pushBlockRule = (filter, priority = 1) => {
    if (Array.isArray(filter.urlIncludes) && filter.urlIncludes.length) {
      return;
    }

    out.push({
      id: nextId,
      priority,
      action: { type: "block" },
      condition: dnrConditionForFilter(host, filter),
      _filterId: filter.id,
    });
    nextId += 1;
  };

  if (rules.blockTrackers) {
    for (const filter of TRACKER_BLOCK_FILTERS) {
      pushBlockRule(filter, filter.severity === "high" ? 3 : 2);
    }
  }

  if (rules.removeAds) {
    for (const filter of AD_BLOCK_FILTERS) {
      pushBlockRule(filter, 3);
    }
  }

  return out;
}

export function sanitizeTrackingUrl(rawUrl = "", baseUrl = "") {
  let parsed;
  try {
    parsed = new URL(rawUrl, baseUrl || undefined);
  } catch {
    return {
      changed: false,
      url: rawUrl,
      removedParams: [],
      unwrapped: false,
    };
  }

  const original = parsed.toString();
  const removedParams = [];

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
      removedParams.push(key);
    }
  }

  for (const key of REDIRECT_PARAM_CANDIDATES) {
    const value = parsed.searchParams.get(key);
    if (!value || !/^https?:\/\//i.test(value)) continue;

    try {
      const unwrapped = new URL(value);
      if (unwrapped.protocol === "http:" || unwrapped.protocol === "https:") {
        return {
          changed: true,
          url: unwrapped.toString(),
          removedParams,
          unwrapped: true,
        };
      }
    } catch {}
  }

  const cleaned = parsed.toString();
  return {
    changed: cleaned !== original,
    url: cleaned,
    removedParams,
    unwrapped: false,
  };
}

export const PROTECTION_RULES_FOR_TESTS = {
  TRACKER_BLOCK_FILTERS,
  AD_BLOCK_FILTERS,
  CORE_RESOURCE_ALLOWLIST,
  AFFILIATED_RESOURCE_ALLOWLIST,
};
