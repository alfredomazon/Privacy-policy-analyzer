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

function getCategoryMessage(key, isPolicyPage) {
  const prefix = isPolicyPage
    ? "The policy suggests"
    : "This page may suggest";

  const messages = {
    identifiers: `${prefix} this site may collect identifying information.`,
    device_network: `${prefix} this site may collect device or network information.`,
    location: `${prefix} this site may collect location data.`,
    cookies_tracking: `${prefix} this site may use cookies or similar tools to track activity or analyze usage.`,
    payment_financial: `${prefix} this site may collect payment or financial information.`,
    contacts_content: `${prefix} this site may collect contacts, uploads, messages, or other content you provide.`,
    biometric: `${prefix} this site may collect biometric information.`,
    sensitive: `${prefix} this site may collect sensitive personal information.`,
    children: `${prefix} this site may mention children or minors and apply special rules to their data.`,
    sharing_third_parties: `${prefix} your data may be shared with third parties.`,
    retention_rights: `${prefix} data retention, deletion, access, or privacy rights may be discussed.`,
  };

  return messages[key] || `${prefix} this type of data use may be involved.`;
}

function getFindingsArray(findings) {
  return Array.isArray(findings) ? findings : [];
}

function getCountedRisks(findings = []) {
  return getFindingsArray(findings).filter(
    (f) => f && (f.countAsRisk === true)
  );
}

function getRiskStats(findings = []) {
  const countedRisks = getCountedRisks(findings);

  const high = countedRisks.filter(
    (f) => String(f.severity || "").toLowerCase() === "high"
  ).length;

  const medium = countedRisks.filter(
    (f) => String(f.severity || "").toLowerCase() === "medium"
  ).length;

  return {
    total: countedRisks.length,
    high,
    medium,
  };
}

function hasDetectedCategories(dataCollected = {}) {
  return Object.values(dataCollected || {}).some(Boolean);
}

function renderFindings(findingsEl, findings = [], options = {}) {
  if (!findingsEl) return;
  findingsEl.innerHTML = "";

  const {
    emptyMessage = "No clear privacy findings were available.",
    limit = 6,
  } = options;

  const list = getCountedRisks(findings).slice(0, limit);

  if (!list.length) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = emptyMessage;
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

function renderChecklist(
  dataChecklist,
  dataCollected,
  dataEvidence,
  options = {}
) {
  if (!dataChecklist) return;
  dataChecklist.innerHTML = "";

  const {
    isPolicyPage = false,
    allowEstimated = true,
  } = options;

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

  const hasAny = hasDetectedCategories(dataCollected || {});

  if (!isPolicyPage && !allowEstimated) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = "Open the policy page to extract detected data types.";
    dataChecklist.appendChild(note);
    return;
  }

  if (!hasAny) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = isPolicyPage
      ? "Privacy policy detected, but no clear data-type signals were found."
      : "No clear privacy-related data categories were estimated from this page.";
    dataChecklist.appendChild(note);
    return;
  }

  if (!isPolicyPage) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent =
      "Estimated from current page content. Open the likely policy page for full policy-based analysis.";
    dataChecklist.appendChild(note);
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
      impact.textContent = getCategoryMessage(key, isPolicyPage);
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

function renderReasonList(listEl, findings = [], options = {}) {
  if (!listEl) return;
  listEl.innerHTML = "";

  const {
    emptyMessage = "No major privacy concerns were clearly detected yet.",
    limit = 6,
  } = options;

  const list = getCountedRisks(findings).slice(0, limit);

  if (!list.length) {
    const li = document.createElement("li");
    li.textContent = emptyMessage;
    listEl.appendChild(li);
    return;
  }

  for (const item of list) {
    const li = document.createElement("li");
    li.textContent =
      item.title || item.summary || "Possible privacy concern detected.";
    listEl.appendChild(li);
  }
}

function setPolicyLinkUI(heuristicLink, heuristicOpen, link) {
  if (heuristicLink) {
    heuristicLink.textContent = link || "No policy link found";
  }

  if (heuristicOpen) {
    heuristicOpen.disabled = !link;
    heuristicOpen.onclick = () => {
      if (link) chrome.tabs.create({ url: link });
    };
  }
}

function renderHeuristic(els, r) {
  const {
    finderCard,
    summaryCard,
    policyFinderStatus,
    heuristicScore,
    heuristicLink,
    heuristicOpen,
    heuristicReasons,
    dataChecklist,
    heuristicFindings,
    heuristicSummary,
  } = els;

  const findings = getFindingsArray(r?.findings);
  const countedRisks = getCountedRisks(findings);
  const riskStats = getRiskStats(findings);

  if (!r) {
    if (finderCard) finderCard.style.display = "";
    if (summaryCard) summaryCard.style.display = "none";

    if (policyFinderStatus) {
      policyFinderStatus.textContent = "No page checked yet.";
    }

    if (heuristicScore) {
      heuristicScore.className = "status-text status-blue";
      heuristicScore.textContent =
        "Refresh the page to check for a privacy policy.";
    }

    if (heuristicSummary) {
      heuristicSummary.textContent = "No heuristic result yet.";
    }

    setPolicyLinkUI(heuristicLink, heuristicOpen, "");

    renderReasonList(heuristicReasons, [], {
      emptyMessage: "No meaningful risks are available yet.",
    });
    renderChecklist(dataChecklist, {}, {}, { isPolicyPage: false });
    renderFindings(heuristicFindings, [], {
      emptyMessage: "No meaningful privacy risks are available yet.",
    });
    return;
  }

  if (!r.isLikelyPolicyPage) {
    if (finderCard) finderCard.style.display = "";
    if (summaryCard) summaryCard.style.display = "none";

    if (policyFinderStatus) {
      policyFinderStatus.textContent = r.bestPolicyLink
        ? "Privacy policy not detected on this page. A likely policy link was found."
        : "Privacy policy not detected on this page.";
    }

    if (heuristicScore) {
      heuristicScore.className = "status-text status-blue";
      heuristicScore.textContent = r.bestPolicyLink
        ? "Likely policy link found."
        : "No likely policy link was found.";
    }

    if (heuristicSummary) {
      heuristicSummary.textContent = r.bestPolicyLink
        ? "Open the likely policy page for full risk findings and policy-based evidence."
        : "This page can still show estimated data categories below, but it is not being treated as the privacy policy.";
    }

    setPolicyLinkUI(heuristicLink, heuristicOpen, r.bestPolicyLink || "");

    renderReasonList(heuristicReasons, [], {
      emptyMessage:
        "Meaningful privacy risks are only counted when a likely privacy policy page is open.",
    });

    renderChecklist(
      dataChecklist,
      r.dataCollected || {},
      r.dataEvidence || {},
      { isPolicyPage: false, allowEstimated: true }
    );

    renderFindings(heuristicFindings, [], {
      emptyMessage:
        "Open the likely policy page to see counted privacy risks and full evidence.",
    });

    return;
  }

  if (finderCard) finderCard.style.display = "none";
  if (summaryCard) summaryCard.style.display = "";

  if (heuristicSummary) {
    if (riskStats.total > 0) {
      heuristicSummary.textContent =
        `This policy shows ${riskStats.total} meaningful privacy risk${riskStats.total === 1 ? "" : "s"}. Review the findings below for the biggest concerns.`;
    } else if (findings.length > 0) {
      heuristicSummary.textContent =
        "This policy was detected, but only lower-impact or less certain findings were identified.";
    } else {
      heuristicSummary.textContent =
        "This appears to be the privacy policy, but no major privacy concerns were clearly detected.";
    }
  }

  if (heuristicScore) {
    heuristicScore.className = "status-text";

    if (riskStats.high > 0) {
      heuristicScore.classList.add("status-red");
      heuristicScore.textContent =
        `${riskStats.total} risk${riskStats.total === 1 ? "" : "s"} detected (${riskStats.high} high-impact)`;
    } else if (riskStats.medium > 0) {
      heuristicScore.classList.add("status-yellow");
      heuristicScore.textContent =
        `${riskStats.total} risk${riskStats.total === 1 ? "" : "s"} detected`;
    } else {
      heuristicScore.classList.add("status-green");
      heuristicScore.textContent = "No major privacy risks detected";
    }
  }

  renderReasonList(heuristicReasons, countedRisks, {
    emptyMessage: "No meaningful privacy risks were counted on this policy page.",
  });

  renderChecklist(
    dataChecklist,
    r.dataCollected || {},
    r.dataEvidence || {},
    { isPolicyPage: true, allowEstimated: true }
  );

  renderFindings(heuristicFindings, countedRisks, {
    emptyMessage: "No meaningful privacy risks were counted on this policy page.",
  });

  setPolicyLinkUI(heuristicLink, heuristicOpen, r.bestPolicyLink || "");
}

async function loadHeuristicIntoPopup(els) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    renderHeuristic(els, null);
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getHeuristic", tabId: tab.id },
      (res) => {
        const r = res?.result || null;
        renderHeuristic(els, r);
        resolve(r);
      }
    );
  });
}

async function init() {
  const toastContainer = document.getElementById("toast-container");
  const autoBtn = document.getElementById("auto-analyze");
  const heuristicRefreshBtn = document.getElementById("heuristic-refresh");

  const heuristicEls = {
    finderCard: document.getElementById("policy-finder-card"),
    summaryCard: document.getElementById("policy-summary-card"),
    policyFinderStatus: document.getElementById("policy-finder-status"),

    heuristicScore: document.getElementById("heuristic-score"),
    heuristicLink: document.getElementById("heuristic-link"),
    heuristicOpen: document.getElementById("heuristic-open"),
    heuristicReasons: document.getElementById("heuristic-reasons"),
    dataChecklist: document.getElementById("data-checklist"),
    heuristicFindings: document.getElementById("heuristic-findings"),
    heuristicSummary: document.getElementById("heuristic-summary"),
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
