// background.js (service worker)

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const TOKEN_KEY = "gpt5ExtensionToken";

// --- Heuristic cache (per tab) ---
const HEURISTIC_BY_TAB = {};

// --- Toolbar icons (use PNG for best reliability) ---
const ICONS = {
  blue: {
    16: "icons/EvilEye16.png",
    32: "icons/EvilEye32.png",
    48: "icons/EvilEye48.png",
    128: "icons/EvilEye128.png",
  },
  yellow: {
    16: "icons/EvilEyeYellow16.png",
    32: "icons/EvilEyeYellow32.png",
    48: "icons/EvilEyeYellow48.png",
    128: "icons/EvilEyeYellow128.png",
  },
  red: {
    16: "icons/EvilEyeRed16.png",
    32: "icons/EvilEyeRed32.png",
    48: "icons/EvilEyeRed48.png",
    128: "icons/EvilEyeRed128.png",
  },
};

function scoreToLevel(score) {
  if (score >= 70) return "red";
  if (score >= 35) return "yellow";
  return "blue";
}

// Converts heuristic into a 0..100 score + issuesCount.
// Option A tweak: if NOT on policy page, but strong link exists -> yellow.
function computeFromHeuristic(result) {
  if (!result) return { score: 0, issuesCount: 0 };

  // Not on a policy page yet:
  // if we detected a strong privacy link, show yellow (score ~40).
  if (!result.isLikelyPolicyPage) {
    const bestLinkScore = result.bestLinkScore || 0;
    const hasStrongLink = !!result.bestPolicyLink && bestLinkScore >= 9;
    return { score: hasStrongLink ? 40 : 0, issuesCount: 0 };
  }

  const found = result.dataCollected || {};

  const suspiciousCats = [
    "cookies_tracking",
    "sharing_third_parties",
    "sensitive",
    "biometric",
    "children",
  ];

  const issuesCount = suspiciousCats.reduce((n, k) => n + (found[k] ? 1 : 0), 0);

  let score = issuesCount * 22;
  if (result.confidence === "High") score += 10;
  if (result.confidence === "Low") score -= 10;
  score = Math.max(0, Math.min(100, score));

  return { score, issuesCount };
}

async function setToolbar(tabId, { score, issuesCount = 0 }) {
  const level = scoreToLevel(score);

  await chrome.action.setIcon({ tabId, path: ICONS[level] });

  await chrome.action.setBadgeText({
    tabId,
    text: issuesCount ? String(Math.min(issuesCount, 99)) : "",
  });

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: level === "red" ? "#D93025" : level === "yellow" ? "#F9AB00" : "#1A73E8",
  });

  await chrome.action.setTitle({
    tabId,
    title:
      level === "red"
        ? `High risk: ${issuesCount} flags — click to review`
        : level === "yellow"
        ? `Policy detected — click to review`
        : `No policy detected yet`,
  });
}

// Show “Scanning…” while page is loading/navigating
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: "Scanning..." });

    // prevents stale popup data while new page loads
    if (info.url) delete HEURISTIC_BY_TAB[tabId];
  }
});
// Cleanup cache when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete HEURISTIC_BY_TAB[tabId];
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([TOGGLE_KEY], (res) => {
    if (res[TOGGLE_KEY] === undefined) {
      chrome.storage.local.set({ [TOGGLE_KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // ==============================
  // 0) Content script sends heuristic result
  // ==============================
  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      // Cache full heuristic object for popup rendering
      HEURISTIC_BY_TAB[tabId] = msg.result;

      // Compute toolbar state from heuristic
      const { score, issuesCount } = computeFromHeuristic(msg.result);
      setToolbar(tabId, { score, issuesCount });
    }
    return; // no response needed
  }

  // ==============================
  // 0.5) Popup asks for heuristic result
  // ==============================
  if (msg.type === "getHeuristic") {
    const tabId = msg.tabId;
    sendResponse({ ok: true, result: HEURISTIC_BY_TAB[tabId] || null });
    return true;
  }

  // ==============================
  // 1) popup asks: what's toggle state?
  // ==============================
  if (msg.type === "getStatus") {
    chrome.storage.local.get([TOGGLE_KEY], (res) => {
      sendResponse({ enabled: !!res[TOGGLE_KEY] });
    });
    return true;
  }

  // ==============================
  // 2) popup says: set toggle state
  // ==============================
  if (msg.type === "setStatus") {
    chrome.storage.local.set({ [TOGGLE_KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // ==============================
  // 3) popup says: analyze this text (GPT mode)
  // ==============================
  if (msg.type === "analyzePolicy") {
    (async () => {
      try {
        const toggleRes = await chrome.storage.local.get([TOGGLE_KEY]);
        if (!toggleRes[TOGGLE_KEY]) {
          sendResponse({ ok: false, error: "Analyzer is disabled. Turn it on first." });
          return;
        }

        const stored = await chrome.storage.local.get([TOKEN_KEY]);
        const token = stored[TOKEN_KEY];

        if (!token) {
          sendResponse({ ok: false, error: "Missing Extension Token. Paste it in the popup settings." });
          return;
        }

        const r = await fetch(`${SERVER_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Extension-Token": token,
          },
          body: JSON.stringify({ text: msg.text }),
        });

        const data = await r.json().catch(() => null);

        if (!r.ok) {
          sendResponse({
            ok: false,
            error: (data && data.error) ? data.error : `HTTP ${r.status}`,
            details: data,
          });
          return;
        }

        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();

    return true; // keep channel open
  }
});
