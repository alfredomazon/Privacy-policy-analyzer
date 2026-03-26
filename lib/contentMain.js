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

// ---------- Fetch + clean external policy ----------
function extractTextFromFetchedDocument(doc) {
  const clone = doc.documentElement.cloneNode(true);

  clone
    .querySelectorAll("script, style, noscript, svg, img, video, audio")
    .forEach((el) => el.remove());

  const title = norm(doc.title || "");
  const text = norm(clone.innerText || "");

  return { title, text };
}

async function fetchPolicyDocument(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

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

    return { url, title, text };
  } catch (err) {
    console.error("Failed to fetch linked privacy policy:", err);
    return null;
  }
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

// ---------- Main analysis ----------
export function runContentAnalysis() {
  async function buildResult() {
    const titleText = norm(document.title || "");
    const urlText = window.location.href;

    const mainText = getCandidateTextBlocks();
    const fullText = getVisibleText();
    const currentPageText = mainText || fullText;

    const currentScore = scorePolicyPage(currentPageText, titleText, urlText);
    const currentPageIsLikelyPolicy = currentScore >= 8;
    const currentConfidence = classifyPageConfidence(currentScore);

    const { bestPolicyLink, bestLinkScore } = findBestPolicyLink();
    const trackerSignals = detectTrackerSignals();

    // ---------- Default: analyze current page ----------
    let analyzedText = currentPageText;
    let analyzedTitle = titleText;
    let analyzedUrl = urlText;
    let analyzedScore = currentScore;
    let analyzedConfidence = currentConfidence;

    let policySourceType = currentPageIsLikelyPolicy
      ? "current-policy-page"
      : "page-fallback";

    let usedLinkedPolicy = false;

    // ---------- Try fetching linked policy if current page is not policy-like ----------
    if (!currentPageIsLikelyPolicy && bestPolicyLink) {
      const fetched = await fetchPolicyDocument(bestPolicyLink);

      if (fetched?.text) {
        const fetchedScore = scorePolicyPage(
          fetched.text,
          fetched.title,
          fetched.url
        );

        // Only accept the linked page as the analyzed source if it looks policy-like.
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

    // ---------- Analyze chosen source ----------
    const sentences = splitIntoSentences(analyzedText);

    const { dataCollected, dataEvidence } = extractDataCategories(sentences);

    // Only produce full policy findings when the analyzed source is trusted as policy-like.
    const findings = policyAnalysisTrusted ? extractFindings(sentences) : [];
    const countedRisks = findings.filter((f) => f.countAsRisk);

    // ---------- Policy side ----------
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

    // ---------- Mismatch ----------
    // Only compute mismatch as a real policy-vs-behavior comparison if the analyzed source
    // is trusted as a policy source.
    const mismatch = policyAnalysisTrusted
      ? computePolicyBehaviorMismatch(policySideResult, trackerSignals)
      : {
          score: 0,
          level: "none",
          summary:
            "No trusted privacy policy source was available for policy-vs-behavior comparison.",
          items: [],
        };

    // ---------- Final result ----------
    return {
      // This is now honest: only true when we trust the analyzed source as policy-like.
      isLikelyPolicyPage: policyAnalysisTrusted,

      // Keep source metadata explicit so popup/UI can stay smooth without fake certainty.
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

      // current page info
      pageTitle: titleText,
      pageUrl: urlText,

      // analyzed policy/source info
      analyzedPolicyTitle: analyzedTitle,
      analyzedPolicyUrl: analyzedUrl,
    };
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

  const observer = new MutationObserver(() => {
    debouncedSend();
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  let lastHref = location.href;

  const urlWatcher = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      debouncedSend();
    }
  });

  urlWatcher.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
