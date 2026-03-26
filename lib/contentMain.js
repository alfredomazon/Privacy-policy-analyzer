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
    setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "text/html",
      },
      signal: controller.signal,
    });

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

// ---------- Main analysis ----------
export function runContentAnalysis() {
  async function buildResult() {
    const titleText = norm(document.title || "");
    const urlText = window.location.href;

    const mainText = getCandidateTextBlocks();
    const fullText = getVisibleText();
    const currentPageText = mainText || fullText;

    const currentScore = scorePolicyPage(currentPageText, titleText, urlText);
    const isLikelyPolicyPage = currentScore >= 8;
    const currentConfidence = classifyPageConfidence(currentScore);

    const { bestPolicyLink, bestLinkScore } = findBestPolicyLink();
    const trackerSignals = detectTrackerSignals();

    // ---------- Default: current page ----------
    let analyzedText = currentPageText;
    let analyzedTitle = titleText;
    let analyzedUrl = urlText;
    let usedLinkedPolicy = false;
    let analyzedScore = currentScore;
    let policyConfidence = currentConfidence;

    // ---------- Try fetching linked policy ----------
    if (!isLikelyPolicyPage && bestPolicyLink) {
      const fetched = await fetchPolicyDocument(bestPolicyLink);

      if (fetched?.text) {
        const fetchedScore = scorePolicyPage(
          fetched.text,
          fetched.title,
          fetched.url
        );

        // Only accept if it actually looks like a policy
        if (fetchedScore >= 6) {
          analyzedText = fetched.text;
          analyzedTitle = fetched.title || analyzedTitle;
          analyzedUrl = fetched.url;
          usedLinkedPolicy = true;

          analyzedScore = fetchedScore;
          policyConfidence = classifyPageConfidence(fetchedScore);
        }
      }
    }

    // ---------- Analyze chosen policy source ----------
    const sentences = splitIntoSentences(analyzedText);

    const { dataCollected, dataEvidence } =
      extractDataCategories(sentences);

    const findings = extractFindings(sentences);
    const countedRisks = findings.filter((f) => f.countAsRisk);

    // ---------- Policy side ----------
    const policySideResult = {
      isLikelyPolicyPage: true, // 🔥 ALWAYS TRUE (force policy mode)
      confidence: policyConfidence,
      bestPolicyLink,
      bestLinkScore,
      findings,
      countedRiskCount: countedRisks.length,
      dataCollected,
      dataEvidence,
      pageTitle: analyzedTitle,
      pageUrl: analyzedUrl,
      usedLinkedPolicy,
      sourceLabel: usedLinkedPolicy
        ? "Linked privacy policy"
        : isLikelyPolicyPage
        ? "Privacy policy page"
        : "Page content (no policy found)",
    };

    // ---------- Mismatch ----------
    const mismatch = computePolicyBehaviorMismatch(
      policySideResult,
      trackerSignals
    );

    // ---------- Final result ----------
    return {
      isLikelyPolicyPage: true, // 🔥 always true for UI
      usedLinkedPolicy,
      sourceLabel: policySideResult.sourceLabel,

      score: Math.max(0, Math.min(10, Math.round(analyzedScore / 2))),
      confidence: policyConfidence,

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

      // analyzed policy info
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