import { debounce, norm } from "./utils.js";
import {
  scorePolicyPage,
  classifyPageConfidence,
  scorePolicyPageWithReasons,
  isLikelySearchUrl,
  titleLooksLikeSearch,
} from "./policyDetector.js";
import { findBestPolicyLink } from "./policyLinkFinder.js";
import { getKnownPolicyForHost } from "./policyRegistry.js";
import {
  getVisibleText,
  getCandidateTextBlocks,
  splitIntoSentences,
} from "./policyGrabber.js";
import {
  extractDataCategories,
  extractFindings,
  extractPolicyPractices,
} from "./policyAnalyzer.js";
import { extractPolicyFreshness } from "./policyMetadata.js";
import { detectTrackerSignals } from "./trackerDetector.js";
import { computePolicyBehaviorMismatch } from "./liar.js";

// ---------- Simple caches ----------
const POLICY_FETCH_CACHE = new Map();
const ANALYSIS_CACHE = new Map();

const ANALYSIS_CACHE_TTL = 5 * 60 * 1000;
const POLICY_FETCH_CACHE_TTL = 5 * 60 * 1000;

const QUICK_TEXT_LIMIT = 2200;
const ANALYSIS_TEXT_LIMIT = 18000;
const FETCHED_POLICY_TEXT_LIMIT = 22000;
const MIN_ANALYSIS_TEXT = 150;

const POLICY_SCORE_THRESHOLD = 14;
const LINK_SCORE_THRESHOLD = 14;

// routing thresholds
const STRONG_CURRENT_POLICY_SCORE = 20;
const MIN_SCORE_TO_SEARCH_LINKS = 3;
const MIN_LINK_ADVANTAGE = 2;

function setTimedCache(map, key, value, ttlMs) {
  map.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function getTimedCache(map, key) {
  const entry = map.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }

  return entry.value;
}

function normalizeUrlForAnalysis(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = "";

    const junkParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
    ];

    for (const key of junkParams) {
      u.searchParams.delete(key);
    }

    return u.toString();
  } catch {
    return rawUrl;
  }
}

function getPolicyCacheKey(url) {
  return normalizeUrlForAnalysis(url);
}

function capText(text, max = ANALYSIS_TEXT_LIMIT) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function hasNegativePolicyHint(text = "") {
  const t = String(text || "").toLowerCase();

  return (
    t.includes("cookie preferences") ||
    t.includes("cookie settings") ||
    t.includes("manage cookies") ||
    t.includes("privacy choices") ||
    t.includes("your privacy choices") ||
    t.includes("ad choices") ||
    t.includes("consent preferences") ||
    t.includes("help center") ||
    t.includes("support center")
  );
}

function detectAppShellLikePage() {
  const anchorCount = document.querySelectorAll("a[href]").length;
  const buttonCount = document.querySelectorAll("button, [role='button']").length;
  const appRoleCount = document.querySelectorAll("[role='application']").length;
  const toolbarLikeCount = document.querySelectorAll("[aria-label*='toolbar' i]").length;
  const textLen = norm(document.body?.innerText || "").length;
  const path = (window.location.pathname || "").toLowerCase();
  const host = (window.location.hostname || "").toLowerCase();

  let score = 0;

  if (anchorCount < 8) score += 2;
  if (buttonCount > anchorCount) score += 1;
  if (appRoleCount > 0) score += 2;
  if (toolbarLikeCount > 0) score += 1;
  if (textLen < 1500) score += 1;

  if (
    /\/(app|mail|chat|dashboard|presentation|present|spreadsheets|document|drive|courses|inbox|messages)\b/.test(
      path
    )
  ) {
    score += 2;
  }

  if (
    host === "docs.google.com" ||
    host === "outlook.live.com" ||
    host === "chatgpt.com" ||
    host.includes("canvas") ||
    host.includes("instructure")
  ) {
    score += 2;
  }

  return {
    isAppShell: score >= 3,
    score,
    anchorCount,
    buttonCount,
    textLen,
  };
}

function getQuickPageSample(limit = QUICK_TEXT_LIMIT) {
  const titleBits = [
    document.title || "",
    document.querySelector("h1")?.textContent || "",
    document.querySelector("meta[name='description']")?.content || "",
  ]
    .map((s) => norm(s))
    .filter(Boolean)
    .join(" ");

  const bodySample = norm(document.body?.innerText || "").slice(0, limit);

  return capText(`${titleBits} ${bodySample}`, limit);
}

function countPolicyAnchors(limit = 80) {
  const anchors = [...document.querySelectorAll("a[href]")].slice(0, limit);

  let count = 0;
  for (const a of anchors) {
    const text = (a.textContent || "").toLowerCase();
    const hrefAttr = (a.getAttribute("href") || "").toLowerCase();
    const hay = `${text} ${hrefAttr}`;

    if (hasNegativePolicyHint(hay)) continue;

    if (
      hay.includes("privacy policy") ||
      hay.includes("privacy notice") ||
      hay.includes("privacy statement") ||
      hay.includes("privacy center") ||
      hay.includes("privacy & security") ||
      hay.includes("privacy and security") ||
      hay.includes("data privacy") ||
      hay.includes("trust center") ||
      hrefAttr.includes("/privacy")
    ) {
      count += 1;
    }
  }

  return count;
}

function looksLikeHomepage() {
  const path = location.pathname || "/";
  return path === "/" || path === "" || /^\/(home)?$/i.test(path);
}

function quickPolicyHint() {
  const href = location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();
  const combined = `${href} ${title}`;

  if (hasNegativePolicyHint(combined)) return false;

  if (
    href.includes("privacy-policy") ||
    href.includes("privacy-notice") ||
    href.includes("privacy-statement") ||
    href.includes("/privacy") ||
    title.includes("privacy policy") ||
    title.includes("privacy notice") ||
    title.includes("privacy statement") ||
    title.includes("privacy center") ||
    title.includes("privacy & security") ||
    title.includes("privacy and security") ||
    title.includes("data privacy") ||
    title.includes("trust center")
  ) {
    return true;
  }

  return countPolicyAnchors(40) > 0;
}

function getPageTypeFromScore(score, titleText, urlText, bestPolicyLink = "") {
  const safeTitle = String(titleText || "").toLowerCase();
  const safeUrl = String(urlText || "").toLowerCase();
  const safeBestLink = String(bestPolicyLink || "").toLowerCase();

  const looksLikeSearch =
    safeUrl.includes("/search") ||
    safeTitle.includes("search results") ||
    safeTitle.includes("google search") ||
    safeTitle.includes("results for");

  if (looksLikeSearch) return "search";

  const policyPhrasePresent =
    safeTitle.includes("privacy policy") ||
    safeTitle.includes("privacy notice") ||
    safeTitle.includes("privacy statement") ||
    safeUrl.includes("privacy");

  if (score <= 0 && policyPhrasePresent) {
    return "policy-mention-only";
  }

  if (!bestPolicyLink && score <= 0) {
    return "unknown";
  }

  if (policyPhrasePresent && score < 8 && safeBestLink) {
    return "policy-mention-only";
  }

  return "normal";
}

function isRejectedPolicyPageType(pageType) {
  return (
    pageType === "search" ||
    pageType === "policy-mention-only" ||
    pageType === "informational-article"
  );
}

// ---------- Fetch + clean external policy ----------
function extractTextFromFetchedDocument(doc) {
  const main =
    doc.querySelector("main, article, [role='main'], .privacy, .policy, .legal") ||
    doc.body ||
    doc.documentElement;

  const clone = main.cloneNode(true);

  clone
    .querySelectorAll(
      "script, style, noscript, svg, img, video, audio, header, footer, nav, aside, form"
    )
    .forEach((el) => el.remove());

  const title = norm(doc.title || "");
  const text = capText(norm(clone.innerText || ""), FETCHED_POLICY_TEXT_LIMIT);

  return { title, text };
}

async function fetchPolicyDocument(url) {
  const cacheKey = getPolicyCacheKey(url);
  const cached = getTimedCache(POLICY_FETCH_CACHE, cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const fromBackground = await chrome.runtime.sendMessage({
        type: "FETCH_LINKED_POLICY_DOCUMENT",
        url,
      }).catch(() => null);

      if (fromBackground?.ok && fromBackground.html) {
        const doc = new DOMParser().parseFromString(
          fromBackground.html,
          "text/html"
        );
        const { title, text } = extractTextFromFetchedDocument(doc);

        if (!text) return null;

        return {
          url: fromBackground.url || url,
          title,
          text,
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "text/html" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) return null;

      const html = await res.text();
      if (!html) return null;

      const doc = new DOMParser().parseFromString(html, "text/html");
      const { title, text } = extractTextFromFetchedDocument(doc);

      if (!text) return null;

      return {
        url: res.url || url,
        title,
        text,
      };
    } catch (err) {
      // Some sites block extension-side cross-origin fetches even when the
      // link was discovered successfully. Falling back silently avoids noisy
      // console warnings for recoverable cases.
      return null;
    }
  })();

  setTimedCache(POLICY_FETCH_CACHE, cacheKey, promise, POLICY_FETCH_CACHE_TTL);
  return promise;
}

async function getNetworkTrackerSignals() {
  if (
    typeof chrome === "undefined" ||
    !chrome.runtime?.sendMessage
  ) {
    return [];
  }

  try {
    const res = await chrome.runtime
      .sendMessage({ type: "GET_TRACKER_NETWORK_SIGNALS" })
      .catch(() => null);

    return Array.isArray(res?.signals) ? res.signals : [];
  } catch {
    return [];
  }
}

// ---------- Source helpers ----------
function getSourceLabel(sourceType) {
  switch (sourceType) {
    case "current-policy-page":
      return "Privacy policy page";
    case "linked-policy":
      return "Linked privacy policy";
    case "known-domain":
      return "Known platform privacy policy";
    case "page-fallback":
    default:
      return "Page content (no policy found)";
  }
}

function shouldTrustAsPolicySource(sourceType, analyzedPageIsLikelyPolicy) {
  if (sourceType === "current-policy-page") return true;
  if (sourceType === "linked-policy" && analyzedPageIsLikelyPolicy) return true;
  if (sourceType === "known-domain" && analyzedPageIsLikelyPolicy) return true;
  return false;
}

function getSourceTrustLevel(sourceType, trusted, linkSource = "") {
  if (!trusted) return "low";
  if (sourceType === "known-domain") return "high";
  if (sourceType === "current-policy-page") return "high";
  if (sourceType === "linked-policy") {
    if (linkSource === "page") return "high";
    if (linkSource === "root-scan" || linkSource === "probed") return "medium";
    return "medium";
  }
  return "low";
}

function summarizeScoreDetails(details, limit = 8) {
  if (!details) return null;

  const factors = Array.isArray(details.contributions)
    ? [...details.contributions]
        .filter((item) => item && item.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, limit)
        .map((item) => ({
          label: item.label,
          value: item.value,
          count: item.count,
          reason: item.reason,
        }))
    : [];

  return {
    score: details.score,
    rawScore: details.rawScore,
    confidence: details.confidence,
    pageType: details.pageType,
    textLength: details.textLength,
    topicCoverage: details.topicCoverage,
    structureScore: details.structureScore,
    factors,
  };
}

function summarizeCandidates(candidates = [], limit = 5) {
  return candidates.slice(0, limit).map((candidate) => ({
    url: candidate.url,
    anchorText: candidate.anchorText || candidate.titleText || "",
    source: candidate.source || "",
    finalScore:
      typeof candidate.finalScore === "number" ? candidate.finalScore : null,
    initialScore:
      typeof candidate.initialScore === "number" ? candidate.initialScore : null,
    confidence: candidate.confidence || "",
    type: candidate.type || "",
    pageType: candidate.pageType || "",
    fetched: candidate.fetched === true,
    reason: candidate.reason || "",
    validation: candidate.validation
      ? {
          isMainPolicy: candidate.validation.isMainPolicy,
          topicCoverage: candidate.validation.topicCoverage,
          brandMatched: candidate.validation.brandMatched,
          freshness: candidate.validation.freshness,
          rejections: candidate.validation.rejections || [],
          signals: candidate.validation.signals || [],
        }
      : null,
  }));
}

function buildAnalyzerAudit({
  titleText,
  urlText,
  knownPolicySource,
  hasKnownPolicySource,
  shouldSearchForLink,
  shouldTryLinkedPolicy,
  usedLinkedPolicy,
  currentPageIsLikelyPolicy,
  currentLooksWeak,
  policyAnalysisTrusted,
  policySourceType,
  analyzedUrl,
  currentScoreDetails,
  analyzedScoreDetails,
  bestPolicyLink,
  bestLinkScore,
  checkedCandidates,
  linkSource,
}) {
  const steps = [
    {
      label: "Current page",
      status: currentPageIsLikelyPolicy
        ? "selected"
        : currentLooksWeak
        ? "weak"
        : "checked",
      detail: currentPageIsLikelyPolicy
        ? "Current page scored as a privacy policy."
        : "Current page did not score strongly enough to be the policy source.",
    },
  ];

  if (hasKnownPolicySource) {
    steps.push({
      label: "Known policy registry",
      status: policySourceType === "known-domain" ? "selected" : "available",
      detail: `${knownPolicySource.label} matched this domain.`,
      url: knownPolicySource.url,
    });
  }

  if (shouldSearchForLink) {
    steps.push({
      label: "Policy link search",
      status: bestPolicyLink ? "candidate-found" : "none",
      detail: bestPolicyLink
        ? `Best candidate scored ${bestLinkScore}.`
        : "No strong policy link candidate was found.",
      url: bestPolicyLink,
    });
  }

  if (shouldTryLinkedPolicy) {
    steps.push({
      label: "Fetched linked policy",
      status: usedLinkedPolicy ? "selected" : "not-selected",
      detail: usedLinkedPolicy
        ? "Fetched policy content was strong enough to analyze."
        : "Fetched policy content was unavailable or not strong enough to replace the current page.",
      url: bestPolicyLink,
    });
  }

  return {
    source: {
      selectedType: policySourceType,
      trust: getSourceTrustLevel(policySourceType, policyAnalysisTrusted, linkSource),
      selectedUrl: analyzedUrl,
      currentUrl: urlText,
      currentTitle: titleText,
      bestPolicyLink,
      bestLinkScore,
      linkSource,
      steps,
      candidates: summarizeCandidates(checkedCandidates),
    },
    score: {
      currentPage: summarizeScoreDetails(currentScoreDetails),
      analyzedPolicy: summarizeScoreDetails(analyzedScoreDetails),
    },
  };
}

function buildMinimalResult(
  titleText,
  urlText,
  summary = "No likely privacy policy signal was detected.",
  trackerSignals = detectTrackerSignals()
) {
  return {
    isLikelyPolicyPage: false,
    usedLinkedPolicy: false,
    sourceLabel: getSourceLabel("page-fallback"),
    policySourceType: "page-fallback",
    sourceTrust: "low",
    policyAnalysisTrusted: false,
    currentPageIsLikelyPolicy: false,
    analyzedPageIsLikelyPolicy: false,
    pageType: "unknown",
    score: 0,
    pageScore: 0,
    confidence: "Low",
    pageConfidence: "Low",
    bestPolicyLink: "",
    bestLinkScore: 0,
    checkedCandidates: [],
    reasons: [],
    findings: [],
    countedRiskCount: 0,
    dataCollected: {},
    dataEvidence: {},
    trackerSignals,
    mismatch: {
      score: 0,
      level: "none",
      summary,
      items: [],
    },
    pageTitle: titleText,
    pageUrl: urlText,
    analyzedPolicyTitle: titleText,
    analyzedPolicyUrl: urlText,
    policyFreshness: {
      found: false,
      dateText: "",
      year: null,
      status: "unknown",
    },
  };
}

function getCurrentPageTextForAnalysis({ hintedPolicyLike, quickScore, isAppShell }) {
  const href = location.href.toLowerCase();

  const shouldUseFocusedBlocks =
    href.includes("privacy") ||
    hintedPolicyLike ||
    quickScore >= 8;

  let text = shouldUseFocusedBlocks ? getCandidateTextBlocks() : "";

  if (!text || text.length < 500 || isAppShell) {
    text = getVisibleText();
  }

  return capText(text, ANALYSIS_TEXT_LIMIT);
}

// ---------- Main analysis ----------
export function runContentAnalysis() {
  async function buildResult() {
    const normalizedCurrentUrl = normalizeUrlForAnalysis(window.location.href);
    const cachedResult = getTimedCache(ANALYSIS_CACHE, normalizedCurrentUrl);
    if (cachedResult) return cachedResult;

    const titleText = norm(document.title || "");
    const urlText = window.location.href;
    const trackerSignalsPromise = getNetworkTrackerSignals().then((networkSignals) =>
      detectTrackerSignals({ networkSignals })
    );

    const appShell = detectAppShellLikePage();
    const hintedPolicyLike = quickPolicyHint();
    const policyAnchorCount = countPolicyAnchors(80);
    const homepageLike = looksLikeHomepage();
    const pageLooksLikeSearch =
      isLikelySearchUrl(urlText) || titleLooksLikeSearch(titleText);
    const knownPolicySource = getKnownPolicyForHost(window.location.hostname);
    const hasKnownPolicySource = !!knownPolicySource && !pageLooksLikeSearch;

    const quickSample = getQuickPageSample();
    const quickScore = scorePolicyPage(quickSample, titleText, urlText);

    if (
      !hasKnownPolicySource &&
      !appShell.isAppShell &&
      !hintedPolicyLike &&
      quickScore < 1 &&
      policyAnchorCount === 0 &&
      !homepageLike
    ) {
      const minimalResult = buildMinimalResult(
        titleText,
        urlText,
        "No likely privacy policy signal was detected.",
        await trackerSignalsPromise
      );
      setTimedCache(
        ANALYSIS_CACHE,
        normalizedCurrentUrl,
        minimalResult,
        ANALYSIS_CACHE_TTL
      );
      return minimalResult;
    }

    let currentPageText = getCurrentPageTextForAnalysis({
      hintedPolicyLike,
      quickScore,
      isAppShell: appShell.isAppShell,
    });

    if (!currentPageText || currentPageText.length < MIN_ANALYSIS_TEXT) {
      if (appShell.isAppShell) {
        currentPageText = capText(norm(document.body?.innerText || ""), ANALYSIS_TEXT_LIMIT);
      }
    }

    if (
      (!currentPageText || currentPageText.length < MIN_ANALYSIS_TEXT) &&
      hasKnownPolicySource
    ) {
      currentPageText = capText(
        norm(`${titleText} ${urlText} ${document.body?.innerText || ""}`),
        ANALYSIS_TEXT_LIMIT
      );
    }

    if (
      (!currentPageText || currentPageText.length < MIN_ANALYSIS_TEXT) &&
      !hasKnownPolicySource
    ) {
      const minimalResult = buildMinimalResult(
        titleText,
        urlText,
        "Not enough page content was available for policy analysis.",
        await trackerSignalsPromise
      );
      setTimedCache(
        ANALYSIS_CACHE,
        normalizedCurrentUrl,
        minimalResult,
        ANALYSIS_CACHE_TTL
      );
      return minimalResult;
    }

    if (!currentPageText) {
      currentPageText = norm(
        `${titleText} ${urlText} ${knownPolicySource?.label || ""}`
      );
    }

    const currentScoreDetails = scorePolicyPageWithReasons(
      currentPageText,
      titleText,
      urlText
    );
    const currentScore = currentScoreDetails.score;
    const currentConfidence = classifyPageConfidence(currentScore);
    const currentPageType =
      currentScoreDetails.pageType === "normal"
        ? getPageTypeFromScore(currentScore, titleText, urlText)
        : currentScoreDetails.pageType;

    const currentPageIsLikelyPolicy =
      !isRejectedPolicyPageType(currentPageType) &&
      currentScore >= POLICY_SCORE_THRESHOLD;

    let bestPolicyLink = "";
    let bestLinkScore = 0;
    let checkedCandidates = [];
    let linkSource = "";
    let bestFetchedPage = null;

    const shouldSearchForLink =
      !currentPageIsLikelyPolicy &&
      currentPageType !== "informational-article" &&
      (
        homepageLike ||
        appShell.isAppShell ||
        policyAnchorCount > 0 ||
        hintedPolicyLike ||
        hasKnownPolicySource ||
        quickScore >= MIN_SCORE_TO_SEARCH_LINKS ||
        currentScore >= MIN_SCORE_TO_SEARCH_LINKS
      );

    if (shouldSearchForLink) {
      const linkResult = await findBestPolicyLink();
      bestPolicyLink = linkResult.bestPolicyLink || "";
      bestLinkScore = linkResult.bestLinkScore || 0;
      checkedCandidates = Array.isArray(linkResult.checkedCandidates)
        ? linkResult.checkedCandidates
        : [];
      linkSource = linkResult.source || "";
      bestFetchedPage = linkResult.bestFetchedPage || null;
    }

    const trackerSignals = await trackerSignalsPromise;

    let analyzedText = currentPageText;
    let analyzedTitle = titleText;
    let analyzedUrl = urlText;
    let analyzedScore = currentScore;
    let analyzedConfidence = currentConfidence;
    let analyzedPageType = currentPageType;
    let analyzedScoreDetails = currentScoreDetails;

    let policySourceType = currentPageIsLikelyPolicy
      ? "current-policy-page"
      : "page-fallback";

    let usedLinkedPolicy = false;

    const currentPageRejected = isRejectedPolicyPageType(currentPageType);

    const currentLooksWeak =
      currentScore < POLICY_SCORE_THRESHOLD ||
      currentPageRejected ||
      appShell.isAppShell ||
      (homepageLike && currentScore < STRONG_CURRENT_POLICY_SCORE);

    const shouldTryLinkedPolicy =
      !currentPageIsLikelyPolicy &&
      !!bestPolicyLink &&
      bestLinkScore >= LINK_SCORE_THRESHOLD &&
      currentLooksWeak;

    if (shouldTryLinkedPolicy) {
      const fetched =
        bestFetchedPage?.text &&
        normalizeUrlForAnalysis(bestFetchedPage?.url || "") ===
          normalizeUrlForAnalysis(bestPolicyLink)
          ? bestFetchedPage
          : await fetchPolicyDocument(bestPolicyLink);

      if (fetched?.text) {
        const fetchedScoreDetails = scorePolicyPageWithReasons(
          fetched.text,
          fetched.title,
          fetched.url
        );
        const fetchedScore = fetchedScoreDetails.score;

        const fetchedConfidence = classifyPageConfidence(fetchedScore);
        const fetchedPageType =
          fetchedScoreDetails.pageType === "normal"
            ? getPageTypeFromScore(
                fetchedScore,
                fetched.title,
                fetched.url,
                bestPolicyLink
              )
            : fetchedScoreDetails.pageType;

        const fetchedIsLikelyPolicy =
          !isRejectedPolicyPageType(fetchedPageType) &&
          fetchedScore >= POLICY_SCORE_THRESHOLD;

        const shouldPreferFetched =
          linkSource === "known-domain" ||
          currentPageRejected ||
          currentScore < POLICY_SCORE_THRESHOLD ||
          appShell.isAppShell
            ? fetchedScore >= POLICY_SCORE_THRESHOLD
            : fetchedScore >= analyzedScore + MIN_LINK_ADVANTAGE;

        if (fetchedIsLikelyPolicy && shouldPreferFetched) {
          analyzedText = fetched.text;
          analyzedTitle = fetched.title || analyzedTitle;
          analyzedUrl = fetched.url;
          analyzedScore = fetchedScore;
          analyzedConfidence = fetchedConfidence;
          analyzedPageType = fetchedPageType;
          analyzedScoreDetails = fetchedScoreDetails;
          usedLinkedPolicy = true;
          policySourceType =
            linkSource === "known-domain" ? "known-domain" : "linked-policy";
        }
      }
    }

    const analyzedPageIsLikelyPolicy =
      (policySourceType === "current-policy-page" ||
        policySourceType === "linked-policy" ||
        policySourceType === "known-domain") &&
      analyzedScore >= POLICY_SCORE_THRESHOLD &&
      !isRejectedPolicyPageType(analyzedPageType);

    const policyAnalysisTrusted = shouldTrustAsPolicySource(
      policySourceType,
      analyzedPageIsLikelyPolicy
    );

    const audit = buildAnalyzerAudit({
      titleText,
      urlText,
      knownPolicySource,
      hasKnownPolicySource,
      shouldSearchForLink,
      shouldTryLinkedPolicy,
      usedLinkedPolicy,
      currentPageIsLikelyPolicy,
      currentLooksWeak,
      policyAnalysisTrusted,
      policySourceType,
      analyzedUrl,
      currentScoreDetails,
      analyzedScoreDetails,
      bestPolicyLink,
      bestLinkScore,
      checkedCandidates,
      linkSource,
    });

    const sentences = splitIntoSentences(analyzedText);
    const { dataCollected, dataEvidence } = extractDataCategories(sentences);
    const findings = policyAnalysisTrusted ? extractFindings(sentences) : [];
    const policyPractices = policyAnalysisTrusted
      ? extractPolicyPractices(sentences)
      : {
          dataTypes: [],
          purposes: [],
          recipients: [],
          controls: [],
          retention: { present: false, vague: false, evidence: [] },
        };
    const countedRisks = findings.filter((f) => f.countAsRisk);
    const policyFreshness = extractPolicyFreshness(analyzedText);
    const sourceTrust = getSourceTrustLevel(
      policySourceType,
      policyAnalysisTrusted,
      linkSource
    );

    const policySideResult = {
      isLikelyPolicyPage: policyAnalysisTrusted,
      pageType: analyzedPageType,
      score: analyzedScore,
      pageScore: analyzedScore,
      confidence: analyzedConfidence,
      pageConfidence: analyzedConfidence,
      bestPolicyLink,
      bestLinkScore,
      checkedCandidates,
      findings,
      countedRiskCount: countedRisks.length,
      dataCollected,
      dataEvidence,
      policyPractices,
      pageTitle: analyzedTitle,
      pageUrl: analyzedUrl,
      usedLinkedPolicy,
      sourceLabel: getSourceLabel(policySourceType),
      policySourceType,
      sourceTrust,
      policyAnalysisTrusted,
      currentPageIsLikelyPolicy,
      analyzedPageIsLikelyPolicy,
      policyFreshness,
      audit,
    };

    const mismatch = policyAnalysisTrusted
      ? computePolicyBehaviorMismatch(policySideResult, trackerSignals)
      : {
          score: 0,
          level: "none",
          summary:
            "No trusted privacy policy source was available for policy-vs-behavior comparison.",
          items: [],
        };

    const result = {
      isLikelyPolicyPage: policyAnalysisTrusted,
      usedLinkedPolicy,
      sourceLabel: policySideResult.sourceLabel,
      policySourceType,
      sourceTrust,
      policyAnalysisTrusted,
      currentPageIsLikelyPolicy,
      analyzedPageIsLikelyPolicy,
      policyFreshness,
      pageType: analyzedPageType,

      score: analyzedScore,
      pageScore: analyzedScore,
      confidence: analyzedConfidence,
      pageConfidence: analyzedConfidence,

      bestPolicyLink,
      bestLinkScore,
      checkedCandidates,

      reasons: countedRisks.slice(0, 6).map((f) => f.title),

      findings,
      countedRiskCount: countedRisks.length,
      dataCollected,
      dataEvidence,
      policyPractices,

      trackerSignals,
      mismatch,

      pageTitle: titleText,
      pageUrl: urlText,

      analyzedPolicyTitle: analyzedTitle,
      analyzedPolicyUrl: analyzedUrl,
      audit,
    };

    setTimedCache(
      ANALYSIS_CACHE,
      normalizedCurrentUrl,
      result,
      ANALYSIS_CACHE_TTL
    );
    return result;
  }

  async function sendResult() {
    try {
      const result = await buildResult();
      chrome.runtime.sendMessage({
        type: "heuristicResult",
        result,
      });
    } catch (err) {
      console.error("Heuristic content script failed:", err);
    }
  }

  const debouncedSend = debounce(() => {
    sendResult();
  }, 900);

  function runInitialChecks() {
    sendResult();

    setTimeout(() => {
      debouncedSend();
    }, 1200);
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    runInitialChecks();
  } else {
    window.addEventListener("DOMContentLoaded", runInitialChecks, {
      once: true,
    });
  }

  window.addEventListener(
    "load",
    () => {
      debouncedSend();
    },
    { once: true }
  );

  let mutationCount = 0;
  let settledTimer = null;

  const observer = new MutationObserver(() => {
    mutationCount += 1;
    if (mutationCount > 3) return;

    clearTimeout(settledTimer);
    settledTimer = setTimeout(() => {
      debouncedSend();
    }, 900);
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  setTimeout(() => {
    observer.disconnect();
  }, 5000);

  let lastHref = normalizeUrlForAnalysis(location.href);

  const urlWatcher = new MutationObserver(() => {
    const nextHref = normalizeUrlForAnalysis(location.href);

    if (nextHref !== lastHref) {
      const previousHref = lastHref;
      lastHref = nextHref;
      mutationCount = 0;
      ANALYSIS_CACHE.delete(previousHref);
      debouncedSend();
    }
  });

  urlWatcher.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
