// background.js (service worker)

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const TOKEN_KEY = "gpt5ExtensionToken";

// --- Heuristic cache (per tab) ---
const HEURISTIC_BY_TAB = {};


// --- Toolbar icons ---
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

  }

};


// Convert numeric score into color level
function scoreToLevel(score) {

  if (score >= 70) return "red";

  if (score >= 35) return "yellow";

  return "blue";

}


// Improved heuristic scoring logic
function computeFromHeuristic(result) {

  if (!result)
    return { score: 0, issuesCount: 0 };


  // NOT on policy page

  if (!result.isLikelyPolicyPage) {

    const strong =
      result.bestPolicyLink &&
      result.bestLinkScore >= 9;

    return {

      score: strong ? 40 : 0,
      issuesCount: 0

    };

  }


  const suspiciousCats = [

    "cookies_tracking",
    "sharing_third_parties",
    "sensitive",
    "biometric",
    "children",

  ];


  const found = result.dataCollected || {};


  const issuesCount =
    suspiciousCats.reduce(
      (n, k) => n + (found[k] ? 1 : 0),
      0
    );


  let score = issuesCount * 22;


  if (result.confidence === "High")
    score += 10;


  if (result.confidence === "Low")
    score -= 10;


  score =
    Math.max(0, Math.min(100, score));


  return { score, issuesCount };

}


// Apply toolbar state
async function setToolbar(tabId, { score, issuesCount = 0 }) {

  const level = scoreToLevel(score);


  await chrome.action.setIcon({

    tabId,
    path: ICONS[level]

  });


  await chrome.action.setBadgeText({

    tabId,
    text: issuesCount
      ? String(Math.min(issuesCount, 99))
      : ""

  });


  await chrome.action.setBadgeBackgroundColor({

    tabId,

    color:

      level === "red"
        ? "#D93025"
        : level === "yellow"
        ? "#F9AB00"
        : "#1A73E8"

  });


  await chrome.action.setTitle({

    tabId,

    title:

      level === "red"
        ? `High risk: ${issuesCount} flags — click to review`

        : level === "yellow"
        ? `Privacy policy detected — click to review`

        : `No privacy policy detected yet`

  });

}


// Show scanning state during navigation
chrome.tabs.onUpdated.addListener((tabId, info) => {

  if (info.status === "loading") {

    chrome.action.setIcon({
      tabId,
      path: ICONS.blue
    });

    chrome.action.setBadgeText({
      tabId,
      text: ""
    });

    chrome.action.setTitle({
      tabId,
      title: "Scanning page..."
    });

  }

});


// Cleanup closed tabs
chrome.tabs.onRemoved.addListener(tabId => {

  delete HEURISTIC_BY_TAB[tabId];

});


// Initialize storage toggle
chrome.runtime.onInstalled.addListener(() => {

  chrome.storage.local.get([TOGGLE_KEY], (res) => {

    if (res[TOGGLE_KEY] === undefined) {

      chrome.storage.local.set({
        [TOGGLE_KEY]: false
      });

    }

  });

});


// Main message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (!msg || !msg.type)
    return;


  // Heuristic result from content.js

  if (msg.type === "heuristicResult") {

    const tabId = sender.tab?.id;

    if (tabId != null) {

      HEURISTIC_BY_TAB[tabId] = msg.result;


      const { score, issuesCount } =
        computeFromHeuristic(msg.result);


      setToolbar(tabId, {
        score,
        issuesCount
      });

    }

    return;

  }


  // Popup requests heuristic

  if (msg.type === "getHeuristic") {

    const tabId = msg.tabId;

    sendResponse({

      ok: true,
      result:
        HEURISTIC_BY_TAB[tabId] || null

    });

    return true;

  }


  // Get GPT toggle state

  if (msg.type === "getStatus") {

    chrome.storage.local.get([TOGGLE_KEY], res => {

      sendResponse({

        enabled: !!res[TOGGLE_KEY]

      });

    });

    return true;

  }


  // Set GPT toggle state

  if (msg.type === "setStatus") {

    chrome.storage.local.set({

      [TOGGLE_KEY]: !!msg.enabled

    }, () => {

      sendResponse({ ok: true });

    });

    return true;

  }


  // GPT Analysis

  if (msg.type === "analyzePolicy") {

    (async () => {

      try {

        const toggleRes =
          await chrome.storage.local.get([TOGGLE_KEY]);

        if (!toggleRes[TOGGLE_KEY]) {

          sendResponse({

            ok: false,
            error: "Analyzer disabled"

          });

          return;

        }


        const stored =
          await chrome.storage.local.get([TOKEN_KEY]);

        const token = stored[TOKEN_KEY];


        if (!token) {

          sendResponse({

            ok: false,
            error: "Missing extension token"

          });

          return;

        }


        const r = await fetch(
          `${SERVER_URL}/analyze`,
          {

            method: "POST",

            headers: {

              "Content-Type": "application/json",

              "X-Extension-Token": token,

            },

            body: JSON.stringify({

              text: msg.text

            }),

          }
        );


        const data =
          await r.json().catch(() => null);


        if (!r.ok) {

          sendResponse({

            ok: false,
            error:
              data?.error ||
              `HTTP ${r.status}`

          });

          return;

        }


        sendResponse({

          ok: true,
          data

        });

      }

      catch (err) {

        sendResponse({

          ok: false,
          error:
            err?.message ||
            String(err)

        });

      }

    })();


    return true;

  }

});
