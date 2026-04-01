import { debounce, norm } from "./utils.js";
import {
  scorePolicyPage,
  classifyPageConfidence,
  findBestPolicyLink,
} from "./policyFinder.js";
import {
  getVisibleText,
  getCandidateTextBlocks,
  splitIntoSentences,
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

function capText(text, max = 25000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function quickPolicyHint() {
  const href = location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();

  if (
    href.includes("privacy") ||
    href.includes("policy") ||
    href.includes("terms") ||
    href.includes("legal") ||
    title.includes("privacy policy") ||
    title.includes("privacy notice") ||
    title.includes("privacy statement") ||
    title.includes("terms of service") ||
    title.includes("terms and conditions")
  ) {
    return true;
  }

  const anchors = [...document.querySelectorAll("a[href]")].slice(0, 80);

  return anchors.some((a) => {
    const text = (a.textContent || "").toLowerCase();
    const hrefAttr = (a.getAttribute("href") || "").toLowerCase();

    return (
      text.includes("privacy") ||
      text.includes("policy") ||
      text.includes("terms") ||
      text.includes("legal") ||
      hrefAttr.includes("privacy") ||
      hrefAttr.includes("policy") ||
      hrefAttr.includes("terms")
    );
  });
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
  const text = capText(norm(clone.innerText || ""), 30000);

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
        headers: {
          Accept: "text/html",
        },
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
    case "page-fallback":
    default:
      return "Page content (no policy found)";
  }
}

function shouldTrustAsPolicySource(sourceType, analyzedPageIsLikelyPolicy) {
  if (sourceType === "current-policy-page") return true;
  if (sourceType === "linked-policy" && analyzedPageIsLikelyPolicy) return true;
  return false;
}

function buildMinimalResult(
  titleText,
  urlText,
  summary = "No likely privacy policy signal was detected."
) {
  return {
    isLikelyPolicyPage: false,
    usedLinkedPolicy: false,
    sourceLabel: getSourceLabel("page-fallback"),
    policySourceType: "page-fallback",
    policyAnalysisTrusted: false,
    currentPageIsLikelyPolicy: false,
    analyzedPageIsLikelyPolicy: false,
    score: 0,
    confidence: "Low",
    bestPolicyLink: "",
    bestLinkScore: 0,
    reasons: [],
    findings: [],
    countedRiskCount: 0,
    dataCollected: {},
    dataEvidence: {},
    trackerSignals: detectTrackerSignals(),
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

// ---------- Main analysis ----------
export function runContentAnalysis() {
  async function buildResult() {
    const normalizedCurrentUrl = normalizeUrlForAnalysis(window.location.href);
    const cachedResult = getTimedCache(ANALYSIS_CACHE, normalizedCurrentUrl);
    if (cachedResult) return cachedResult;

    const titleText = norm(document.title || "");
    const urlText = window.location.href;
    const hintedPolicyLike = quickPolicyHint();

    let currentPageText = getCandidateTextBlocks();

    if (!currentPageText || currentPageText.length < 500) {
      currentPageText = getVisibleText();
    }

    currentPageText = capText(currentPageText, 25000);

    if (!currentPageText || currentPageText.length < 150) {
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
    const currentPageIsLikelyPolicy = currentScore >= 8;
    const currentConfidence = classifyPageConfidence(currentScore);

    const {
      bestPolicyLink,
      bestLinkScore,
      checkedCandidates,
    } = await findBestPolicyLink();

    const trackerSignals = detectTrackerSignals();

    let analyzedText = currentPageText;
    let analyzedTitle = titleText;
    let analyzedUrl = urlText;
    let analyzedScore = currentScore;
    let analyzedConfidence = currentConfidence;

    let policySourceType = currentPageIsLikelyPolicy
      ? "current-policy-page"
      : "page-fallback";

    let usedLinkedPolicy = false;

    let prefetchedBest = null;
    if (Array.isArray(checkedCandidates) && bestPolicyLink) {
      prefetchedBest = checkedCandidates.find(
        (c) =>
          c &&
          c.fetched === true &&
          normalizeUrlForAnalysis(c.url) ===
            normalizeUrlForAnalysis(bestPolicyLink)
      );
    }

    const shouldTryLinkedPolicy =
      !currentPageIsLikelyPolicy &&
      !!bestPolicyLink &&
      (bestLinkScore >= 16 || hintedPolicyLike);

    if (shouldTryLinkedPolicy) {
      let fetched = null;

      if (prefetchedBest?.titleText) {
        fetched = await fetchPolicyDocument(bestPolicyLink);
      } else {
        fetched = await fetchPolicyDocument(bestPolicyLink);
      }

      if (fetched?.text) {
        const fetchedScore = scorePolicyPage(
          fetched.text,
          fetched.title,
          fetched.url
        );

        if (fetchedScore >= 6) {
          analyzedText = fetched.text;
          analyzedTitle = fetched.title || analyzedTitle;
          analyzedUrl = fetched.url;
          analyzedScore = fetchedScore;
          analyzedConfidence = classifyPageConfidence(fetchedScore);
          usedLinkedPolicy = true;
          policySourceType = "linked-policy";
        }
      }
    }

    const analyzedPageIsLikelyPolicy =
      policySourceType === "current-policy-page"
        ? true
        : policySourceType === "linked-policy"
        ? analyzedScore >= 6
        : false;

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
      confidence: analyzedConfidence,
      bestPolicyLink,
      bestLinkScore,
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

      score: Math.max(0, Math.min(10, Math.round(analyzedScore / 2))),
      confidence: analyzedConfidence,

      bestPolicyLink,
      bestLinkScore,

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
  }, 700);

  function runInitialChecks() {
    sendResult();

    setTimeout(() => {
      debouncedSend();
    }, 900);
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
    if (mutationCount > 5) return;

    clearTimeout(settledTimer);
    settledTimer = setTimeout(() => {
      debouncedSend();
    }, 500);
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  setTimeout(() => {
    observer.disconnect();
  }, 8000);

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