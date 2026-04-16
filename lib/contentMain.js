import { debounce, norm } from "./utils.js";
import {
  scorePolicyPage,
  classifyPageConfidence,
} from "./policyDetector.js";
import { findBestPolicyLink } from "./policyLinkFinder.js";
import {
  getVisibleText,
  getCandidateTextBlocks,
  splitIntoSentences,
} from "./policyGrabber.js";
import {
  extractDataCategories,
  extractFindings,
} from "./policyAnalyzer.js";
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
      console.error("Failed to fetch linked privacy policy:", err);
      return null;
    }
  })();

  setTimedCache(POLICY_FETCH_CACHE, cacheKey, promise, POLICY_FETCH_CACHE_TTL);
  return promise;
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

function buildMinimalResult(
  titleText,
  urlText,
  summary = "No likely privacy policy signal was detected."
) {
  const trackerSignals = detectTrackerSignals();

  return {
    isLikelyPolicyPage: false,
    usedLinkedPolicy: false,
    sourceLabel: getSourceLabel("page-fallback"),
    policySourceType: "page-fallback",
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

    const appShell = detectAppShellLikePage();
    const hintedPolicyLike = quickPolicyHint();
    const policyAnchorCount = countPolicyAnchors(80);
    const homepageLike = looksLikeHomepage();

    const quickSample = getQuickPageSample();
    const quickScore = scorePolicyPage(quickSample, titleText, urlText);

    if (
      !appShell.isAppShell &&
      !hintedPolicyLike &&
      quickScore < 1 &&
      policyAnchorCount === 0 &&
      !homepageLike
    ) {
      const minimalResult = buildMinimalResult(
        titleText,
        urlText,
        "No likely privacy policy signal was detected."
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

    if (!currentPageText || currentPageText.length < MIN_ANALYSIS_TEXT) {
      const minimalResult = buildMinimalResult(
        titleText,
        urlText,
        "Not enough page content was available for policy analysis."
      );
      setTimedCache(
        ANALYSIS_CACHE,
        normalizedCurrentUrl,
        minimalResult,
        ANALYSIS_CACHE_TTL
      );
      return minimalResult;
    }

    const currentScore = scorePolicyPage(currentPageText, titleText, urlText);
    const currentConfidence = classifyPageConfidence(currentScore);
    const currentPageType = getPageTypeFromScore(currentScore, titleText, urlText);

    const currentPageIsLikelyPolicy =
      currentPageType !== "search" &&
      currentPageType !== "policy-mention-only" &&
      currentScore >= POLICY_SCORE_THRESHOLD;

    let bestPolicyLink = "";
    let bestLinkScore = 0;
    let checkedCandidates = [];
    let linkSource = "";

    const shouldSearchForLink =
      !currentPageIsLikelyPolicy &&
      (
        homepageLike ||
        appShell.isAppShell ||
        policyAnchorCount > 0 ||
        hintedPolicyLike ||
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
    }

    const trackerSignals = detectTrackerSignals();

    let analyzedText = currentPageText;
    let analyzedTitle = titleText;
    let analyzedUrl = urlText;
    let analyzedScore = currentScore;
    let analyzedConfidence = currentConfidence;
    let analyzedPageType = currentPageType;

    let policySourceType = currentPageIsLikelyPolicy
      ? "current-policy-page"
      : "page-fallback";

    let usedLinkedPolicy = false;

    const currentPageRejected =
      currentPageType === "search" ||
      currentPageType === "policy-mention-only";

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
      const fetched = await fetchPolicyDocument(bestPolicyLink);

      if (fetched?.text) {
        const fetchedScore = scorePolicyPage(
          fetched.text,
          fetched.title,
          fetched.url
        );

        const fetchedConfidence = classifyPageConfidence(fetchedScore);
        const fetchedPageType = getPageTypeFromScore(
          fetchedScore,
          fetched.title,
          fetched.url,
          bestPolicyLink
        );

        const fetchedIsLikelyPolicy =
          fetchedPageType !== "search" &&
          fetchedPageType !== "policy-mention-only" &&
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
      analyzedPageType !== "search" &&
      analyzedPageType !== "policy-mention-only";

    const policyAnalysisTrusted = shouldTrustAsPolicySource(
      policySourceType,
      analyzedPageIsLikelyPolicy
    );

    const sentences = splitIntoSentences(analyzedText);
    const { dataCollected, dataEvidence } = extractDataCategories(sentences);
    const findings = policyAnalysisTrusted ? extractFindings(sentences) : [];
    const countedRisks = findings.filter((f) => f.countAsRisk);

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
      pageTitle: analyzedTitle,
      pageUrl: analyzedUrl,
      usedLinkedPolicy,
      sourceLabel: getSourceLabel(policySourceType),
      policySourceType,
      policyAnalysisTrusted,
      currentPageIsLikelyPolicy,
      analyzedPageIsLikelyPolicy,
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
      policyAnalysisTrusted,
      currentPageIsLikelyPolicy,
      analyzedPageIsLikelyPolicy,
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

      trackerSignals,
      mismatch,

      pageTitle: titleText,
      pageUrl: urlText,

      analyzedPolicyTitle: analyzedTitle,
      analyzedPolicyUrl: analyzedUrl,
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