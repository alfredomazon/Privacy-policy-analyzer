// popup.js

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
    finderCard,
    summaryCard,
    statusTextEl,
    heuristicStatus,
    heuristicScore,
    heuristicLink,
    heuristicOpen,
    heuristicReasons,
    dataChecklist,
    heuristicFindings,
    heuristicSummary,
  } = els;

  const findings = Array.isArray(r?.findings) ? r.findings : [];
  const highCount = findings.filter(
    (f) => String(f.severity || "").toLowerCase() === "high"
  ).length;
  const medCount = findings.filter(
    (f) => String(f.severity || "").toLowerCase() === "medium"
  ).length;

  if (!r) {
    if (finderCard) finderCard.style.display = "";
    if (summaryCard) summaryCard.style.display = "none";

    if (statusTextEl) {
      statusTextEl.textContent = "No page checked yet.";
    }

    if (heuristicStatus) {
      heuristicStatus.textContent = "No analysis yet";
    }

    if (heuristicScore) {
      heuristicScore.className = "status-text status-blue";
      heuristicScore.textContent = "Refresh the page to check for a policy link.";
    }

    if (heuristicLink) heuristicLink.textContent = "—";
    if (heuristicOpen) heuristicOpen.disabled = true;

    if (heuristicSummary) {
      heuristicSummary.textContent = "No heuristic result yet.";
    }

    renderReasonList(heuristicReasons, []);
    renderChecklist(dataChecklist, {}, {}, false);
    renderFindings(heuristicFindings, []);
    return;
  }

  if (!r.isLikelyPolicyPage) {
    if (finderCard) finderCard.style.display = "";
    if (summaryCard) summaryCard.style.display = "none";

    if (statusTextEl) {
      statusTextEl.textContent = r.bestPolicyLink
        ? "This page does not look like the privacy policy, but a likely policy page was found."
        : "This page does not look like the privacy policy.";
    }

    if (heuristicStatus) {
      heuristicStatus.textContent = "Not policy page";
    }

    if (heuristicScore) {
      heuristicScore.className = "status-text status-blue";
      heuristicScore.textContent = r.bestPolicyLink
        ? "A likely policy link was found."
        : "No likely policy link was found.";
    }

    if (heuristicLink) {
      heuristicLink.textContent = r.bestPolicyLink || "No policy link found";
    }

    if (heuristicOpen) {
      heuristicOpen.disabled = !r.bestPolicyLink;
      heuristicOpen.onclick = () => {
        if (r.bestPolicyLink) chrome.tabs.create({ url: r.bestPolicyLink });
      };
    }

    renderReasonList(heuristicReasons, []);
    renderChecklist(dataChecklist, {}, {}, false);
    renderFindings(heuristicFindings, []);
    return;
  }

  if (finderCard) finderCard.style.display = "none";
  if (summaryCard) summaryCard.style.display = "";

  if (heuristicSummary) {
    if (highCount > 0) {
      heuristicSummary.textContent =
        `This policy shows ${highCount} high-impact privacy finding${highCount === 1 ? "" : "s"}. Review the findings below for the biggest concerns.`;
    } else if (medCount > 0) {
      heuristicSummary.textContent =
        `This policy shows ${medCount} moderate privacy finding${medCount === 1 ? "" : "s"}.`;
    } else if (findings.length > 0) {
      heuristicSummary.textContent =
        "This policy was detected and a few lower-impact privacy findings were identified.";
    } else {
      heuristicSummary.textContent =
        "This appears to be the policy page, but no major privacy concerns were clearly detected.";
    }
  }

  if (heuristicScore) {
    heuristicScore.className = "status-text";

    if (highCount > 0) {
      heuristicScore.classList.add("status-red");
      heuristicScore.textContent = `${highCount} high-impact finding${highCount === 1 ? "" : "s"} detected`;
    } else if (medCount > 0) {
      heuristicScore.classList.add("status-yellow");
      heuristicScore.textContent = `${medCount} moderate finding${medCount === 1 ? "" : "s"} detected`;
    } else if (findings.length > 0) {
      heuristicScore.classList.add("status-green");
      heuristicScore.textContent = `${findings.length} finding${findings.length === 1 ? "" : "s"} detected`;
    } else {
      heuristicScore.classList.add("status-green");
      heuristicScore.textContent = "No major privacy concerns detected";
    }
  }

  renderReasonList(heuristicReasons, findings);
  renderChecklist(
    dataChecklist,
    r.dataCollected || {},
    r.dataEvidence || {},
    true
  );
  renderFindings(heuristicFindings, findings);

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

async function init() {
  const toastContainer = document.getElementById("toast-container");
  const autoBtn = document.getElementById("auto-analyze");
  const heuristicRefreshBtn = document.getElementById("heuristic-refresh");

  const heuristicStatus = document.getElementById("heuristic-status");
  const heuristicSummary = document.getElementById("heuristic-summary");

  const heuristicEls = {
    finderCard: heuristicStatus?.closest(".card") || null,
    summaryCard: heuristicSummary?.closest(".card") || null,
    statusTextEl: document.getElementById("status"),

    heuristicStatus,
    heuristicScore: document.getElementById("heuristic-score"),
    heuristicLink: document.getElementById("heuristic-link"),
    heuristicOpen: document.getElementById("heuristic-open"),
    heuristicReasons: document.getElementById("heuristic-reasons"),
    dataChecklist: document.getElementById("data-checklist"),
    heuristicFindings: document.getElementById("heuristic-findings"),
    heuristicSummary,
  };

  let latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);

  if (heuristicRefreshBtn) {
    heuristicRefreshBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);
      showToast(toastContainer, "Policy check refreshed", "info");
    });
  }

  if (autoBtn) {
    autoBtn.textContent = "Refresh";
    autoBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);
      showToast(toastContainer, "Summary refreshed", "info");
    });
  }

  function initDetailsToggles() {
    const allDetails = document.querySelectorAll("details");

    allDetails.forEach((d) => {
      const caret = d.querySelector(".summary-caret");
      if (!caret) return;

      const update = () => {
        caret.textContent = d.open ? "Collapse" : "Expand";
      };

      update();
      d.addEventListener("toggle", update);
    });
  }

  initDetailsToggles();
}

document.addEventListener("DOMContentLoaded", init);