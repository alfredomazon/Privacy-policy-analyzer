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

// ---------- Heuristic UI helpers ----------
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function formatConfidence(confidence) {
  const v = String(confidence || "").trim().toLowerCase();

  const map = {
    low: "Low confidence",
    medium: "Medium confidence",
    high: "High confidence",
    possible: "Possible",
    likely: "Likely",
    explicit: "Explicit",
  };

  return map[v] || confidence || "";
}

function formatSeverity(severity) {
  const v = String(severity || "").trim().toLowerCase();

  const map = {
    low: "Low impact",
    medium: "Medium impact",
    high: "High impact",
  };

  return map[v] || severity || "";
}

function getCategoryMessage(key) {
  const messages = {
    identifiers:
      "The policy suggests this site may collect identifying information.",
    device_network:
      "The policy suggests this site may collect device or network information.",
    location:
      "The policy suggests this site may collect location data.",
    cookies_tracking:
      "The policy suggests this site may use cookies or similar tools to track activity or analyze usage.",
    payment_financial:
      "The policy suggests this site may collect payment or financial information.",
    contacts_content:
      "The policy suggests this site may collect contacts, uploads, messages, or other content you provide.",
    biometric:
      "The policy suggests this site may collect biometric information.",
    sensitive:
      "The policy suggests this site may collect sensitive personal information.",
    children:
      "The policy mentions children or minors and may apply special rules to their data.",
    sharing_third_parties:
      "The policy suggests your data may be shared with third parties.",
    retention_rights:
      "The policy mentions data retention, deletion, access, or privacy rights.",
  };

  return messages[key] || "The policy may involve this type of data use.";
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
      showToast(
        toastContainer,
        ok ? "Server updated" : "Server update failed",
        ok ? "success" : "error"
      );
    })
    .catch((err) => {
      const msg = err?.message ? err.message : String(err);
      serverStatusEl.textContent = "Sync error: " + msg;
      showToast(toastContainer, "Sync error: " + msg, "error");
    });
}

function renderFindings(findingsEl, findings = []) {
  if (!findingsEl) return;
  findingsEl.innerHTML = "";

  const list = Array.isArray(findings) ? findings.slice(0, 6) : [];

  if (!list.length) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = "No clear privacy findings were available.";
    findingsEl.appendChild(note);
    return;
  }

  for (const item of list) {
    const card = document.createElement("div");
    card.className = "finding-card";

    const title = document.createElement("div");
    title.className = "finding-title";
    title.textContent = item.title || "Possible privacy concern";

    const meta = document.createElement("div");
    meta.className = "finding-meta";

    const metaParts = [];
    if (item.confidence) metaParts.push(formatConfidence(item.confidence));
    if (item.severity) metaParts.push(formatSeverity(item.severity));

    meta.textContent = metaParts.join(" • ");

    const summary = document.createElement("div");
    summary.className = "finding-summary";
    summary.textContent = item.summary || "";

    card.appendChild(title);
    if (meta.textContent) card.appendChild(meta);
    if (summary.textContent) card.appendChild(summary);

    card.appendChild(title);
if (meta.textContent) card.appendChild(meta);
if (summary.textContent) card.appendChild(summary);

if (Array.isArray(item.evidence) && item.evidence.length) {
  const evidenceWrap = document.createElement("div");
  evidenceWrap.className = "finding-evidence-wrap";

  const evidenceToggle = document.createElement("button");
  evidenceToggle.type = "button";
  evidenceToggle.className = "finding-evidence-toggle";
  evidenceToggle.textContent = `Show evidence (${Math.min(item.evidence.length, 2)})`;

  const evidenceBox = document.createElement("div");
  evidenceBox.className = "finding-evidence hidden";

  for (const ev of item.evidence.slice(0, 2)) {
    const line = document.createElement("div");
    line.className = "finding-evidence-line";
    line.textContent = ev;
    evidenceBox.appendChild(line);
  }

  evidenceToggle.addEventListener("click", () => {
    const isHidden = evidenceBox.classList.contains("hidden");
    evidenceBox.classList.toggle("hidden", !isHidden);
    evidenceToggle.textContent = isHidden
      ? "Hide evidence"
      : `Show evidence (${Math.min(item.evidence.length, 2)})`;
  });

  evidenceWrap.appendChild(evidenceToggle);
  evidenceWrap.appendChild(evidenceBox);
  card.appendChild(evidenceWrap);
}
    findingsEl.appendChild(card);
  }
}

function renderChecklist(dataChecklist, dataCollected, dataEvidence, isPolicyPage) {
  if (!dataChecklist) return;
  dataChecklist.innerHTML = "";

  const labels = {
    identifiers: "Identifiers (name/email/phone/IP)",
    device_network: "Device & network (device ID/logs)",
    location: "Location data",
    cookies_tracking: "Cookies & tracking/ads",
    payment_financial: "Payments & financial",
    contacts_content: "Contacts & user content",
    biometric: "Biometric data",
    sensitive: "Sensitive data (health/ID/etc.)",
    children: "Children/minors info",
    sharing_third_parties: "Sharing/third parties",
    retention_rights: "Retention & user rights",
  };

  if (!isPolicyPage) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = "Open the policy page to extract detected data types.";
    dataChecklist.appendChild(note);
    return;
  }

  const hasAny = dataCollected && Object.values(dataCollected).some(Boolean);

  if (!hasAny) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = "Policy page detected, but no clear data-type signals were found.";
    dataChecklist.appendChild(note);
    return;
  }

  for (const key of Object.keys(labels)) {
    const checked = !!dataCollected?.[key];

    const row = document.createElement("div");
    row.className = "check-row";

    const box = document.createElement("span");
    box.className = "check-box" + (checked ? " checked" : "");
    box.textContent = checked ? "✓" : "";

    const text = document.createElement("div");
    text.className = "check-text";

    const title = document.createElement("div");
    title.className = "check-title";
    title.textContent = labels[key];
    text.appendChild(title);

    if (checked) {
      const impact = document.createElement("div");
      impact.className = "check-evidence";
      impact.textContent = getCategoryMessage(key);
      text.appendChild(impact);
    }

    const ev = (dataEvidence?.[key] || []).slice(0, 2);
    if (checked && ev.length) {
      const quote = document.createElement("div");
      quote.className = "check-quote";
      quote.textContent = "Evidence: " + ev.join(" • ");
      text.appendChild(quote);
    }

    row.appendChild(box);
    row.appendChild(text);
    dataChecklist.appendChild(row);
  }
}

function renderPolicySummary(summaryEl, r) {
  if (!summaryEl) return;

  if (!r) {
    summaryEl.textContent = "No heuristic result yet. Refresh the page, then click Refresh.";
    return;
  }

  if (!r.isLikelyPolicyPage) {
    if (r.bestPolicyLink) {
      summaryEl.textContent =
        "This page does not appear to be the policy itself, but a likely policy link was found.";
    } else {
      summaryEl.textContent =
        "This page does not appear to be a privacy policy or terms page.";
    }
    return;
  }

  const findings = Array.isArray(r.findings) ? r.findings : [];
  if (!findings.length) {
    summaryEl.textContent =
      "A likely policy page was detected, but no major privacy concerns were clearly identified yet.";
    return;
  }

  const top = findings[0];
  summaryEl.textContent =
    top?.summary ||
    "A likely policy page was detected and one or more privacy concerns were flagged.";
}

function renderReasonList(listEl, findings = []) {
  if (!listEl) return;
  listEl.innerHTML = "";

  const list = Array.isArray(findings) ? findings.slice(0, 6) : [];

  if (!list.length) {
    const li = document.createElement("li");
    li.textContent = "No major privacy concerns were clearly detected yet.";
    listEl.appendChild(li);
    return;
  }

  for (const item of list) {
    const li = document.createElement("li");
    li.textContent = item.title || item.summary || "Possible privacy concern detected.";
    listEl.appendChild(li);
  }
}

function renderHeuristic(els, r) {
  const {
    heuristicStatus,
    heuristicScore,
    heuristicLink,
    heuristicOpen,
    heuristicReasons,
    dataChecklist,
    heuristicFindings,
    heuristicSummary,
  } = els;

  if (!r) {
    if (heuristicStatus) {
      heuristicStatus.textContent = "No analysis yet";
    }
    if (heuristicScore) heuristicScore.textContent = "";
    if (heuristicLink) heuristicLink.textContent = "—";
    if (heuristicOpen) heuristicOpen.disabled = true;

    renderReasonList(heuristicReasons, []);
    renderChecklist(dataChecklist, {}, {}, false);
    renderFindings(heuristicFindings, []);
    renderPolicySummary(heuristicSummary, null);
    return;
  }

  if (heuristicStatus) {
    heuristicStatus.textContent = r.isLikelyPolicyPage
      ? "Likely privacy or terms page detected"
      : "This page does not appear to be a privacy policy";
  }

  const conf = r.confidence ? ` • ${formatConfidence(r.confidence)}` : "";
if (heuristicScore) {
  const findings = Array.isArray(r.findings) ? r.findings : [];

  const highCount = findings.filter(
    f => String(f.severity || "").toLowerCase() === "high"
  ).length;

  const medCount = findings.filter(
    f => String(f.severity || "").toLowerCase() === "medium"
  ).length;

  // Reset classes
  heuristicScore.className = "status-text";

  if (!r.isLikelyPolicyPage) {
    heuristicScore.textContent = r.bestPolicyLink
      ? "A likely policy link was found."
      : "This page does not appear to be a privacy policy.";

    heuristicScore.classList.add("status-blue");

  } else if (highCount > 0) {
    heuristicScore.textContent = `${highCount} high-impact finding${highCount === 1 ? "" : "s"} detected.`;
    heuristicScore.classList.add("status-red");

  } else if (medCount > 0) {
    heuristicScore.textContent = `${medCount} moderate finding${medCount === 1 ? "" : "s"} detected.`;
    heuristicScore.classList.add("status-yellow");

  } else if (findings.length > 0) {
    heuristicScore.textContent = `${findings.length} finding${findings.length === 1 ? "" : "s"} detected.`;
    heuristicScore.classList.add("status-green");

  } else {
    heuristicScore.textContent = "No major privacy concerns were clearly detected.";
    heuristicScore.classList.add("status-green");
  }
}

  if (heuristicLink) {
    heuristicLink.textContent = r.bestPolicyLink || "No policy link found";
  }

  const findings = Array.isArray(r.findings) ? r.findings : [];
  renderReasonList(heuristicReasons, findings);
  renderChecklist(dataChecklist, r.dataCollected || {}, r.dataEvidence || {}, !!r.isLikelyPolicyPage);
  renderFindings(heuristicFindings, findings);
  renderPolicySummary(heuristicSummary, r);

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

async function findPolicyLinksFromActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return [];

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const keywords = ["privacy", "terms", "policy", "legal", "tos", "conditions"];
      const anchors = Array.from(document.querySelectorAll("a[href]"));

      const urls = anchors
        .map((a) => {
          const text = (a.innerText || "").toLowerCase();
          const href = a.getAttribute("href") || "";
          const hay = `${text} ${href}`.toLowerCase();

          if (!keywords.some((k) => hay.includes(k))) return null;

          try {
            return new URL(href, window.location.href).toString();
          } catch {
            return null;
          }
        })
        .filter((u) => u && /^https?:\/\//i.test(u));

      return Array.from(new Set(urls)).slice(0, 3);
    },
  });

  return result || [];
}

async function extractTextFromUrl(url) {
  const res = await fetch(url);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, svg, img").forEach((e) => e.remove());

  return (doc.body?.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
}

function selectImportantParagraphs(text, limit = 45000) {
  const keywords = [
    "collect",
    "collection",
    "use",
    "share",
    "sharing",
    "third party",
    "retain",
    "retention",
    "sell",
    "advertis",
    "cookie",
    "tracking",
    "location",
    "biometric",
    "children",
    "opt out",
    "delete",
    "deletion",
    "access",
    "rights",
    "gdpr",
    "ccpa",
    "california",
  ];

  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  const scored = paras
    .map((p) => {
      const lower = p.toLowerCase();
      let score = 0;

      for (const k of keywords) {
        if (lower.includes(k)) score += 1;
      }

      score += Math.min(2, p.length / 800);

      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  let outText = "";

  for (const { p } of scored) {
    if (outText.length + p.length + 2 > limit) continue;
    outText += (outText ? "\n\n" : "") + p;
    if (outText.length >= limit) break;
  }

  return outText.length ? outText : text.slice(0, limit);
}

function formatAnalysisForUser(data) {
  if (!data) return "No analysis result available.";

  const findings = Array.isArray(data.findings) ? data.findings : [];
  const summary = data.summary || "";

  if (!findings.length) {
    return summary || "No major privacy concerns were clearly detected in the selected text.";
  }

  let text = "";

  if (summary) {
    text += `Summary\n${summary}\n\n`;
  } else {
    text += "Privacy summary\n\n";
  }

  for (const item of findings.slice(0, 5)) {
    text += `• ${item.title || "Possible privacy concern"}\n`;

    if (item.summary) {
      text += `  ${item.summary}\n`;
    }

    const meta = [];
    if (item.confidence) meta.push(`Confidence: ${formatConfidence(item.confidence)}`);
    if (item.severity) meta.push(`Impact: ${formatSeverity(item.severity)}`);
    if (meta.length) text += `  ${meta.join(" • ")}\n`;

    if (Array.isArray(item.evidence) && item.evidence.length) {
      text += `  Evidence: ${item.evidence[0]}\n`;
    }

    text += "\n";
  }

  return text.trim();
}

async function init() {
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

  const heuristicEls = {
    heuristicStatus: document.getElementById("heuristic-status"),
    heuristicScore: document.getElementById("heuristic-score"),
    heuristicLink: document.getElementById("heuristic-link"),
    heuristicOpen: document.getElementById("heuristic-open"),
    heuristicReasons: document.getElementById("heuristic-reasons"),
    dataChecklist: document.getElementById("data-checklist"),
    heuristicFindings: document.getElementById("heuristic-findings"),
    heuristicSummary: document.getElementById("heuristic-summary"),
  };

  const heuristicRefreshBtn = document.getElementById("heuristic-refresh");

  let latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);

  if (heuristicRefreshBtn) {
    heuristicRefreshBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);
      showToast(toastContainer, "Heuristic refreshed", "info");
    });
  }

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
      showToast(
        toastContainer,
        syncCheckbox.checked ? "Sync enabled" : "Sync disabled",
        "info"
      );
    });
  }

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

  if (tokenInput) {
    const stored = await chrome.storage.local.get([TOKEN_KEY]);
    tokenInput.value = stored[TOKEN_KEY] || "";

    tokenInput.addEventListener("change", async () => {
      await chrome.storage.local.set({ [TOKEN_KEY]: tokenInput.value.trim() });
      showToast(toastContainer, "Extension token saved", "info");
    });
  }

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

        out.textContent = formatAnalysisForUser(res.data);
      });
    });
  }

  const autoBtn = document.getElementById("auto-analyze");
  if (autoBtn && out) {
    autoBtn.addEventListener("click", async () => {
      try {
        out.textContent = "Preparing enhanced analysis...";

        latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);

        let links = [];

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

          out.textContent = formatAnalysisForUser(res.data);
        });
      } catch (err) {
        out.textContent = "Auto-analyze failed: " + (err?.message || String(err));
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);