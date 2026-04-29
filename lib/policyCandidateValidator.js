import { norm, countMatches } from "./utils.js";
import {
  getDomainBrandToken,
  sameRegistrableDomain,
} from "./domainUtils.js";
import { extractPolicyFreshness } from "./policyMetadata.js";

const MAIN_POLICY_PHRASES = [
  /\bprivacy policy\b/i,
  /\bprivacy notice\b/i,
  /\bprivacy statement\b/i,
  /\bconsumer privacy notice\b/i,
];

const NARROW_OR_NON_POLICY_PATTERNS = [
  /\bcookie preferences\b/i,
  /\bcookie settings\b/i,
  /\bmanage cookies\b/i,
  /\bprivacy choices\b/i,
  /\byour privacy choices\b/i,
  /\bnotice at collection\b/i,
  /\bstate privacy rights\b/i,
  /\bhealth data privacy\b/i,
  /\binterest[- ]based ads\b/i,
  /\btargeted advertising opt out\b/i,
  /\blimit use of my sensitive personal information\b/i,
  /\blegal center\b/i,
  /\bhelp center\b/i,
  /\bsupport\b/i,
  /\bterms of service\b/i,
  /\bterms and conditions\b/i,
];

const POLICY_TOPICS = {
  collection: [
    /\binformation we collect\b/i,
    /\bdata we collect\b/i,
    /\bpersonal information we collect\b/i,
  ],
  use: [/\bhow we use\b/i, /\buse your information\b/i, /\buse of information\b/i],
  sharing: [
    /\bhow we share\b/i,
    /\bshare your information\b/i,
    /\bdisclose your information\b/i,
    /\bthird part(y|ies)\b/i,
  ],
  cookies: [/\bcookies\b/i, /\btracking technologies\b/i, /\banalytics\b/i],
  rights: [/\byour rights\b/i, /\bprivacy rights\b/i, /\bright to access\b/i],
  retention: [/\bretain\b/i, /\bretention\b/i, /\bstore your information\b/i],
  contact: [/\bcontact us\b/i, /\bprivacy questions\b/i],
};

function getTopicCoverage(text = "") {
  const topics = [];

  for (const [topic, patterns] of Object.entries(POLICY_TOPICS)) {
    if (patterns.some((pattern) => pattern.test(text))) topics.push(topic);
  }

  return topics;
}

function hasBrandMatch(sourceHost, candidateHost, text = "", title = "") {
  if (sameRegistrableDomain(sourceHost, candidateHost)) return true;

  const token = getDomainBrandToken(sourceHost);
  if (!token || token.length < 4) return false;

  const hay = norm(`${title} ${text}`).toLowerCase();
  return hay.includes(token);
}

export function validatePolicyCandidate({
  text = "",
  titleText = "",
  h1Text = "",
  url = "",
  pageType = "normal",
  candidateType = "unknown",
  sourceHost = "",
  candidateHost = "",
} = {}) {
  const cleanText = norm(text || "");
  const headingText = norm(`${titleText} ${h1Text}`);
  const combined = `${cleanText} ${headingText} ${url}`;
  const textLength = cleanText.length;
  const topics = getTopicCoverage(combined);
  const mainPhraseCount = countMatches(`${headingText} ${url}`, MAIN_POLICY_PHRASES);
  const bodyMainPhraseCount = countMatches(cleanText.slice(0, 3000), MAIN_POLICY_PHRASES);
  const narrowCount = countMatches(combined, NARROW_OR_NON_POLICY_PATTERNS);
  const brandMatched = hasBrandMatch(sourceHost, candidateHost, cleanText, headingText);
  const freshness = extractPolicyFreshness(combined);
  const rejections = [];
  const signals = [];
  let scoreAdjustment = 0;

  if (pageType === "search") rejections.push("search-page");
  if (pageType === "policy-mention-only") rejections.push("mention-only");
  if (candidateType === "cookie_settings") rejections.push("cookie-settings");
  if (candidateType === "privacy_controls") rejections.push("privacy-controls");
  if (candidateType === "support_or_legal_hub") rejections.push("support-or-legal-hub");
  if (textLength < 600 && mainPhraseCount === 0) rejections.push("too-short");
  if (topics.length < 2 && mainPhraseCount === 0 && bodyMainPhraseCount === 0) {
    rejections.push("low-topic-coverage");
  }
  if (!brandMatched) rejections.push("brand-mismatch");
  if (narrowCount > 0 && candidateType !== "privacy_policy") {
    rejections.push("narrow-policy-page");
  }

  if (mainPhraseCount > 0) {
    scoreAdjustment += 6;
    signals.push("main-policy-title-url");
  }
  if (bodyMainPhraseCount > 0) {
    scoreAdjustment += 3;
    signals.push("main-policy-body");
  }
  if (topics.length >= 2) {
    scoreAdjustment += Math.min(8, topics.length * 2);
    signals.push("topic-coverage");
  }
  if (textLength >= 1500) {
    scoreAdjustment += 3;
    signals.push("substantial-text");
  }
  if (brandMatched) {
    scoreAdjustment += 4;
    signals.push("brand-match");
  }
  if (freshness.found) {
    scoreAdjustment += freshness.status === "stale" ? -1 : 2;
    signals.push("freshness-date");
  }

  if (rejections.includes("brand-mismatch")) scoreAdjustment -= 10;
  if (rejections.includes("too-short")) scoreAdjustment -= 8;
  if (rejections.includes("low-topic-coverage")) scoreAdjustment -= 8;
  if (rejections.includes("narrow-policy-page")) scoreAdjustment -= 10;
  if (["search", "policy_mention_only", "cookie_settings", "privacy_controls", "support_or_legal_hub"].includes(candidateType)) {
    scoreAdjustment -= 14;
  }

  const isMainPolicy =
    rejections.length === 0 ||
    (
      brandMatched &&
      (mainPhraseCount > 0 || bodyMainPhraseCount > 0) &&
      topics.length >= 2 &&
      !rejections.some((reason) =>
        ["search-page", "cookie-settings", "privacy-controls", "support-or-legal-hub"].includes(reason)
      )
    );

  return {
    isMainPolicy,
    scoreAdjustment,
    textLength,
    topics,
    topicCoverage: topics.length,
    mainPhraseCount,
    bodyMainPhraseCount,
    brandMatched,
    freshness,
    rejections,
    signals,
  };
}
