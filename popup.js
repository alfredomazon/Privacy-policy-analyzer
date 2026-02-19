// popup.js

// Storage keys
const SERVER_URL_KEY = "gpt5ServerUrl";
const SERVER_TOKEN_KEY = "gpt5ServerToken";
const SERVER_SYNC_KEY = "gpt5ServerSync";
const TOKEN_KEY = "gpt5ExtensionToken";

function setStatusText(statusEl, enabled) {
  statusEl.textContent = enabled ? "Enabled (local setting)" : "Disabled (local setting)";
}

function showToast(toastContainer, message, type = "info") {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 220);
  }, 3500);
}

function syncToServer({ serverStatusEl, toastContainer }, url, token, enabled) {
  if (!serverStatusEl) return;

  serverStatusEl.textContent = "Syncing...";
  showToast(toastContainer, "Syncing to server...", "info");

  fetch(`${url.replace(/\/$/, "")}/status`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { "X-Admin-Token": token } : {}
    ),
    body: JSON.stringify({ enabled }),
  })
    .then((r) => r.json())
    .then((j) => {
      const ok = j && j.ok;
      serverStatusEl.textContent = ok ? "Server updated" : "Server update failed";
      showToast(toastContainer, ok ? "Server updated" : "Server update failed", ok ? "success" : "error");
    })
    .catch((err) => {
      const msg = err?.message ? err.message : String(err);
      serverStatusEl.textContent = "Sync error: " + msg;
      showToast(toastContainer, "Sync error: " + msg, "error");
    });
}

// ---------- Heuristic UI helpers ----------
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function renderHeuristic(els, r) {
  const { heuristicStatus, heuristicScore, heuristicLink, heuristicOpen } = els;

  if (!r) {
    if (heuristicStatus) heuristicStatus.textContent = "No heuristic result yet. Refresh the page, then click Refresh.";
    if (heuristicScore) heuristicScore.textContent = "";
    if (heuristicLink) heuristicLink.textContent = "—";
    if (heuristicOpen) heuristicOpen.disabled = true;
    return;
  }

  if (heuristicStatus) {
    heuristicStatus.textContent = r.isLikelyPolicyPage
      ? "This page looks like a Privacy Policy ✅"
      : "Not a policy page (heuristic)";
  }

  if (heuristicScore) heuristicScore.textContent = `Score: ${r.score}`;
  if (heuristicLink) heuristicLink.textContent = r.bestPolicyLink || "No policy link found";

  if (heuristicOpen) {
    heuristicOpen.disabled = !r.bestPolicyLink;
    heuristicOpen.onclick = () => {
      if (r.bestPolicyLink) chrome.tabs.create({ url: r.bestPolicyLink });
    };
  }
}

async function loadHeuristicIntoPopup(els) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    renderHeuristic(els, null);
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getHeuristic", tabId: tab.id }, (res) => {
      const r = res?.result || null;
      renderHeuristic(els, r);
      resolve(r);
    });
  });
}

// ===== AUTO ANALYZE helpers (GPT enhanced) =====

// Fallback: Find likely policy links from the active tab (DOM scan)
async function findPolicyLinksFromActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return [];

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const keywords = ["privacy", "terms", "policy", "legal", "tos", "conditions"];
      const anchors = Array.from(document.querySelectorAll("a[href]"));

      const urls = anchors
        .map(a => {
          const text = (a.innerText || "").toLowerCase();
          const href = a.getAttribute("href") || "";
          const hay = `${text} ${href}`.toLowerCase();

          if (!keywords.some(k => hay.includes(k))) return null;

          try {
            return new URL(href, window.location.href).toString();
          } catch {
            return null;
          }
        })
        .filter(u => u && /^https?:\/\//i.test(u));

      return Array.from(new Set(urls)).slice(0, 3);
    }
  });

  return result || [];
}

// Fetch and clean text from a URL
async function extractTextFromUrl(url) {
  const res = await fetch(url);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, svg, img").forEach(e => e.remove());

  return (doc.body?.innerText || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Select important paragraphs and cap size
function selectImportantParagraphs(text, limit = 45000) {
  const keywords = [
    "collect","collection","use","share","sharing","third party","retain","retention",
    "sell","advertis","cookie","tracking","location","biometric","children",
    "opt out","delete","deletion","access","rights","gdpr","ccpa","california"
  ];

  const paras = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 30);

  const scored = paras.map(p => {
    const lower = p.toLowerCase();
    let score = 0;

    for (const k of keywords) {
      if (lower.includes(k)) score += 1;
    }

    score += Math.min(2, p.length / 800);

    return { p, score };
  }).sort((a, b) => b.score - a.score);

  let outText = "";

  for (const { p } of scored) {
    if (outText.length + p.length + 2 > limit) continue;
    outText += (outText ? "\n\n" : "") + p;
    if (outText.length >= limit) break;
  }

  return outText.length ? outText : text.slice(0, limit);
}

async function init() {
  // Grab DOM elements AFTER the popup loads
  const checkbox = document.getElementById("gpt5-toggle");
  const statusEl = document.getElementById("status");

  const serverUrlInput = document.getElementById("server-url");
  const serverTokenInput = document.getElementById("server-token");
  const syncCheckbox = document.getElementById("sync-checkbox");
  const serverStatusEl = document.getElementById("server-status");

  const toastContainer = document.getElementById("toast-container");

  const tokenInput = document.getElementById("token");
  const textArea = document.getElementById("text");
  const out = document.getElementById("out");
  const btn = document.getElementById("analyze");

  // Heuristic UI elements (new)
  const heuristicEls = {
    heuristicStatus: document.getElementById("heuristic-status"),
    heuristicScore: document.getElementById("heuristic-score"),
    heuristicLink: document.getElementById("heuristic-link"),
    heuristicOpen: document.getElementById("heuristic-open"),
  };
  const heuristicRefreshBtn = document.getElementById("heuristic-refresh");

  // ---- 0) Load heuristic result (MAIN focus) ----
  let latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);

  if (heuristicRefreshBtn) {
    heuristicRefreshBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);
      showToast(toastContainer, "Heuristic refreshed", "info");
    });
  }

  // ---- 1) Load toggle state from background + local server settings ----
  if (checkbox && statusEl) {
    chrome.runtime.sendMessage({ type: "getStatus" }, (res) => {
      const enabled = !!(res && res.enabled);
      checkbox.checked = enabled;
      setStatusText(statusEl, enabled);
    });
  }

  chrome.storage.local.get([SERVER_URL_KEY, SERVER_TOKEN_KEY, SERVER_SYNC_KEY], (res) => {
    if (serverUrlInput) serverUrlInput.value = res[SERVER_URL_KEY] || "";
    if (serverTokenInput) serverTokenInput.value = res[SERVER_TOKEN_KEY] || "";
    if (syncCheckbox) syncCheckbox.checked = !!res[SERVER_SYNC_KEY];
  });

  // ---- 2) Save server config changes ----
  if (serverUrlInput) {
    serverUrlInput.addEventListener("change", () => {
      chrome.storage.local.set({ [SERVER_URL_KEY]: serverUrlInput.value });
      showToast(toastContainer, "Server URL saved", "info");
    });
  }

  if (serverTokenInput) {
    serverTokenInput.addEventListener("change", () => {
      chrome.storage.local.set({ [SERVER_TOKEN_KEY]: serverTokenInput.value });
      showToast(toastContainer, "Server token saved", "info");
    });
  }

  if (syncCheckbox) {
    syncCheckbox.addEventListener("change", () => {
      chrome.storage.local.set({ [SERVER_SYNC_KEY]: !!syncCheckbox.checked });
      showToast(toastContainer, syncCheckbox.checked ? "Sync enabled" : "Sync disabled", "info");
    });
  }

  // ---- 3) Toggle change -> save local + optionally sync server ----
  if (checkbox && statusEl) {
    checkbox.addEventListener("change", () => {
      const enabled = checkbox.checked;
      chrome.runtime.sendMessage({ type: "setStatus", enabled }, () => {
        setStatusText(statusEl, enabled);

        const syncOn = !!syncCheckbox?.checked;
        const url = serverUrlInput?.value?.trim();
        const token = serverTokenInput?.value?.trim();

        if (syncOn && url) {
          syncToServer({ serverStatusEl, toastContainer }, url, token, enabled);
        } else {
          showToast(toastContainer, "Local setting saved", "success");
        }
      });
    });
  }

  // ---- 4) Load + save extension token for analyzer ----
  if (tokenInput) {
    const stored = await chrome.storage.local.get([TOKEN_KEY]);
    tokenInput.value = stored[TOKEN_KEY] || "";

    tokenInput.addEventListener("change", async () => {
      await chrome.storage.local.set({ [TOKEN_KEY]: tokenInput.value.trim() });
      showToast(toastContainer, "Extension token saved", "info");
    });
  }

  // ---- 5) Analyze button -> send to background ----
  if (btn && textArea && out) {
    btn.addEventListener("click", async () => {
      const text = textArea.value.trim();
      if (!text) {
        out.textContent = "Paste some policy text first.";
        return;
      }

      out.textContent = "Analyzing...";

      chrome.runtime.sendMessage({ type: "analyzePolicy", text }, (res) => {
        if (!res) {
          out.textContent = "No response (background may not be running).";
          return;
        }
        if (!res.ok) {
          out.textContent = `Error: ${res.error}\n\n${JSON.stringify(res.details || {}, null, 2)}`;
          return;
        }
        out.textContent = JSON.stringify(res.data, null, 2);
      });
    });
  }

  // ---- 6) Auto-analyze (Enhanced GPT) ----
  const autoBtn = document.getElementById("auto-analyze");
  if (autoBtn && out) {
    autoBtn.addEventListener("click", async () => {
      try {
        out.textContent = "Preparing enhanced analysis...";

        // Refresh heuristic before using it
        latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);

        let links = [];

        // Prefer heuristic best link if available
        if (latestHeuristic?.bestPolicyLink) {
          links = [latestHeuristic.bestPolicyLink];
          out.textContent = "Using heuristic policy link:\n" + links[0] + "\n\nFetching text...";
        } else {
          out.textContent = "No heuristic policy link found. Scanning page links...";
          links = await findPolicyLinksFromActiveTab();
          if (!links.length) {
            out.textContent = "No privacy/terms links found. Try manual paste.";
            return;
          }
          out.textContent = "Found links:\n" + links.join("\n") + "\n\nFetching text...";
        }

        let combined = "";
        for (const link of links) {
          try {
            const text = await extractTextFromUrl(link);
            combined += `\n\nSOURCE: ${link}\n\n${text}`;
          } catch (e) {
            combined += `\n\nSOURCE: ${link}\n\n[Failed to fetch]`;
          }
        }

        const trimmed = selectImportantParagraphs(combined, 45000);

        out.textContent = "Sending extracted text to analyzer...";

        chrome.runtime.sendMessage({ type: "analyzePolicy", text: trimmed }, (res) => {
          if (!res) {
            out.textContent = "No response from background.";
            return;
          }
          if (!res.ok) {
            out.textContent = `Error: ${res.error}\n\n${JSON.stringify(res.details || {}, null, 2)}`;
            return;
          }
          out.textContent = JSON.stringify(res.data, null, 2);
        });
      } catch (err) {
        out.textContent = "Auto-analyze failed: " + (err?.message || String(err));
      }
    });
  }
}

// Run once, after DOM exists
document.addEventListener("DOMContentLoaded", init);
