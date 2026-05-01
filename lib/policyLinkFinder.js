import { norm, countMatches } from "./utils.js";
import {
  scorePolicyPage,
  classifyPageConfidence,
  getPageType,
  isLikelySearchUrl,
  looksLikeInformationalArticle,
  titleLooksLikeSearch,
  scoreUrlQuality,
} from "./policyDetector.js";
import { getKnownPolicyForHost } from "./policyRegistry.js";
import {
  getDomainBrandToken,
  getRegistrableDomain,
  sameRegistrableDomain,
} from "./domainUtils.js";
import { validatePolicyCandidate } from "./policyCandidateValidator.js";

const HIGH_SIGNAL_LINK_PATTERNS = [
  /\bprivacy policy\b/i,
  /\bprivacy notice\b/i,
  /\bprivacy statement\b/i,
];

const MEDIUM_SIGNAL_LINK_PATTERNS = [
  /\bprivacy\b/i,
  /\bconsumer privacy\b/i,
  /\bprivacy rights\b/i,
  /\bprivacy center\b/i,
  /\bprivacy & security\b/i,
  /\bprivacy and security\b/i,
  /\bdata privacy\b/i,
  /\btrust center\b/i,
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
  /\bcustomer privacy center\b/i,
  /\bnotice at collection\b/i,
  /\bstate privacy rights\b/i,
  /\bhealth data privacy\b/i,
  /\binterest[- ]based ads\b/i,
  /\btargeted advertising opt out\b/i,
  /\blimit use of my sensitive personal information\b/i,
  /\bad choices\b/i,
  /\bdo not sell\b/i,
  /\bdo not sell or share\b/i,
  /\blegal center\b/i,
  /\bhelp center\b/i,
  /\bsupport\b/i,
  /\bterms of service\b/i,
  /\bterms and conditions\b/i,
];

const INFRASTRUCTURE_POLICY_HOST_PATTERNS = [
  /(?:^|\.)cloudflare\.com$/i,
];

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

const MAX_CANDIDATES_TO_FETCH = 6;
const MIN_FINAL_SCORE = 13;
const MAX_ROOT_SCAN_CANDIDATES = 5;
const MAX_COMMON_PROBES = 14;

const COMMON_PRIVACY_PATHS = [
  "/privacy",
  "/privacy/",
  "/privacy-policy",
  "/privacy-policy/",
  "/privacy-notice",
  "/privacy-notice/",
  "/privacy-statement",
  "/privacy-statement/",
  "/legal/privacy",
  "/legal/privacy/",
  "/legal/privacy-policy",
  "/policies/privacy",
  "/policies/privacy/",
  "/policy/privacy",
  "/company/privacy",
  "/about/privacy",
  "/about-nvidia/privacy-policy/",
  "/us-en/privacy/ww-privacy.html",
  "/us-en/privacy/privacy-central.html",
];

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

  if (
    inFooterOrNav &&
    /^privacy$/i.test(safeHay) &&
    /\/privacy-policy\b|\/privacy-notice\b|\/privacy-statement\b|\/privacy\b/i.test(safeUrl)
  ) {
    score += 8;
  }

  if (/\bprivacy policy hub\b/i.test(safeHay)) {
    score += 6;
  }

  if (inFooterOrNav && /^\s*privacy notice\s*$/i.test(safeHay)) {
    score += 8;
  }

  score += scoreUrlQuality(safeUrl);

  if (inFooterOrNav) score += 1;

  if (/\/legal\b|\/policies\b|\/support\b|\/help\b/i.test(safeUrl)) {
    score -= 1;
  }

  if (/#|cookie|preferences|settings|consent/i.test(safeUrl)) {
    score -= 4;
  }

  if (/cookie|consent|preferences|settings/i.test(safeUrl)) {
    score -= 2;
  }

  if (
    /privacy-center|notice-at-collection|state[-_/]privacy|health[-_/]data[-_/]privacy|interest[-_/]based[-_/]ads|targeted[-_/]advertising[-_/]opt[-_/]out|sensitive[-_/]personal[-_/]information/i.test(
      safeUrl
    )
  ) {
    score -= 8;
  }

  return score;
}

function extractHeadings(doc) {
  return Array.from(doc.querySelectorAll("h1, h2, h3"))
    .map((el) => norm(el.textContent || ""))
    .filter(Boolean)
    .join(" ");
}

function extractSourceBrandHints() {
  const host = window.location.hostname.replace(/^www\./, "");
  const domain = getDomainBrandToken(host) || host;
  const title = document.title || "";
  const metaSite =
    document.querySelector('meta[property="og:site_name"]')?.content || "";

  return norm(`${domain} ${title} ${metaSite}`).toLowerCase();
}

function scoreBrandMatch(sourceHints, candidateText, candidateTitle) {
  const hay = norm(`${candidateTitle} ${candidateText}`).toLowerCase();
  const tokens = sourceHints.split(/\s+/).filter((w) => w.length > 3);

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
  if (linkCount > 60) penalty += 4;

  return penalty;
}

function extractPageMetaFromHtml(html, fallbackUrl = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const textRoot = (doc.body || doc.documentElement)?.cloneNode(true);
  textRoot
    ?.querySelectorAll("script, style, noscript, svg")
    .forEach((el) => el.remove());

  const title =
    norm(doc.querySelector("title")?.textContent || "") ||
    norm(doc.querySelector("h1")?.textContent || "");

  const h1 = norm(doc.querySelector("h1")?.textContent || "");
  const headings = extractHeadings(doc);
  const text = norm(textRoot?.innerText || textRoot?.textContent || "");
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

  if (pageType === "search") return "search";
  if (pageType === "policy-mention-only") return "policy_mention_only";

  if (
    /\bcookie preferences\b|\bcookie settings\b|\bmanage cookies\b|\bconsent preferences\b/i.test(
      combined
    )
  ) {
    return "cookie_settings";
  }

  if (
    /\bcustomer privacy center\b|\bnotice at collection\b|\bstate privacy rights\b|\bhealth data privacy\b|\binterest[- ]based ads\b|\btargeted advertising opt out\b|\blimit use of my sensitive personal information\b/i.test(
      combined
    ) ||
    /privacy-center|notice-at-collection|state[-_/]privacy|health[-_/]data[-_/]privacy|interest[-_/]based[-_/]ads|targeted[-_/]advertising[-_/]opt[-_/]out|sensitive[-_/]personal[-_/]information/i.test(
      urlText
    )
  ) {
    return "privacy_controls";
  }

  if (
    /\bhelp center\b|\bsupport\b|\blegal center\b/i.test(combined) ||
    /\/support\b|\/help\b/i.test(urlText)
  ) {
    return "support_or_legal_hub";
  }

  if (/\bprivacy policy\b|\bprivacy notice\b|\bprivacy statement\b/i.test(combined)) {
    return "privacy_policy";
  }

  if (
    /\bprivacy center\b|\bprivacy & security\b|\bprivacy and security\b|\bdata privacy\b|\btrust center\b/i.test(
      combined
    )
  ) {
    return "privacy_related";
  }

  if (/\bprivacy\b/i.test(combined)) {
    return "privacy_related";
  }

  return "unknown";
}

async function fetchCandidatePage(absUrl) {
  const fromBackground =
    typeof chrome !== "undefined" && chrome.runtime?.sendMessage
      ? await chrome.runtime
          .sendMessage({
            type: "FETCH_LINKED_POLICY_DOCUMENT",
            url: absUrl,
          })
          .catch(() => null)
      : null;

  if (fromBackground?.ok && fromBackground.html) {
    const meta = extractPageMetaFromHtml(
      fromBackground.html,
      fromBackground.url || absUrl
    );

    return {
      ok: true,
      url: fromBackground.url || absUrl,
      ...meta,
    };
  }

  try {
    const res = await fetch(absUrl, {
      method: "GET",
      credentials: "omit",
      redirect: "follow",
    });

    if (!res.ok) {
      return { ok: false, url: absUrl, reason: `http_${res.status}` };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return { ok: false, url: res.url || absUrl, reason: "not_html" };
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
  const candidateHost = new URL(candidate.url).hostname;
  const sourceHints = extractSourceBrandHints();

  let score = 0;

  const pageScore = scorePolicyPage(
    candidate.text,
    `${candidate.titleText} ${candidate.h1Text}`,
    candidate.url
  );
  score += pageScore * 1.2;

  if (candidateHost === sourceHost) score += 5;
  else if (sameRegistrableDomain(candidateHost, sourceHost)) score += 2;
  else score -= 6;

  const candidateType = classifyCandidateType(
    candidate.text,
    `${candidate.titleText} ${candidate.h1Text}`,
    candidate.url
  );

  if (candidateType === "privacy_policy") score += 6;
  if (candidateType === "privacy_related") score += 1;
  if (candidateType === "privacy_controls") score -= 10;
  if (candidateType === "support_or_legal_hub") score -= 8;
  if (candidateType === "cookie_settings") score -= 16;
  if (candidateType === "search") score -= 20;
  if (candidateType === "policy_mention_only") score -= 10;

  const headingScore = countMatches(candidate.headings || "", HEADING_POLICY_PATTERNS);
  score += headingScore * 3;

  score += scoreBrandMatch(sourceHints, candidate.text, candidate.titleText) * 2;
  score -= estimateHubPenalty(candidate.text, candidate._doc);

  const validation = validatePolicyCandidate({
    text: candidate.text,
    titleText: candidate.titleText,
    h1Text: candidate.h1Text,
    url: candidate.url,
    pageType: candidate.pageType,
    candidateType,
    sourceHost,
    candidateHost,
  });

  score += validation.scoreAdjustment;

  if (
    validation.rejections.includes("brand-mismatch") &&
    !sameRegistrableDomain(candidateHost, sourceHost)
  ) {
    score = Math.min(score, 8);
  }

  return {
    finalScore: Math.round(score),
    pageScore,
    candidateType,
    validation,
    pageType:
      candidate.pageType || getPageType(candidate.text, candidate.titleText, candidate.url),
  };
}

function isInfrastructurePrivacyLink(absUrl, sourceHost = "") {
  let parsed;
  try {
    parsed = new URL(absUrl);
  } catch {
    return false;
  }

  if (sameRegistrableDomain(parsed.hostname, sourceHost)) return false;

  return INFRASTRUCTURE_POLICY_HOST_PATTERNS.some((pattern) =>
    pattern.test(parsed.hostname)
  );
}

export function rankPolicyLinkCandidates(
  links = [],
  pageUrl = globalThis.window?.location?.href || "https://example.invalid/",
  sourceHost = globalThis.window?.location?.hostname || ""
) {
  if (isLikelySearchUrl(pageUrl)) {
    return [];
  }

  const candidates = [];

  for (const link of links) {
    const hrefRaw = link.href || "";
    const text = norm(link.text || link.ariaLabel || "");
    const rel = norm(link.rel || "");
    const title = norm(link.title || "");
    const source = link.source || link.sourceLabel || "page";
    const hay = `${text} ${title} ${rel} ${hrefRaw}`.toLowerCase();

    try {
      const abs = new URL(hrefRaw, pageUrl).toString();

      if (
        abs.startsWith("javascript:") ||
        abs.startsWith("mailto:") ||
        abs.startsWith("tel:")
      ) {
        continue;
      }

      const urlObj = new URL(abs);
      const pageHost = new URL(pageUrl).host;
      const sameHost = urlObj.host === pageHost;
      const sameRootDomain = sameRegistrableDomain(
        urlObj.hostname,
        sourceHost
      );

      if (isInfrastructurePrivacyLink(abs, sourceHost)) {
        continue;
      }

      let score = scoreLinkSignal(
        hay,
        abs,
        !!link.inFooterOrNav
      );

      if (sameHost) score += 5;
      else if (sameRootDomain) score += 2;
      else score -= 6;

      if (source === "meta" || source === "structured-data") score += 3;
      if (source === "script") score += 2;
      if (source === "root-scan") score += 1;

      if (score < -2) continue;

      candidates.push({
        url: abs,
        anchorText: text,
        anchorTitle: title,
        initialScore: score,
        source,
      });
    } catch {
      // ignore invalid href
    }
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

function normalizeEmbeddedUrl(raw = "") {
  return String(raw || "")
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/[)\]}.,;]+$/g, "");
}

function collectEmbeddedPolicyLinks(
  doc = document,
  baseUrl = globalThis.window?.location?.href || ""
) {
  const links = [];

  const metaSelectors = [
    'meta[property="og:url"]',
    'meta[name="twitter:url"]',
    'meta[name="parsely-link"]',
    'link[rel="canonical"]',
    'link[rel="privacy-policy"]',
    'link[rel="terms-of-service"]',
  ];

  for (const el of Array.from(doc.querySelectorAll(metaSelectors.join(",")))) {
    const href = el.getAttribute("href") || el.getAttribute("content") || "";
    if (!/privacy|policy|legal/i.test(href)) continue;

    links.push({
      href,
      text: el.getAttribute("rel") || el.getAttribute("property") || "Privacy policy",
      title: "metadata",
      source: "meta",
    });
  }

  const scriptNodes = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"], script:not([src])')
  ).slice(0, 60);

  for (const script of scriptNodes) {
    const text = script.textContent || "";
    if (!/privacy|privacy-policy|privacy_policy|privacyNotice|privacyNoticeUrl/i.test(text)) {
      continue;
    }

    const absoluteUrls = text.match(/https?:\\?\/\\?\/[^"'<>\\\s]+/gi) || [];
    for (const raw of absoluteUrls) {
      const href = normalizeEmbeddedUrl(raw);
      if (!/privacy|privacy-policy|privacy-notice|privacy-statement/i.test(href)) continue;

      links.push({
        href,
        text: "Privacy policy",
        title: "script data",
        source: "script",
      });
    }

    const pathUrls = Array.from(text.matchAll(
      /["'](\/[^"']*(?:privacy|privacy-policy|privacy-notice|privacy-statement)[^"']*)["']/gi
    ));
    for (const match of pathUrls) {
      const href = normalizeEmbeddedUrl(match[1] || "");
      links.push({
        href,
        text: "Privacy policy",
        title: "script data",
        source: "script",
      });
    }
  }

  return links.filter((link) => {
    try {
      new URL(link.href, baseUrl);
      return true;
    } catch {
      return false;
    }
  });
}

function collectCandidateLinksFromDocument(
  doc = document,
  baseUrl = globalThis.window?.location?.href || "https://example.invalid/",
  sourceHost = globalThis.window?.location?.hostname || "",
  sourceLabel = "page"
) {
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const links = anchors.map((a) => ({
    href: a.getAttribute("href") || "",
    text: a.innerText || a.textContent || "",
    ariaLabel: a.getAttribute("aria-label") || "",
    rel: a.getAttribute("rel") || "",
    title: a.getAttribute("title") || "",
    inFooterOrNav: !!a.closest("footer, .footer, nav"),
    source: sourceLabel,
  }));

  links.push(...collectEmbeddedPolicyLinks(doc, baseUrl));

  return rankPolicyLinkCandidates(
    links,
    baseUrl,
    sourceHost
  );
}

function collectCandidateLinks() {
  return collectCandidateLinksFromDocument(
    document,
    window.location.href,
    window.location.hostname,
    "page"
  );
}

function getCandidateOrigins(pageUrl = "", sourceHost = "") {
  const origins = new Set();

  try {
    const current = new URL(pageUrl || globalThis.window?.location?.href || "");
    origins.add(`${current.origin}/`);
  } catch {}

  const host = String(sourceHost || globalThis.window?.location?.hostname || "")
    .replace(/^www\./, "")
    .toLowerCase();
  const registrableDomain = getRegistrableDomain(host);

  if (host) {
    origins.add(`https://${host}/`);
    origins.add(`https://www.${host}/`);
  }

  if (registrableDomain) {
    origins.add(`https://${registrableDomain}/`);
    origins.add(`https://www.${registrableDomain}/`);
  }

  return Array.from(origins);
}

function buildCommonPrivacyUrls(pageUrl = "", sourceHost = "") {
  const urls = new Set();

  for (const origin of getCandidateOrigins(pageUrl, sourceHost)) {
    for (const path of COMMON_PRIVACY_PATHS) {
      try {
        urls.add(new URL(path, origin).toString());
      } catch {}
    }
  }

  return Array.from(urls);
}

function dedupeCandidates(candidates = []) {
  const deduped = new Map();

  for (const item of candidates) {
    const prev = deduped.get(item.url);
    if (!prev || item.initialScore > prev.initialScore) {
      deduped.set(item.url, item);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.initialScore - a.initialScore);
}

async function collectRootPageCandidates(pageUrl = "", sourceHost = "") {
  const candidates = [];

  for (const origin of getCandidateOrigins(pageUrl, sourceHost).slice(0, 4)) {
    const fetched = await fetchCandidatePage(origin);
    if (!fetched.ok || !fetched._doc) continue;

    candidates.push(
      ...collectCandidateLinksFromDocument(
        fetched._doc,
        fetched.url || origin,
        sourceHost,
        "root-scan"
      )
    );
  }

  return dedupeCandidates(candidates).slice(0, MAX_ROOT_SCAN_CANDIDATES);
}

async function probeCommonPrivacyUrls(pageUrl = "", sourceHost = "") {
  const checkedCandidates = [];

  for (const url of buildCommonPrivacyUrls(pageUrl, sourceHost).slice(0, MAX_COMMON_PROBES)) {
    const fetched = await fetchCandidatePage(url);

    if (!fetched.ok) {
      checkedCandidates.push({
        url,
        fetched: false,
        finalScore: -5,
        confidence: "Low",
        type: "unavailable",
        pageType: "unavailable",
        reason: fetched.reason,
        source: "probed",
      });
      continue;
    }

    const { finalScore, pageScore, candidateType, pageType, validation } =
      scoreFetchedCandidate(fetched, sourceHost);

    checkedCandidates.push({
      url: fetched.url,
      anchorText: "Common privacy URL",
      initialScore: 0,
      pageScore,
      finalScore,
      fetched: true,
      type: candidateType,
      pageType,
      validation,
      confidence: classifyPageConfidence(finalScore),
      titleText: fetched.titleText,
      fetchedTitle: fetched.titleText,
      fetchedText: fetched.text,
      source: "probed",
    });
  }

  return checkedCandidates.sort((a, b) => b.finalScore - a.finalScore);
}

export async function findBestPolicyLink() {
  if (
    isLikelySearchUrl(globalThis.window?.location?.href || "") ||
    titleLooksLikeSearch(globalThis.document?.title || "") ||
    looksLikeInformationalArticle(
      globalThis.document?.body?.innerText || "",
      globalThis.document?.title || "",
      globalThis.window?.location?.href || ""
    )
  ) {
    return {
      bestPolicyLink: "",
      bestLinkScore: 0,
      confidence: "Low",
      checkedCandidates: [],
      bestFetchedPage: null,
      source: isLikelySearchUrl(globalThis.window?.location?.href || "")
        ? "search-page"
        : "non-policy-page",
    };
  }

  const known = getKnownPolicyForHost(window.location.hostname);
  if (known) {
    return {
      bestPolicyLink: known.url,
      bestLinkScore: 40,
      confidence: "High",
      checkedCandidates: [
        {
          url: known.url,
          anchorText: known.label,
          initialScore: 40,
          finalScore: 40,
          fetched: false,
          type: "privacy_policy",
          pageType: "normal",
          confidence: "High",
          source: known.source,
        },
      ],
      bestFetchedPage: null,
      source: known.source,
    };
  }

  const pageUrl = window.location.href;
  const sourceHost = window.location.hostname;
  let initialCandidates = collectCandidateLinks();

  if (!initialCandidates.length) {
    initialCandidates = await collectRootPageCandidates(pageUrl, sourceHost);
  }

  const topCandidates = dedupeCandidates(initialCandidates).slice(0, MAX_CANDIDATES_TO_FETCH);

  if (!topCandidates.length) {
    const probedCandidates = await probeCommonPrivacyUrls(pageUrl, sourceHost);
    const probedBest = probedCandidates[0];

    if (!probedBest || probedBest.finalScore < MIN_FINAL_SCORE) {
      return {
        bestPolicyLink: "",
        bestLinkScore: 0,
        confidence: "Low",
        checkedCandidates: probedCandidates,
        source: "none",
      };
    }

    return {
      bestPolicyLink: probedBest.url,
      bestLinkScore: probedBest.finalScore,
      confidence: classifyPageConfidence(probedBest.finalScore),
      checkedCandidates: probedCandidates,
      bestFetchedPage:
        probedBest?.fetched && probedBest?.fetchedText
          ? {
              url: probedBest.url,
              title: probedBest.fetchedTitle || probedBest.titleText || "",
              text: probedBest.fetchedText,
            }
          : null,
      source: "probed",
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
          source: candidate.source || "page",
        };
      }

      const { finalScore, pageScore, candidateType, pageType, validation } =
        scoreFetchedCandidate(fetched, window.location.hostname);

      return {
        url: fetched.url,
        anchorText: candidate.anchorText,
        initialScore: candidate.initialScore,
        pageScore,
        finalScore,
        fetched: true,
        type: candidateType,
        pageType,
        validation,
        confidence: classifyPageConfidence(finalScore),
        titleText: fetched.titleText,
        fetchedTitle: fetched.titleText,
        fetchedText: fetched.text,
        source: candidate.source || "page",
      };
    })
  );

  let checkedCandidates = fetchResults.sort((a, b) => b.finalScore - a.finalScore);
  const best = checkedCandidates[0];

  if (!best || best.finalScore < MIN_FINAL_SCORE) {
    const probedCandidates = await probeCommonPrivacyUrls(pageUrl, sourceHost);
    checkedCandidates = [...checkedCandidates, ...probedCandidates].sort(
      (a, b) => b.finalScore - a.finalScore
    );
    const fallbackBest = checkedCandidates[0];

    if (fallbackBest && fallbackBest.finalScore >= MIN_FINAL_SCORE) {
      return {
        bestPolicyLink: fallbackBest.url,
        bestLinkScore: fallbackBest.finalScore,
        confidence: classifyPageConfidence(fallbackBest.finalScore),
        checkedCandidates,
        bestFetchedPage:
          fallbackBest?.fetched && fallbackBest?.fetchedText
            ? {
                url: fallbackBest.url,
                title: fallbackBest.fetchedTitle || fallbackBest.titleText || "",
                text: fallbackBest.fetchedText,
              }
            : null,
        source: fallbackBest.source || "probed",
      };
    }

    return {
      bestPolicyLink: "",
      bestLinkScore: 0,
      confidence: "Low",
      checkedCandidates,
      source: "none",
    };
  }

  return {
    bestPolicyLink: best.url,
    bestLinkScore: best.finalScore,
    confidence: classifyPageConfidence(best.finalScore),
    checkedCandidates,
    bestFetchedPage:
      best?.fetched && best?.fetchedText
        ? {
            url: best.url,
            title: best.fetchedTitle || best.titleText || "",
            text: best.fetchedText,
          }
        : null,
    source: best.source || "page",
  };
}
