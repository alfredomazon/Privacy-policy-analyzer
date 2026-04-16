import { norm, countMatches } from "./utils.js";
import {
  scorePolicyPage,
  classifyPageConfidence,
  getPageType,
  isLikelySearchUrl,
  titleLooksLikeSearch,
  scoreUrlQuality,
} from "./policyDetector.js";

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
  /\bad choices\b/i,
  /\bdo not sell\b/i,
  /\bdo not sell or share\b/i,
  /\blegal center\b/i,
  /\bhelp center\b/i,
  /\bsupport\b/i,
  /\bterms of service\b/i,
  /\bterms and conditions\b/i,
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
    score -= 1;
  }

  if (/#|cookie|preferences|settings|consent/i.test(safeUrl)) {
    score -= 4;
  }

  if (/cookie|consent|preferences|settings/i.test(safeUrl)) {
    score -= 2;
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
  score += pageScore * 1.2;

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
  if (candidateType === "cookie_settings") score -= 16;
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
    pageType:
      candidate.pageType || getPageType(candidate.text, candidate.titleText, candidate.url),
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

      if (sameHost) score += 5;
      else if (sameRootDomain) score += 2;
      else score -= 6;

      if (score < -2) continue;

      candidates.push({
        url: abs,
        anchorText: text,
        anchorTitle: title,
        initialScore: score,
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

export async function findBestPolicyLink() {
  const initialCandidates = collectCandidateLinks();
  const topCandidates = initialCandidates.slice(0, MAX_CANDIDATES_TO_FETCH);

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

      const { finalScore, pageScore, candidateType, pageType } =
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
        confidence: classifyPageConfidence(finalScore),
        titleText: fetched.titleText,
      };
    })
  );

  const checkedCandidates = fetchResults.sort((a, b) => b.finalScore - a.finalScore);
  const best = checkedCandidates[0];

  if (!best || best.finalScore < MIN_FINAL_SCORE) {
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