import { norm, countMatches } from "./utils.js";

const STRONG_PAGE_HINTS = [
  /\bprivacy policy\b/i,
  /\bprivacy notice\b/i,
  /\bprivacy statement\b/i,
  /\bconsumer privacy notice\b/i,
  /\binformation we collect\b/i,
  /\bhow we collect\b/i,
  /\bhow we use\b/i,
  /\bhow we share\b/i,
  /\bpersonal information\b/i,
  /\bpersonal data\b/i,
  /\bdata retention\b/i,
  /\byour rights\b/i,
  /\bcontact us\b/i,
];

const MEDIUM_PAGE_HINTS = [
  /\bconsumer privacy\b/i,
  /\bprivacy rights\b/i,
  /\bdata subject\b/i,
  /\bgdpr\b/i,
  /\bccpa\b/i,
  /\bcpra\b/i,
  /\bthird[- ]party\b/i,
  /\bcookies\b/i,
  /\btracking\b/i,
  /\bchildren('?s)? privacy\b/i,
];

const WEAK_PAGE_HINTS = [
  /\bcookie policy\b/i,
  /\bdata policy\b/i,
  /\blegal\b/i,
  /\bpolicy\b/i,
];

const NEGATIVE_PAGE_HINTS = [
  /\bcookie preferences\b/i,
  /\bcookie settings\b/i,
  /\bmanage cookies\b/i,
  /\bprivacy choices\b/i,
  /\byour privacy choices\b/i,
  /\bad choices\b/i,
  /\bdo not sell\b/i,
  /\bdo not sell or share\b/i,
  /\blegal center\b/i,
  /\bhelp center\b/i,
  /\bsupport\b/i,
  /\bterms of service\b/i,
  /\bterms and conditions\b/i,
  /\baccept cookies\b/i,
  /\bconsent preferences\b/i,
];

const PRIVACY_TOPIC_PATTERNS = {
  collection: [
    /\binformation we collect\b/i,
    /\bdata we collect\b/i,
    /\bpersonal information we collect\b/i,
  ],
  use: [
    /\bhow we use\b/i,
    /\buse of information\b/i,
    /\buse your data\b/i,
  ],
  sharing: [
    /\bhow we share\b/i,
    /\bshare with third parties\b/i,
    /\bdisclose\b/i,
  ],
  cookies: [/\bcookies\b/i, /\btracking\b/i, /\banalytics\b/i],
  rights: [
    /\byour rights\b/i,
    /\bright to access\b/i,
    /\bright to delete\b/i,
    /\bprivacy rights\b/i,
  ],
  retention: [
    /\bdata retention\b/i,
    /\bretain\b/i,
    /\bstore your information\b/i,
  ],
  children: [/\bchildren('?s)? privacy\b/i, /\bunder 13\b/i, /\bminors\b/i],
  contact: [
    /\bcontact us\b/i,
    /\bcontact information\b/i,
    /\bprivacy questions\b/i,
  ],
};

const HEADING_POLICY_PATTERNS = [
  /\binformation we collect\b/i,
  /\bhow we use\b/i,
  /\bhow we share\b/i,
  /\bcookies\b/i,
  /\byour rights\b/i,
  /\bdata retention\b/i,
  /\bchildren('?s)? privacy\b/i,
  /\bcontact us\b/i,
];

const FAST_STRONG_POLICY_TERMS = [
  /\bpersonal information\b/i,
  /\bpersonal data\b/i,
  /\binformation we collect\b/i,
  /\bhow we use\b/i,
  /\bhow we share\b/i,
  /\bcookies\b/i,
  /\byour rights\b/i,
  /\bdata retention\b/i,
  /\bgdpr\b/i,
  /\bccpa\b/i,
];

function countTopicCoverage(text) {
  let topics = 0;
  for (const patterns of Object.values(PRIVACY_TOPIC_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) topics += 1;
  }
  return topics;
}

function estimateDocumentStructure(text) {
  const clean = norm(text || "");
  const len = clean.length;
  let score = 0;

  if (len >= 1200) score += 2;
  if (len >= 2500) score += 2;
  if (len >= 5000) score += 2;

  const headingsLike = countMatches(clean, HEADING_POLICY_PATTERNS);
  score += Math.min(headingsLike, 4);

  return score;
}

function getFastTextSample(text = "", limit = 4000) {
  return norm(String(text || "")).slice(0, limit);
}

function countFastStrongTerms(sampleText = "") {
  return countMatches(sampleText, FAST_STRONG_POLICY_TERMS);
}

export function isLikelySearchUrl(urlText = "") {
  try {
    const url = new URL(String(urlText || ""), window.location.href);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase();

    const searchHosts = new Set([
      "google.com",
      "bing.com",
      "duckduckgo.com",
      "search.yahoo.com",
      "search.brave.com",
      "startpage.com",
      "ecosia.org",
    ]);

    if (searchHosts.has(host)) return true;
    if (path === "/search" || path.startsWith("/search/")) return true;
    if (path.includes("/results")) return true;

    const searchParams = ["q", "query", "p", "s", "search"];
    for (const key of searchParams) {
      if (url.searchParams.has(key) && (path.includes("search") || searchHosts.has(host))) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function titleLooksLikeSearch(titleText = "") {
  const t = norm(titleText || "");
  return (
    /\bgoogle search\b/i.test(t) ||
    /\bsearch results\b/i.test(t) ||
    /\bresults for\b/i.test(t) ||
    /\bbing\b/i.test(t) ||
    /\bduckduckgo\b/i.test(t) ||
    /\bsite:/i.test(t) ||
    /"privacy policy"/i.test(t)
  );
}

export function looksLikePolicyMentionOnly(text = "", titleText = "", urlText = "") {
  const sample = getFastTextSample(text);
  const combined = `${sample} ${norm(titleText || "")} ${String(urlText || "")}`;

  const mentionsPolicyPhrase =
    /\bprivacy policy\b|\bprivacy notice\b|\bprivacy statement\b/i.test(combined);

  if (!mentionsPolicyPhrase) return false;

  const fastStrongCount = countFastStrongTerms(sample);
  const hasStrongPolicyUrl =
    /\/privacy-policy\b|\/privacy-notice\b|\/privacy-statement\b|\/privacy\b/i.test(
      String(urlText || "")
    );

  return !hasStrongPolicyUrl && fastStrongCount < 2;
}

export function getPageType(text = "", titleText = "", urlText = "") {
  if (isLikelySearchUrl(urlText) || titleLooksLikeSearch(titleText)) {
    return "search";
  }

  if (looksLikePolicyMentionOnly(text, titleText, urlText)) {
    return "policy-mention-only";
  }

  return "normal";
}

export function scoreUrlQuality(urlText = "") {
  let score = 0;

  if (/\/privacy-policy\b/i.test(urlText)) score += 8;
  else if (/\/privacy-notice\b/i.test(urlText)) score += 8;
  else if (/\/privacy-statement\b/i.test(urlText)) score += 8;
  else if (/\/privacy\b/i.test(urlText)) score += 6;
  else if (/\/cookie-policy\b/i.test(urlText)) score += 2;
  else if (/\/cookies\b/i.test(urlText)) score += 1;
  else if (/\/legal\b|\/policies\b|\/terms\b|\/support\b|\/help\b/i.test(urlText)) {
    score -= 2;
  }

  if (
    /cookie-settings|manage-cookies|privacy-choices|ad-choices|consent|preferences/i.test(
      urlText
    )
  ) {
    score -= 6;
  }

  if (isLikelySearchUrl(urlText)) {
    score -= 12;
  }

  return score;
}

export function scoreTitleQuality(titleText = "") {
  let score = 0;

  if (/\bprivacy policy\b/i.test(titleText)) score += 8;
  else if (/\bprivacy notice\b/i.test(titleText)) score += 8;
  else if (/\bprivacy statement\b/i.test(titleText)) score += 8;
  else if (/\bprivacy\b/i.test(titleText)) score += 4;

  if (
    /\bcookie preferences\b|\bcookie settings\b|\bprivacy choices\b|\blegal center\b|\bhelp center\b|\bsupport\b|\bterms\b/i.test(
      titleText
    )
  ) {
    score -= 5;
  }

  if (titleLooksLikeSearch(titleText)) {
    score -= 10;
  }

  return score;
}

export function scorePolicyPage(text = "", titleText = "", urlText = "") {
  const safeText = norm(text || "");
  const safeTitle = norm(titleText || "");
  const safeUrl = String(urlText || "");
  const combinedTitle = `${safeTitle} ${safeUrl}`;
  const pageType = getPageType(safeText, safeTitle, safeUrl);

  if (pageType === "search") {
    return 0;
  }

  let score = 0;

  score += countMatches(safeText, STRONG_PAGE_HINTS) * 2;
  score += countMatches(combinedTitle, STRONG_PAGE_HINTS) * 3;

  score += countMatches(safeText, MEDIUM_PAGE_HINTS);
  score += countMatches(combinedTitle, MEDIUM_PAGE_HINTS) * 2;

  score += countMatches(safeText, WEAK_PAGE_HINTS) * 0.5;
  score += countMatches(combinedTitle, WEAK_PAGE_HINTS);

  score -= countMatches(safeText, NEGATIVE_PAGE_HINTS) * 2;
  score -= countMatches(combinedTitle, NEGATIVE_PAGE_HINTS) * 3;

  score += scoreUrlQuality(safeUrl);
  score += scoreTitleQuality(safeTitle);

  const topicCoverage = countTopicCoverage(safeText);
  score += topicCoverage * 2;

  const structureScore = estimateDocumentStructure(safeText);
  score += structureScore;

  if (safeText.length < 800) score -= 5;
  else if (safeText.length < 1500) score -= 2;

  if (
    !/\bprivacy policy\b|\bprivacy notice\b|\bprivacy statement\b/i.test(combinedTitle) &&
    topicCoverage < 2
  ) {
    score -= 4;
  }

  if (pageType === "policy-mention-only") {
    score -= 10;
  }

  const sample = getFastTextSample(safeText);
  const fastStrongCount = countFastStrongTerms(sample);
  const hasStrongPolicyUrl =
    /\/privacy-policy\b|\/privacy-notice\b|\/privacy-statement\b|\/privacy\b/i.test(
      safeUrl
    );

  if (!hasStrongPolicyUrl && fastStrongCount < 2 && topicCoverage < 2) {
    score -= 6;
  }

  return Math.max(0, Math.round(score));
}

export function classifyPageConfidence(score) {
  if (score >= 24) return "High";
  if (score >= 14) return "Medium";
  return "Low";
}

/**
 * Cheap first-pass detector.
 * Use this before doing heavier extraction.
 */
export function detectPolicyPageQuick({
  text = "",
  titleText = "",
  urlText = "",
} = {}) {
  const sample = getFastTextSample(text, 2500);
  const score = scorePolicyPage(sample, titleText, urlText);
  const confidence = classifyPageConfidence(score);

  return {
    isPolicy: score >= 14,
    score,
    confidence,
    pageType: getPageType(sample, titleText, urlText),
  };
}