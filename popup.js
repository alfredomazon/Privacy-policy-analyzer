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

// ---------- Shared helpers ----------
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function getHostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ---------- Heuristic UI helpers ----------
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

function getCategoryMessage(key, isPolicyLikeSource) {
  const prefix = isPolicyLikeSource
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
    (f) => f && f.countAsRisk === true
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

function getThemeFromToolbarScore(score = 0) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "blue";
  if (numeric >= 70) return "red";
  if (numeric >= 35) return "yellow";
  return "blue";
}

function getPopupRiskTheme(result = {}) {
  const toolbarLevel = String(result?.toolbarState?.level || "").toLowerCase();
  if (["red", "yellow", "blue"].includes(toolbarLevel)) return toolbarLevel;

  return getThemeFromToolbarScore(result?.toolbarState?.score);
}

function getThemeIconPath(theme = "blue") {
  if (theme === "red") return "icons/EvilEyeRed48.png";
  if (theme === "yellow") return "icons/EvilEyeYellow48.png";
  return "icons/EvilEye48.png";
}

function applyPopupRiskTheme(theme = "blue") {
  const normalized = ["red", "yellow", "blue"].includes(theme)
    ? theme
    : "blue";

  document.body.dataset.riskTheme = normalized;

  const brandEye = document.getElementById("brand-eye");
  if (brandEye) {
    brandEye.src = getThemeIconPath(normalized);
  }
}

function hasDetectedCategories(dataCollected = {}) {
  return Object.values(dataCollected || {}).some(Boolean);
}

function getSourceState(result) {
  const sourceType = String(result?.policySourceType || "").toLowerCase();

  if (sourceType === "current-policy-page") {
    return {
      type: "current-policy-page",
      isPolicyLikeSource: true,
      label: "Current privacy policy page",
    };
  }

  if (sourceType === "linked-policy") {
    return {
      type: "linked-policy",
      isPolicyLikeSource: true,
      label: "Linked privacy policy",
    };
  }

  if (sourceType === "known-domain") {
    return {
      type: "known-domain",
      isPolicyLikeSource: true,
      label: "Known domain privacy policy",
    };
  }

  return {
    type: "page-fallback",
    isPolicyLikeSource: false,
    label: "Current page content",
  };
}

function getShortText(item) {
  return (
    item?.title ||
    item?.summary ||
    "Possible privacy concern detected."
  );
}

function severityRank(value = "") {
  const severity = String(value || "").toLowerCase();
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function confidenceRank(value = "") {
  const confidence = String(value || "").toLowerCase();
  if (confidence === "explicit") return 4;
  if (confidence === "likely") return 3;
  if (confidence === "medium") return 2;
  if (confidence === "possible") return 1;
  return 0;
}

function sortFindingsForDisplay(items = []) {
  return [...items].sort((a, b) => {
    const severityDiff = severityRank(b?.severity) - severityRank(a?.severity);
    if (severityDiff) return severityDiff;

    const confidenceDiff = confidenceRank(b?.confidence) - confidenceRank(a?.confidence);
    if (confidenceDiff) return confidenceDiff;

    const scoreDiff = (b?.score || 0) - (a?.score || 0);
    if (scoreDiff) return scoreDiff;

    const aText = getShortText(a);
    const bText = getShortText(b);
    return aText.length - bText.length;
  });
}

function getImmediateFindings(findings = [], limit = Infinity) {
  const sorted = sortFindingsForDisplay(getCountedRisks(findings));
  const highImpact = sorted.filter(
    (item) => String(item?.severity || "").toLowerCase() === "high"
  );

  return highImpact.slice(0, limit);
}

function getSeverityIconPath(severity = "") {
  const value = String(severity || "").toLowerCase();
  if (value === "high") return "icons/EvilEyeRed32.png";
  if (value === "medium") return "icons/EvilEyeYellow32.png";
  return "icons/EvilEye32.png";
}

function setSeverityBadgeIcon(badge, severity = "") {
  if (!badge) return;

  const label = formatSeverity(severity) || "Impact";
  badge.textContent = "";
  badge.title = label;
  badge.setAttribute("aria-label", label);

  const icon = document.createElement("img");
  icon.className = "impact-eye-icon";
  icon.src = getSeverityIconPath(severity);
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  badge.appendChild(icon);
}

const EVIDENCE_KEYWORDS_BY_CATEGORY = {
  tracking: [
    "targeted advertising",
    "personalized ads",
    "tracking technologies",
    "cookies",
    "analytics",
    "pixels",
    "beacons",
  ],
  sharing: [
    "share",
    "disclose",
    "third parties",
    "partners",
    "vendors",
    "affiliates",
  ],
  sale: [
    "sell",
    "sale",
    "sold",
    "valuable consideration",
    "cross-context behavioral advertising",
  ],
  location: ["precise location", "geolocation", "gps", "location"],
  financial: ["payment", "billing", "financial", "credit card", "bank"],
  sensitive: [
    "sensitive personal information",
    "social security",
    "health information",
    "medical information",
    "government id",
    "driver's license",
    "passport",
    "precise geolocation",
    "sensitive",
    "health",
    "medical",
  ],
  biometric: [
    "biometric identifiers",
    "biometric information",
    "biometric",
    "fingerprint",
    "face geometry",
    "voiceprint",
    "retina",
    "iris",
  ],
  identifiers: [
    "personal information",
    "identifying information",
    "account information",
    "ip address",
    "email address",
    "name",
    "email",
    "phone",
    "address",
  ],
  device_network: ["device", "browser", "ip address", "user agent", "log data"],
  contacts_content: ["contacts", "messages", "photos", "files", "uploads"],
};

function normalizeEvidenceText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function getEvidenceKeywords(item = {}) {
  const category = String(item.category || "").toLowerCase();
  return EVIDENCE_KEYWORDS_BY_CATEGORY[category] || [];
}

function getEvidenceSignal(text = "", item = {}) {
  const clean = normalizeEvidenceText(text);
  const lower = clean.toLowerCase();
  const keywords = getEvidenceKeywords(item)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return keywords.find((word) => lower.includes(word.toLowerCase())) || "";
}

function createEvidenceSnippet(text = "", item = {}, maxLen = 96) {
  const clean = normalizeEvidenceText(text);
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;

  const lower = clean.toLowerCase();
  const signal = getEvidenceSignal(clean, item);
  const matchIndex = signal ? lower.indexOf(signal.toLowerCase()) : -1;

  const center = matchIndex >= 0 ? matchIndex : 0;
  const start = Math.max(0, center - 32);
  const end = Math.min(clean.length, start + maxLen);
  let snippet = clean.slice(start, end).trim();

  const firstSpace = snippet.indexOf(" ");
  if (start > 0 && firstSpace > 0) {
    snippet = snippet.slice(firstSpace + 1);
  }

  const lastSpace = snippet.lastIndexOf(" ");
  if (end < clean.length && lastSpace > 60) {
    snippet = snippet.slice(0, lastSpace);
  }

  return `${start > 0 ? "..." : ""}${snippet}${end < clean.length ? "..." : ""}`;
}

function appendHighlightedEvidence(line, snippet, signal = "") {
  const lower = snippet.toLowerCase();

  if (!signal || !lower.includes(signal.toLowerCase())) {
    line.textContent = snippet;
    return;
  }

  const index = lower.indexOf(signal.toLowerCase());
  line.append(document.createTextNode(snippet.slice(0, index)));

  const mark = document.createElement("mark");
  mark.textContent = snippet.slice(index, index + signal.length);
  line.append(mark);

  line.append(document.createTextNode(snippet.slice(index + signal.length)));
}

function formatEvidenceSection(item = {}) {
  const section = item.section || (Array.isArray(item.sections) ? item.sections[0] : "");
  const map = {
    collection: "Collection",
    use: "Use",
    sharing: "Sharing",
    tracking: "Tracking",
    rights: "Rights",
    general: "Policy",
  };

  return map[String(section || "").toLowerCase()] || "Policy";
}

function appendEvidenceCard(parent, evidenceText, item) {
  const signal = getEvidenceSignal(evidenceText, item);
  const snippet = createEvidenceSnippet(evidenceText, item);

  const card = document.createElement("div");
  card.className = "evidence-card";

  const meta = document.createElement("div");
  meta.className = "evidence-card-meta";

  const section = document.createElement("span");
  section.className = "evidence-chip";
  section.textContent = formatEvidenceSection(item);
  meta.appendChild(section);

  if (signal) {
    const signalEl = document.createElement("span");
    signalEl.className = "evidence-signal";
    signalEl.textContent = signal;
    meta.appendChild(signalEl);
  }

  const quote = document.createElement("div");
  quote.className = "finding-evidence-line";
  appendHighlightedEvidence(quote, snippet, signal);

  card.appendChild(meta);
  card.appendChild(quote);
  parent.appendChild(card);
}

function appendEvidenceToggle(parent, item) {
  if (!parent || !Array.isArray(item?.evidence) || !item.evidence.length) return;

  const evidenceWrap = document.createElement("div");
  evidenceWrap.className = "finding-evidence-wrap";

  const evidenceToggle = document.createElement("button");
  evidenceToggle.type = "button";
  evidenceToggle.className = "finding-evidence-toggle";
  evidenceToggle.textContent = `Show quote${item.evidence.length > 1 ? "s" : ""}`;

  const evidenceBox = document.createElement("div");
  evidenceBox.className = "finding-evidence hidden";

  for (const ev of item.evidence.slice(0, 2)) {
    appendEvidenceCard(evidenceBox, ev, item);
  }

  evidenceToggle.addEventListener("click", () => {
    const isHidden = evidenceBox.classList.contains("hidden");
    evidenceBox.classList.toggle("hidden", !isHidden);
    evidenceToggle.textContent = isHidden
      ? "Hide quotes"
      : `Show quote${item.evidence.length > 1 ? "s" : ""}`;
  });

  evidenceWrap.appendChild(evidenceToggle);
  evidenceWrap.appendChild(evidenceBox);
  parent.appendChild(evidenceWrap);
}

function renderFindings(findingsEl, findings = [], options = {}) {
  if (!findingsEl) return;
  findingsEl.innerHTML = "";

  const {
    emptyMessage = "No clear privacy findings were available.",
    limit = 6,
  } = options;

  const list = sortFindingsForDisplay(getCountedRisks(findings)).slice(0, limit);

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
    const severity = String(item.severity || "").toLowerCase();
    if (severity) {
      card.classList.add(`finding-severity-${severity}`);
    }

    const title = document.createElement("div");
    title.className = "finding-title";
    title.textContent = item.title || "Possible privacy concern";
    const top = document.createElement("div");
    top.className = "finding-card-top";
    top.appendChild(title);

    if (item.severity) {
      const badge = document.createElement("span");
      badge.className = "finding-impact-badge";
      setSeverityBadgeIcon(badge, item.severity);
      top.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "finding-meta";

    const metaParts = [];
    if (item.confidence) metaParts.push(formatConfidence(item.confidence));
    if (item.category) {
      metaParts.push(
        String(item.category)
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase())
      );
    }
    meta.textContent = metaParts.join(" • ");

    const summary = document.createElement("div");
    summary.className = "finding-summary";
    summary.textContent = item.summary || "";

    card.appendChild(top);
    if (meta.textContent) card.appendChild(meta);
    if (summary.textContent) card.appendChild(summary);
    appendEvidenceToggle(card, item);

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
    isPolicyLikeSource = false,
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

  if (!isPolicyLikeSource && !allowEstimated) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = "Open the policy page to extract detected data types.";
    dataChecklist.appendChild(note);
    return;
  }

  if (!hasAny) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent = isPolicyLikeSource
      ? "The analyzed policy source did not show clear data-type signals."
      : "No clear privacy-related data categories were estimated from this page.";
    dataChecklist.appendChild(note);
    return;
  }

  if (!isPolicyLikeSource) {
    const note = document.createElement("div");
    note.className = "checklist-note";
    note.textContent =
      "Estimated from current page content. Open or analyze a privacy policy source for stronger policy-based results.";
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
      impact.textContent = getCategoryMessage(key, isPolicyLikeSource);
      text.appendChild(impact);
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
    emptyMessage = "No immediate high-impact policy findings.",
    limit = Infinity,
  } = options;

  const list = getImmediateFindings(findings, limit);

  if (!list.length) {
    const note = document.createElement("div");
    note.className = "quick-reason-note";
    note.textContent = emptyMessage;
    listEl.appendChild(note);
    return;
  }

  for (const item of list) {
    const severity = String(item.severity || "").toLowerCase();
    const card = document.createElement("div");
    card.className = `quick-reason quick-reason-${severity || "low"}`;

    const top = document.createElement("div");
    top.className = "quick-reason-top";

    const title = document.createElement("div");
    title.className = "quick-reason-title";
    title.textContent = getShortText(item);
    top.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "quick-reason-badge";
    setSeverityBadgeIcon(badge, item.severity);
    top.appendChild(badge);

    card.appendChild(top);

    const metaParts = [];
    if (item.confidence) metaParts.push(formatConfidence(item.confidence));
    if (item.category) {
      metaParts.push(
        String(item.category)
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase())
      );
    }

    if (metaParts.length) {
      const meta = document.createElement("div");
      meta.className = "quick-reason-meta";
      meta.textContent = metaParts.join(" • ");
      card.appendChild(meta);
    }

    if (item.summary) {
      const summary = document.createElement("div");
      summary.className = "quick-reason-summary";
      summary.textContent = item.summary;
      card.appendChild(summary);
    }

    appendEvidenceToggle(card, item);
    listEl.appendChild(card);
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

function getPolicyDisplayUrl(result) {
  if (!result) return "";

  const sourceType = String(result.policySourceType || "").toLowerCase();

  if (sourceType === "page-fallback" && result.bestPolicyLink) {
    return result.bestPolicyLink;
  }

  return result.analyzedPolicyUrl || result.bestPolicyLink || "";
}

function renderHeuristic(els, r) {
  const {
    resultCard,
    policyFinderStatus,
    heuristicScore,
    heuristicLink,
    heuristicOpen,
    heuristicReasons,
    dataChecklist,
    heuristicFindings,
    heuristicSummary,
    heuristicSummaryWrap,
  } = els;

  if (!r) {
    applyPopupRiskTheme("blue");

    if (resultCard) {
      resultCard.style.display = "";
      resultCard.hidden = false;
    }

    if (policyFinderStatus) {
      policyFinderStatus.textContent = "No policy analysis available yet.";
    }

    if (heuristicScore) {
      heuristicScore.className = "status-text status-blue";
      heuristicScore.textContent = "Refresh the page to analyze the site policy.";
    }

    if (heuristicSummary) {
      heuristicSummary.textContent = "No policy analysis yet.";
    }

    if (heuristicSummaryWrap) {
      heuristicSummaryWrap.style.display = "";
    }

    setPolicyLinkUI(heuristicLink, heuristicOpen, "");
    renderReasonList(heuristicReasons, [], {
      emptyMessage: "No meaningful risks are available yet.",
      limit: 3,
    });
    renderChecklist(dataChecklist, {}, {}, { isPolicyLikeSource: false });
    renderFindings(heuristicFindings, [], {
      emptyMessage: "No meaningful privacy risks are available yet.",
    });
    return;
  }

  const findings = getFindingsArray(r.findings);
  const countedRisks = getCountedRisks(findings);
  const riskStats = getRiskStats(findings);
  const sourceState = getSourceState(r);
  applyPopupRiskTheme(getPopupRiskTheme(r));

  if (resultCard) {
    resultCard.style.display = "";
    resultCard.hidden = false;
  }

  if (policyFinderStatus) {
    if (sourceState.type === "current-policy-page") {
      policyFinderStatus.textContent = "You are viewing the privacy policy page.";
    } else if (sourceState.type === "linked-policy") {
      policyFinderStatus.textContent =
        "These results come from the site's linked privacy policy, not this current page.";
    } else if (sourceState.type === "known-domain") {
      policyFinderStatus.textContent =
        "These results come from a trusted policy registry for this domain, so the policy stays available across site pages.";
    } else {
      policyFinderStatus.textContent =
        "No trusted privacy policy source was found. Results below are based on current page content only.";
    }
  }

  if (heuristicSummary) {
    if (riskStats.total > 0) {
      heuristicSummary.textContent =
        `${riskStats.total} privacy risk${riskStats.total === 1 ? "" : "s"} detected.`;
    } else {
      heuristicSummary.textContent = "No major privacy risks detected.";
    }
  }

  if (heuristicScore) {
      heuristicScore.className = "status-text";

    if (riskStats.high > 0) {
      heuristicScore.classList.add("status-red");
      heuristicScore.textContent =
        `${riskStats.high} high-impact policy risk${riskStats.high === 1 ? "" : "s"} found` +
        (riskStats.total > riskStats.high ? ` (${riskStats.total} total)` : "");
    } else if (riskStats.medium > 0) {
      heuristicScore.classList.add("status-yellow");
      heuristicScore.textContent =
        `${riskStats.medium} medium-impact policy risk${riskStats.medium === 1 ? "" : "s"} found`;
    } else {
      heuristicScore.classList.add("status-green");
      heuristicScore.textContent = "No major privacy risks detected";
    }
  }

  if (heuristicSummaryWrap) {
    heuristicSummaryWrap.style.display = riskStats.total > 0 ? "none" : "";
  }

  renderReasonList(heuristicReasons, countedRisks, {
    emptyMessage: "No high-impact policy highlights were found.",
  });

  renderChecklist(
    dataChecklist,
    r.dataCollected || {},
    r.dataEvidence || {},
    {
      isPolicyLikeSource: sourceState.isPolicyLikeSource,
      allowEstimated: true,
    }
  );

  const remainingPolicyRisks = countedRisks.filter(
    (item) => String(item?.severity || "").toLowerCase() !== "high"
  );

  renderFindings(heuristicFindings, remainingPolicyRisks, {
    emptyMessage: "No additional medium-impact policy risks were found.",
    limit: 6,
  });

  setPolicyLinkUI(heuristicLink, heuristicOpen, getPolicyDisplayUrl(r));
}

function renderMismatch(mismatch) {
  const mismatchCard = document.getElementById("mismatch-card");
  const mismatchStatus = document.getElementById("mismatch-status");
  const mismatchSummary = document.getElementById("mismatch-summary");
  const mismatchList = document.getElementById("mismatch-list");

  if (!mismatchCard || !mismatchStatus || !mismatchSummary || !mismatchList) {
    return;
  }

  mismatchList.innerHTML = "";

  if (!mismatch || mismatch.show !== true) {
    mismatchCard.style.display = "none";
    mismatchStatus.textContent = "";
    mismatchSummary.textContent = "";
    return;
  }

  mismatchCard.style.display = "";

  const level = String(mismatch.level || "").toLowerCase();

  mismatchStatus.className = "status-text";
  if (level === "strong_mismatch") {
    mismatchStatus.classList.add("status-red");
    mismatchStatus.textContent = "High-impact undisclosed behavior";
  } else {
    mismatchStatus.classList.add("status-yellow");
    mismatchStatus.textContent = "Possible undisclosed behavior";
  }

  mismatchSummary.textContent =
    mismatch.summary ||
    "Some meaningful page behavior was detected without clear policy disclosure.";

  const topItems = Array.isArray(mismatch.mismatches)
    ? mismatch.mismatches.slice(0, 4)
    : [];

  for (const item of topItems) {
    const li = document.createElement("li");
    li.textContent =
      item.message || "Possible policy-behavior mismatch detected.";
    mismatchList.appendChild(li);
  }
}

function getTrackerSeverityClass(confidence = "") {
  const c = String(confidence || "").toLowerCase();
  if (c === "high") return "tracker-high";
  if (c === "medium") return "tracker-medium";
  return "tracker-low";
}

function appendTrackerItem(parent, {
  title,
  summary = "",
  count = "",
  chips = [],
  severity = "low",
} = {}) {
  if (!parent) return;

  const item = document.createElement("div");
  item.className = `tracker-item ${getTrackerSeverityClass(severity)}`;

  const row = document.createElement("div");
  row.className = "tracker-item-title";

  const titleEl = document.createElement("span");
  titleEl.textContent = title || "Tracker signal";
  row.appendChild(titleEl);

  if (count) {
    const metaEl = document.createElement("span");
    metaEl.className = "tracker-meta";
    metaEl.textContent = count;
    row.appendChild(metaEl);
  }

  item.appendChild(row);

  if (summary) {
    const detailEl = document.createElement("div");
    detailEl.className = "tracker-item-detail";
    detailEl.textContent = summary;
    item.appendChild(detailEl);
  }

  const visibleChips = chips.filter(Boolean).slice(0, 6);
  if (visibleChips.length) {
    const chipRow = document.createElement("div");
    chipRow.className = "tracker-chip-row";

    for (const chip of visibleChips) {
      const chipEl = document.createElement("span");
      chipEl.className = "tracker-chip";
      chipEl.textContent = chip;
      chipRow.appendChild(chipEl);
    }

    item.appendChild(chipRow);
  }

  parent.appendChild(item);
}

function renderTrackerSignals(trackerSignals = null) {
  const details = document.getElementById("tracker-details");
  const summary = document.getElementById("tracker-summary");
  const list = document.getElementById("tracker-list");

  if (!details || !summary || !list) return;

  list.innerHTML = "";

  const groups = trackerSignals?.groups || {};
  const counts = trackerSignals?.summary?.counts || {};
  const trackerHits = Array.isArray(groups.knownTrackers)
    ? groups.knownTrackers
    : Array.isArray(trackerSignals?.trackerHits)
      ? trackerSignals.trackerHits
      : [];
  const storageSignals = Array.isArray(groups.storage)
    ? groups.storage
    : Array.isArray(trackerSignals?.storageSignals)
      ? trackerSignals.storageSignals
      : [];
  const formSignals = Array.isArray(groups.forms)
    ? groups.forms
    : Array.isArray(trackerSignals?.formSignals)
      ? trackerSignals.formSignals
      : [];
  const fingerprintingHints = Array.isArray(groups.fingerprinting)
    ? groups.fingerprinting
    : Array.isArray(trackerSignals?.fingerprintingHints)
      ? trackerSignals.fingerprintingHints
      : [];
  const thirdPartyResources = Array.isArray(groups.thirdParty)
    ? groups.thirdParty
    : Array.isArray(trackerSignals?.thirdPartyResources)
      ? trackerSignals.thirdPartyResources
      : [];
  const vendorNames = Array.isArray(trackerSignals?.summary?.topVendors)
    ? trackerSignals.summary.topVendors
    : [...new Set(trackerHits.map((hit) => hit.vendor).filter(Boolean))];
  const vendorCount = counts.vendors ?? vendorNames.length;

  const totalSignals =
    (counts.knownTrackers ?? trackerHits.length) +
    (counts.storage ?? storageSignals.length) +
    (counts.forms ?? formSignals.length) +
    (counts.fingerprinting ?? fingerprintingHints.length);

  if (totalSignals === 0 && thirdPartyResources.length < 6) {
    details.style.display = "none";
    summary.className = `summary-box tracker-summary ${getTrackerSeverityClass("low")}`;
    summary.textContent = "No tracker signals detected.";
    return;
  }

  details.style.display = "";

  const confidence = trackerSignals?.summary?.confidence || trackerSignals?.confidence || "low";
  summary.className = `summary-box tracker-summary ${getTrackerSeverityClass(confidence)}`;
  summary.textContent = vendorCount
    ? `${formatConfidence(confidence)} tracker evidence from ${vendorCount} known service${vendorCount === 1 ? "" : "s"}.`
    : `${formatConfidence(confidence)} tracker evidence detected.`;

  if (vendorNames.length) {
    const sources = [
      ...new Set(
        trackerHits
          .map((hit) => hit.sourceType || hit.requestType)
          .filter(Boolean)
      ),
    ];
    const purposes = [
      ...new Set(trackerHits.map((hit) => hit.purpose).filter(Boolean)),
    ];

    appendTrackerItem(list, {
      title: "Known tracker services",
      summary: purposes.length
        ? `Used for ${purposes.slice(0, 3).join(", ")}.`
        : "Known analytics or advertising services were detected.",
      count: `${trackerHits.length}`,
      chips: [...vendorNames.slice(0, 4), ...sources.slice(0, 2)],
      severity: confidence,
    });
  }

  if (fingerprintingHints.length) {
    appendTrackerItem(list, {
      title: "Fingerprinting hints",
      summary: "Script patterns may identify the browser or device.",
      count: `${fingerprintingHints.length}`,
      chips: fingerprintingHints.slice(0, 4).map((hint) => hint.label || hint.keyword),
      severity: "high",
    });
  }

  if (storageSignals.length) {
    const labels = [...new Set(storageSignals.map((signal) => signal.label).filter(Boolean))];
    const highestStorageSeverity = storageSignals.some((signal) => signal.severity === "high")
      ? "high"
      : "medium";

    appendTrackerItem(list, {
      title: "Browser storage signals",
      summary: "Tracking-style identifiers were found in browser storage.",
      count: `${storageSignals.length}`,
      chips: labels.slice(0, 5),
      severity: highestStorageSeverity,
    });
  }

  if (formSignals.length) {
    const labels = [...new Set(formSignals.map((signal) => signal.label).filter(Boolean))];
    const highestFormSeverity = formSignals.some((signal) => signal.severity === "high")
      ? "high"
      : "medium";

    appendTrackerItem(list, {
      title: "Data-entry fields",
      summary: "The page asks for information that can identify a visitor.",
      count: `${formSignals.length}`,
      chips: labels.slice(0, 5),
      severity: highestFormSeverity,
    });
  }

  if (!trackerHits.length && thirdPartyResources.length >= 6) {
    const hosts = [...new Set(thirdPartyResources.map((item) => item.hostname).filter(Boolean))];
    appendTrackerItem(list, {
      title: "Third-party resources",
      summary: "Several outside domains loaded resources on this page.",
      count: `${thirdPartyResources.length}`,
      chips: hosts.slice(0, 5),
      severity: "medium",
    });
  }
}

async function loadHeuristicIntoPopup(els) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    renderHeuristic(els, null);
    renderMismatch(null);
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getHeuristic", tabId: tab.id },
      (res) => {
        const r = res?.result || null;
        renderHeuristic(els, r);
        renderMismatch(r?.mismatch || null);
        renderTrackerSignals(r?.trackerSignals || null);
        resolve(r);
      }
    );
  });
}

// ---------- Manual protection UI helpers ----------
const DEFAULT_PROTECTION_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: false,
  disableTrackingLinks: false,
};

function getProtectionEls() {
  return {
    siteLabel: document.getElementById("protect-site-label"),
    blockTrackers: document.getElementById("protect-block-trackers"),
    blockThirdPartyScripts: document.getElementById("protect-block-third-party-scripts"),
    blockIframes: document.getElementById("protect-block-iframes"),
    removeAds: document.getElementById("protect-remove-ads"),
    disableTrackingLinks: document.getElementById("protect-disable-tracking-links"),
    saveBtn: document.getElementById("protect-save"),
    resetBtn: document.getElementById("protect-reset"),
    status: document.getElementById("protect-status"),
  };
}

function setProtectionUi(els, rules = {}) {
  const merged = { ...DEFAULT_PROTECTION_RULES, ...rules };

  els.blockTrackers.checked = !!merged.blockTrackers;
  els.blockThirdPartyScripts.checked = !!merged.blockThirdPartyScripts;
  els.blockIframes.checked = !!merged.blockIframes;
  els.removeAds.checked = !!merged.removeAds;
  els.disableTrackingLinks.checked = !!merged.disableTrackingLinks;
}

function readProtectionUi(els) {
  return {
    blockTrackers: !!els.blockTrackers.checked,
    blockThirdPartyScripts: !!els.blockThirdPartyScripts.checked,
    blockIframes: !!els.blockIframes.checked,
    removeAds: !!els.removeAds.checked,
    disableTrackingLinks: !!els.disableTrackingLinks.checked,
  };
}

async function loadProtectionRulesIntoPopup(els, tab) {
  const hostname = getHostnameFromUrl(tab?.url || "");

  if (!hostname) {
    els.siteLabel.textContent = "Unsupported page";
    els.status.textContent = "Could not load site protection settings.";
    els.saveBtn.disabled = true;
    els.resetBtn.disabled = true;
    setProtectionUi(els, DEFAULT_PROTECTION_RULES);
    return { hostname: "", rules: { ...DEFAULT_PROTECTION_RULES } };
  }

  els.siteLabel.textContent = hostname;

  const res = await chrome.runtime.sendMessage({
    type: "GET_RULES_FOR_ACTIVE_TAB",
  });

  const rules = res?.ok && res?.rules
    ? { ...DEFAULT_PROTECTION_RULES, ...res.rules }
    : { ...DEFAULT_PROTECTION_RULES };

  setProtectionUi(els, rules);
  els.status.textContent = "Manual controls are ready for this site.";
  els.saveBtn.disabled = false;
  els.resetBtn.disabled = false;

  return { hostname, rules };
}

// ---------- Popup view switch ----------
function activateView(viewName) {
  const scanTab = document.getElementById("tab-scan");
  const protectTab = document.getElementById("tab-protect");
  const scanView = document.getElementById("view-scan");
  const protectView = document.getElementById("view-protect");

  scanTab.classList.remove("active");
  protectTab.classList.remove("active");
  scanView.classList.remove("active");
  protectView.classList.remove("active");

  if (viewName === "protect") {
    protectTab.classList.add("active");
    protectView.classList.add("active");
  } else {
    scanTab.classList.add("active");
    scanView.classList.add("active");
  }
}

async function init() {
  const toastContainer = document.getElementById("toast-container");
  const autoBtn = document.getElementById("auto-analyze");
  const heuristicRefreshBtn = document.getElementById("heuristic-refresh");

  const heuristicEls = {
    resultCard: document.getElementById("policy-result-card"),
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
    heuristicSummaryWrap: document.getElementById("heuristic-summary-wrap"),
  };

  const protectionEls = getProtectionEls();
  const activeTab = await getActiveTab();

  let latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);
  let protectionState = await loadProtectionRulesIntoPopup(protectionEls, activeTab);

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

  if (protectionEls.saveBtn) {
    protectionEls.saveBtn.addEventListener("click", async () => {
      const rules = readProtectionUi(protectionEls);

      const res = await chrome.runtime.sendMessage({
        type: "SET_RULES_FOR_HOST",
        hostname: protectionState.hostname,
        rules,
      });

      if (res?.ok) {
        protectionEls.status.className = "status-text status-green";
        protectionEls.status.textContent =
          "Protection settings saved for this site.";
        showToast(toastContainer, "Protection saved", "success");
      } else {
        protectionEls.status.className = "status-text status-red";
        protectionEls.status.textContent =
          "Failed to save protection settings.";
        showToast(toastContainer, "Failed to save protection", "error");
      }
    });
  }

  if (protectionEls.resetBtn) {
    protectionEls.resetBtn.addEventListener("click", async () => {
      setProtectionUi(protectionEls, DEFAULT_PROTECTION_RULES);

      const res = await chrome.runtime.sendMessage({
        type: "SET_RULES_FOR_HOST",
        hostname: protectionState.hostname,
        rules: { ...DEFAULT_PROTECTION_RULES },
      });

      if (res?.ok) {
        protectionEls.status.className = "status-text status-blue";
        protectionEls.status.textContent =
          "Protection settings reset for this site.";
        showToast(toastContainer, "Protection reset", "info");
      } else {
        protectionEls.status.className = "status-text status-red";
        protectionEls.status.textContent =
          "Failed to reset protection settings.";
        showToast(toastContainer, "Failed to reset protection", "error");
      }
    });
  }

  const scanTab = document.getElementById("tab-scan");
  const protectTab = document.getElementById("tab-protect");

  if (scanTab) {
    scanTab.addEventListener("click", () => activateView("scan"));
  }

  if (protectTab) {
    protectTab.addEventListener("click", () => activateView("protect"));
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
  activateView("scan");
}

document.addEventListener("DOMContentLoaded", init);
