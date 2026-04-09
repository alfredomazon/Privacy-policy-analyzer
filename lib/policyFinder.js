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

const HIGH_SIGNAL_LINK_PATTERNS = [
  /\bprivacy policy\b/i,
  /\bprivacy notice\b/i,
  /\bprivacy statement\b/i,
];

const MEDIUM_SIGNAL_LINK_PATTERNS = [
  /\bprivacy\b/i,
  /\bconsumer privacy\b/i,
  /\bprivacy rights\b/i,
];

const LOW_SIGNAL_LINK_PATTERNS = [
  /\bcookie policy\b/i,
  /\bdata policy\b/i,
  /\blegal\b/i,
  /\bpolicy\b/i,
];

const NEGATIVE_LINK_PATTERNS = [
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

function isLikelySearchUrl(urlText = "") {
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

function titleLooksLikeSearch(titleText = "") {
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

function looksLikePolicyMentionOnly(text = "", titleText = "", urlText = "") {
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

function getPageType(text = "", titleText = "", urlText = "") {
  if (isLikelySearchUrl(urlText) || titleLooksLikeSearch(titleText)) {
    return "search";
  }

  if (looksLikePolicyMentionOnly(text, titleText, urlText)) {
    return "policy-mention-only";
  }

  return "normal";
}

function scoreUrlQuality(urlText) {
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

function scoreTitleQuality(titleText) {
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

export function scorePolicyPage(text, titleText, urlText) {
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

export function scoreLinkSignal(haystack, absUrl, inFooterOrNav) {
  const safeHay = norm(haystack || "");
  const safeUrl = String(absUrl || "");

  if (isLikelySearchUrl(safeUrl) || titleLooksLikeSearch(safeHay)) {
    return -20;
  }

  let score = 0;

  for (const p of HIGH_SIGNAL_LINK_PATTERNS) {
    if (p.test(safeHay)) score += 8;
  }

  for (const p of MEDIUM_SIGNAL_LINK_PATTERNS) {
    if (p.test(safeHay)) score += 4;
  }

  for (const p of LOW_SIGNAL_LINK_PATTERNS) {
    if (p.test(safeHay)) score += 1;
  }

  for (const p of NEGATIVE_LINK_PATTERNS) {
    if (p.test(safeHay)) score -= 6;
  }

  score += scoreUrlQuality(safeUrl);

  if (inFooterOrNav) score += 1;

  if (/\/legal\b|\/policies\b|\/support\b|\/help\b/i.test(safeUrl)) {
    score -= 2;
  }

  if (/#|cookie|preferences|settings|consent/i.test(safeUrl)) {
    score -= 3;
  }

  return score;
}

function getRootDomain(hostname) {
  return String(hostname || "").split(".").slice(-2).join(".");
}

function extractHeadings(doc) {
  return Array.from(doc.querySelectorAll("h1, h2, h3"))
    .map((el) => norm(el.textContent || ""))
    .filter(Boolean)
    .join(" ");
}

function extractSourceBrandHints() {
  const host = window.location.hostname.replace(/^www\./, "");
  const domain = host.split(".").slice(-2)[0] || host;
  const title = document.title || "";
  const metaSite =
    document.querySelector('meta[property="og:site_name"]')?.content || "";

  return norm(`${domain} ${title} ${metaSite}`).toLowerCase();
}

function scoreBrandMatch(sourceHints, candidateText, candidateTitle) {
  const hay = norm(`${candidateTitle} ${candidateText}`).toLowerCase();
  const tokens = sourceHints
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }

  return Math.min(score, 5);
}

function estimateHubPenalty(text, htmlDoc) {
  if (!htmlDoc) return 0;

  const linkCount = htmlDoc.querySelectorAll("a[href]").length;
  const paragraphCount = htmlDoc.querySelectorAll("p").length;
  const textLen = norm(text || "").length;

  let penalty = 0;

  if (linkCount > 40) penalty += 3;
  if (paragraphCount > 0 && linkCount > paragraphCount * 2) penalty += 4;
  if (textLen < 1500 && linkCount > 20) penalty += 5;

  return penalty;
}

function extractPageMetaFromHtml(html, fallbackUrl = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());

  const title =
    norm(doc.querySelector("title")?.textContent || "") ||
    norm(doc.querySelector("h1")?.textContent || "");

  const h1 = norm(doc.querySelector("h1")?.textContent || "");
  const headings = extractHeadings(doc);
  const text = norm(doc.body?.innerText || "");
  const pageType = getPageType(text, `${title} ${h1}`, fallbackUrl);

  return {
    titleText: title,
    h1Text: h1,
    headings,
    text,
    urlText: fallbackUrl,
    pageType,
    _doc: doc,
  };
}

function classifyCandidateType(text, titleText, urlText) {
  const combined = `${text} ${titleText} ${urlText}`;
  const pageType = getPageType(text, titleText, urlText);

  if (pageType === "search") {
    return "search";
  }

  if (pageType === "policy-mention-only") {
    return "policy_mention_only";
  }

  if (
    /\bcookie preferences\b|\bcookie settings\b|\bmanage cookies\b|\bconsent preferences\b/i.test(
      combined
    )
  ) {
    return "cookie_settings";
  }

  if (
    /\bhelp center\b|\bsupport\b|\blegal center\b/i.test(combined) ||
    /\/support\b|\/help\b/i.test(urlText)
  ) {
    return "support_or_legal_hub";
  }

  if (
    /\bprivacy policy\b|\bprivacy notice\b|\bprivacy statement\b/i.test(combined)
  ) {
    return "privacy_policy";
  }

  if (/\bprivacy\b/i.test(combined)) {
    return "privacy_related";
  }

  return "unknown";
}

async function fetchCandidatePage(absUrl) {
  try {
    const res = await fetch(absUrl, {
      method: "GET",
      credentials: "omit",
      redirect: "follow",
    });

    if (!res.ok) {
      return {
        ok: false,
        url: absUrl,
        reason: `http_${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return {
        ok: false,
        url: res.url || absUrl,
        reason: "not_html",
      };
    }

    const html = await res.text();
    const meta = extractPageMetaFromHtml(html, res.url || absUrl);

    return {
      ok: true,
      url: res.url || absUrl,
      ...meta,
    };
  } catch (err) {
    return {
      ok: false,
      url: absUrl,
      reason: "fetch_failed",
      error: String(err?.message || err || ""),
    };
  }
}

function scoreFetchedCandidate(candidate, sourceHost) {
  const sourceRoot = getRootDomain(sourceHost);
  const candidateHost = new URL(candidate.url).hostname;
  const candidateRoot = getRootDomain(candidateHost);
  const sourceHints = extractSourceBrandHints();

  let score = 0;
  const pageScore = scorePolicyPage(
    candidate.text,
    `${candidate.titleText} ${candidate.h1Text}`,
    candidate.url
  );

  score += pageScore;

  if (candidateHost === sourceHost) score += 5;
  else if (candidateRoot === sourceRoot) score += 2;
  else score -= 6;

  const candidateType = classifyCandidateType(
    candidate.text,
    `${candidate.titleText} ${candidate.h1Text}`,
    candidate.url
  );

  if (candidateType === "privacy_policy") score += 6;
  if (candidateType === "privacy_related") score += 1;
  if (candidateType === "support_or_legal_hub") score -= 8;
  if (candidateType === "cookie_settings") score -= 12;
  if (candidateType === "search") score -= 20;
  if (candidateType === "policy_mention_only") score -= 10;

  const headingScore = countMatches(candidate.headings || "", HEADING_POLICY_PATTERNS);
  score += headingScore * 3;

  score += scoreBrandMatch(sourceHints, candidate.text, candidate.titleText) * 2;

  score -= estimateHubPenalty(candidate.text, candidate._doc);

  return {
    finalScore: Math.round(score),
    pageScore,
    candidateType,
    pageType: candidate.pageType || getPageType(candidate.text, candidate.titleText, candidate.url),
  };
}

function collectCandidateLinks() {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const candidates = [];

  for (const a of anchors) {
    const hrefRaw = a.getAttribute("href") || "";
    const text = norm(a.innerText || a.getAttribute("aria-label") || "");
    const rel = norm(a.getAttribute("rel") || "");
    const title = norm(a.getAttribute("title") || "");
    const hay = `${text} ${title} ${rel} ${hrefRaw}`.toLowerCase();

    try {
      const abs = new URL(hrefRaw, window.location.href).toString();

      if (
        abs.startsWith("javascript:") ||
        abs.startsWith("mailto:") ||
        abs.startsWith("tel:")
      ) {
        continue;
      }

      const urlObj = new URL(abs);
      const sameHost = urlObj.host === window.location.host;
      const sameRootDomain =
        getRootDomain(urlObj.hostname) === getRootDomain(window.location.hostname);

      let score = scoreLinkSignal(
        hay,
        abs,
        !!a.closest("footer, .footer, nav")
      );

      if (sameHost) score += 3;
      else if (sameRootDomain) score += 1;
      else score -= 4;

      if (score <= 1) continue;

      candidates.push({
        url: abs,
        anchorText: text,
        anchorTitle: title,
        initialScore: score,
      });
    } catch {}
  }

  const deduped = new Map();

  for (const item of candidates) {
    const prev = deduped.get(item.url);
    if (!prev || item.initialScore > prev.initialScore) {
      deduped.set(item.url, item);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.initialScore - a.initialScore);
}

export async function findBestPolicyLink() {
  const initialCandidates = collectCandidateLinks();
  const topCandidates = initialCandidates.slice(0, 3);

  if (!topCandidates.length) {
    return {
      bestPolicyLink: "",
      bestLinkScore: 0,
      confidence: "Low",
      checkedCandidates: [],
    };
  }

  const fetchResults = await Promise.all(
    topCandidates.map(async (candidate) => {
      const fetched = await fetchCandidatePage(candidate.url);

      if (!fetched.ok) {
        return {
          url: candidate.url,
          anchorText: candidate.anchorText,
          initialScore: candidate.initialScore,
          fetched: false,
          finalScore: candidate.initialScore - 5,
          confidence: "Low",
          type: "unavailable",
          pageType: "unavailable",
          reason: fetched.reason,
        };
      }

      const { finalScore, pageScore, candidateType, pageType } = scoreFetchedCandidate(
        fetched,
        window.location.hostname
      );

      return {
        url: fetched.url,
        anchorText: candidate.anchorText,
        initialScore: candidate.initialScore,
        pageScore,
        finalScore,
        fetched: true,
        type: candidateType,
        pageType,
        confidence: classifyPageConfidence(finalScore),
        titleText: fetched.titleText,
      };
    })
  );

  const checkedCandidates = fetchResults.sort((a, b) => b.finalScore - a.finalScore);
  const best = checkedCandidates[0];

  if (!best || best.finalScore < 16) {
    return {
      bestPolicyLink: "",
      bestLinkScore: 0,
      confidence: "Low",
      checkedCandidates,
    };
  }

  return {
    bestPolicyLink: best.url,
    bestLinkScore: best.finalScore,
    confidence: classifyPageConfidence(best.finalScore),
    checkedCandidates,
  };
}