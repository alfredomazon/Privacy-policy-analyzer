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
let popupUserSelectedView = false;
const FIRST_RUN_EXPLANATION_DISMISSED_KEY = "firstRunExplanationDismissed";

function getLocalStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => {
      resolve(res?.[key]);
    });
  });
}

function setLocalStorageValues(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

async function initFirstRunExplanation() {
  const panel = document.getElementById("first-run-explanation");
  const dismiss = document.getElementById("first-run-dismiss");
  if (!panel || !dismiss) return;

  const dismissed = await getLocalStorageValue(FIRST_RUN_EXPLANATION_DISMISSED_KEY);
  panel.hidden = dismissed === true;

  dismiss.addEventListener("click", async () => {
    panel.hidden = true;
    await setLocalStorageValues({
      [FIRST_RUN_EXPLANATION_DISMISSED_KEY]: true,
    });
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || null);
    });
  });
}

async function loadProtectionActivityForTab(tabId) {
  if (tabId == null) return null;

  const res = await sendRuntimeMessage({
    type: "GET_PROTECTION_ACTIVITY",
    tabId,
  });

  return res?.ok ? res.activity || null : null;
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

function formatCategoryLabel(category = "") {
  return String(category || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFindingRiskLabel(item = {}) {
  return item.riskLabel || item.riskType || formatCategoryLabel(item.category);
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

function getTrackerSignalDisplayStats(trackerSignals = null, protectionActivity = null) {
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
  const meaningfulThirdPartyCount =
    counts.meaningfulThirdParty ??
    trackerSignals?.summary?.thirdPartyProfile?.meaningful ??
    thirdPartyResources.filter((resource) => resource?.likelyBenign !== true).length;
  const protectionCount = getProtectionBlockedCount(
    getProtectionActivityItems(protectionActivity)
  );

  const totalSignals =
    (counts.knownTrackers ?? trackerHits.length) +
    (counts.storage ?? storageSignals.length) +
    (counts.forms ?? formSignals.length) +
    (counts.fingerprinting ?? fingerprintingHints.length);

  return {
    totalSignals,
    meaningfulThirdPartyCount,
    protectionCount,
    visible:
      totalSignals > 0 || meaningfulThirdPartyCount >= 6 || protectionCount > 0,
  };
}

function shouldPrioritizeTrackerSection(result = null, protectionActivity = null) {
  if (!result) return false;

  const theme = getPopupRiskTheme(result);
  if (theme === "blue") return false;

  const policyStats = getRiskStats(result.findings || []);
  if (policyStats.high > 0) return false;

  const trackerStats = getTrackerSignalDisplayStats(
    result.trackerSignals || null,
    protectionActivity
  );
  if (!trackerStats.visible) return false;

  const levelHint = String(result?.toolbarState?.levelHint || "").toLowerCase();
  const trackerRiskScore = getTrackerRiskScore(result);

  return (
    levelHint === "behavior-risk" ||
    trackerRiskScore >= 24 ||
    policyStats.total === 0
  );
}

function getToolbarScore(result = {}) {
  const value = result?.toolbarState?.score;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getTrackerRiskScore(result = {}) {
  const value =
    result?.trackerSignals?.summary?.riskScore ??
    result?.trackerSignals?.riskScore;

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getTopCountedRisk(result = {}) {
  return (
    sortFindingsForDisplay(
      getCountedRisks(getFindingsArray(result?.findings || []))
    )[0] || null
  );
}

function getEyeModeLabel(theme = "blue") {
  if (theme === "red") return "Needs attention";
  if (theme === "yellow") return "Worth reviewing";
  return "Looks normal";
}

function buildEyeReason(result = null, protectionActivity = null) {
  if (!result) return "";

  const theme = getPopupRiskTheme(result);
  const modeLabel = getEyeModeLabel(theme);
  const score = Math.round(getToolbarScore(result));
  const scoreText = score > 0 ? ` (${score}/100)` : "";
  const findings = getFindingsArray(result.findings || []);
  const riskStats = getRiskStats(findings);
  const topRisk = getTopCountedRisk(result);
  const trackerStats = getTrackerSignalDisplayStats(
    result.trackerSignals || null,
    protectionActivity
  );
  const trackerRiskScore = getTrackerRiskScore(result);
  const protectionCount = trackerStats.protectionCount || 0;
  const levelHint = String(result?.toolbarState?.levelHint || "").toLowerCase();

  if (theme === "blue") {
    if (protectionCount > 0) {
      return `${modeLabel}${scoreText}: safety protections blocked page behavior, and no major policy risk is active.`;
    }
    return `${modeLabel}${scoreText}: no major policy or tracker signal is driving the result.`;
  }

  if (
    levelHint === "behavior-risk" ||
    (riskStats.high === 0 && trackerStats.visible && trackerRiskScore >= 24)
  ) {
    const protectedText = protectionCount
      ? ` Protect blocked ${protectionCount} item${protectionCount === 1 ? "" : "s"}, so this reflects what remains active.`
      : "";
    return `${modeLabel}${scoreText}: page activity is the strongest signal, not a high-impact policy finding.${protectedText}`;
  }

  if (riskStats.high > 0 && topRisk) {
    return `${modeLabel}${scoreText}: the policy highlight “${topRisk.title}” is driving the result.`;
  }

  if (riskStats.medium > 0) {
    return `${modeLabel}${scoreText}: policy concerns are present, but no high-impact highlight is active.`;
  }

  if (trackerStats.visible) {
    return `${modeLabel}${scoreText}: page activity is driving the result.`;
  }

  return `${modeLabel}${scoreText}: the current page has enough privacy signals to raise the result.`;
}

function renderEyeReason(result = null, protectionActivity = null) {
  const el = document.getElementById("eye-reason");
  if (!el) return;

  const reason = buildEyeReason(result, protectionActivity);
  if (!reason) {
    el.hidden = true;
    el.textContent = "";
    return;
  }

  const theme = getPopupRiskTheme(result);
  el.hidden = false;
  el.className = `eye-reason eye-reason-${theme}`;
  el.textContent = reason;
}

function syncTrackerShortcut(result = null, protectionActivity = null) {
  const note = document.getElementById("tracker-driver-note");
  if (!note) return false;

  const prioritizeTrackers = shouldPrioritizeTrackerSection(
    result,
    protectionActivity
  );

  note.hidden = !prioritizeTrackers;
  note.style.display = prioritizeTrackers ? "" : "none";
  return prioritizeTrackers;
}

function syncTrackerShortcutAndAutoView(result = null, protectionActivity = null) {
  const prioritizeTrackers = syncTrackerShortcut(result, protectionActivity);

  if (!popupUserSelectedView) {
    activateView(prioritizeTrackers ? "trackers" : "scan");
  }

  return prioritizeTrackers;
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

function setSeverityBadgeLabel(badge, severity = "") {
  if (!badge) return;

  const label = formatSeverity(severity) || "Impact";
  badge.textContent = label;
  badge.title = label;
  badge.setAttribute("aria-label", label);
}

const EVIDENCE_KEYWORDS_BY_CATEGORY = {
  tracking: [
    "targeted ads",
    "public sources",
    "public databases",
    "social media",
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
  external_data: [
    "data brokers",
    "public sources",
    "publicly available",
    "public posts",
    "social media",
    "public databases",
    "outside sources",
    "third parties",
    "partners",
    "append",
    "enrich",
    "combine",
  ],
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

function getEvidenceTextValue(text = "") {
  if (text && typeof text === "object") {
    return text.text || text.quote || text.evidence || "";
  }

  return text;
}

function normalizeEvidenceText(text = "") {
  return String(getEvidenceTextValue(text) || "").replace(/\s+/g, " ").trim();
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

function createEvidenceSnippet(text = "", item = {}) {
  const clean = normalizeEvidenceText(text);
  return clean;
}

function trimTextFragmentStart(text = "") {
  const clean = normalizeEvidenceText(text);
  const firstSpace = clean.indexOf(" ");
  return firstSpace > 0 ? clean.slice(firstSpace + 1).trim() : clean;
}

function trimTextFragmentEnd(text = "") {
  const clean = normalizeEvidenceText(text);
  const lastSpace = clean.lastIndexOf(" ");
  return lastSpace > 0 ? clean.slice(0, lastSpace).trim() : clean;
}

function getTextFragmentDirective(text = "") {
  const clean = normalizeEvidenceText(text);
  if (!clean) return "";

  if (clean.length <= 260) {
    return encodeURIComponent(clean);
  }

  const start = trimTextFragmentEnd(clean.slice(0, 150));
  const end = trimTextFragmentStart(clean.slice(-120));

  if (!start || !end || start === end) {
    return encodeURIComponent(start || clean.slice(0, 260));
  }

  return `${encodeURIComponent(start)},${encodeURIComponent(end)}`;
}

function buildPolicyTextFragmentUrl(baseUrl = "", evidenceText = "") {
  const directive = getTextFragmentDirective(evidenceText);
  if (!baseUrl || !directive) return "";

  try {
    const url = new URL(baseUrl);
    url.hash = "";
    return `${url.toString()}#:~:text=${directive}`;
  } catch {
    return "";
  }
}

function openPolicyEvidence(baseUrl = "", evidenceText = "") {
  const targetUrl = buildPolicyTextFragmentUrl(baseUrl, evidenceText);
  const quote = normalizeEvidenceText(evidenceText);
  if (!targetUrl || !quote) return;

  chrome.runtime.sendMessage(
    {
      type: "OPEN_POLICY_EVIDENCE",
      url: targetUrl,
      quote,
    },
    (response) => {
      if (!response?.ok) {
        chrome.tabs.create({ url: targetUrl });
      }
    }
  );
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

function getEvidenceDisplayLabel(item = {}, evidenceText = "", index = 0) {
  if (Array.isArray(item.evidenceLabels) && item.evidenceLabels[index]) {
    return item.evidenceLabels[index];
  }

  const signal = getEvidenceSignal(evidenceText, item);
  if (signal) return signal;

  return formatEvidenceSection(item);
}

function appendEvidenceCard(parent, evidenceText, item, index = 0) {
  const signal = getEvidenceSignal(evidenceText, item);
  const snippet = createEvidenceSnippet(evidenceText, item);
  const policyUrl = item?.policyUrl || "";
  const targetUrl = buildPolicyTextFragmentUrl(policyUrl, snippet);

  const card = document.createElement("div");
  card.className = "evidence-card";

  const meta = document.createElement("div");
  meta.className = "evidence-card-meta";

  const section = document.createElement("span");
  section.className = "evidence-chip";
  section.textContent = getEvidenceDisplayLabel(item, evidenceText, index);
  meta.appendChild(section);

  if (signal && signal.toLowerCase() !== section.textContent.toLowerCase()) {
    const signalEl = document.createElement("span");
    signalEl.className = "evidence-signal";
    signalEl.textContent = signal;
    meta.appendChild(signalEl);
  }

  const quote = document.createElement("div");
  quote.className = "finding-evidence-line";
  appendHighlightedEvidence(quote, snippet, signal);

  if (targetUrl) {
    quote.classList.add("finding-evidence-link");
    quote.setAttribute("role", "link");
    quote.setAttribute("tabindex", "0");
    quote.title = "Open this passage in the analyzed privacy policy";
    quote.addEventListener("click", () => openPolicyEvidence(policyUrl, snippet));
    quote.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPolicyEvidence(policyUrl, snippet);
    });
  }

  card.appendChild(meta);
  card.appendChild(quote);
  parent.appendChild(card);
}

function appendEvidenceToggle(parent, item) {
  if (!parent || !Array.isArray(item?.evidence) || !item.evidence.length) return;

  const getToggleLabel = (isOpen) => {
    const suffix = item.evidence.length > 1 ? "s" : "";
    return `${isOpen ? "Hide" : "View"} policy sentence${suffix}`;
  };

  const evidenceWrap = document.createElement("div");
  evidenceWrap.className = "finding-evidence-wrap";

  const evidenceToggle = document.createElement("button");
  evidenceToggle.type = "button";
  evidenceToggle.className = "finding-evidence-toggle";
  evidenceToggle.textContent = getToggleLabel(false);
  evidenceToggle.setAttribute("aria-expanded", "false");

  const evidenceBox = document.createElement("div");
  evidenceBox.className = "finding-evidence hidden";

  item.evidence.slice(0, 2).forEach((ev, index) => {
    appendEvidenceCard(evidenceBox, ev, item, index);
  });

  evidenceToggle.addEventListener("click", () => {
    const isHidden = evidenceBox.classList.contains("hidden");
    evidenceBox.classList.toggle("hidden", !isHidden);
    evidenceToggle.textContent = getToggleLabel(isHidden);
    evidenceToggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
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
      setSeverityBadgeLabel(badge, item.severity);
      top.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "finding-meta";

    const metaParts = [];
    if (item.confidence) metaParts.push(formatConfidence(item.confidence));
    const riskLabel = getFindingRiskLabel(item);
    if (riskLabel) metaParts.push(riskLabel);
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
    setSeverityBadgeLabel(badge, item.severity);
    top.appendChild(badge);

    card.appendChild(top);

    const metaParts = [];
    if (item.confidence) metaParts.push(formatConfidence(item.confidence));
    const riskLabel = getFindingRiskLabel(item);
    if (riskLabel) metaParts.push(riskLabel);

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
  const linkRow = document.getElementById("policy-source-link-row");
  const toggle = document.getElementById("policy-source-toggle");
  const hasLink = !!link;

  if (linkRow) {
    linkRow.style.display = "none";
  }

  if (toggle) {
    toggle.hidden = !hasLink;
    toggle.textContent = "Show policy link";
    toggle.setAttribute("aria-expanded", "false");
    toggle.onclick = () => {
      if (!linkRow) return;

      const shouldShow = linkRow.style.display === "none";
      linkRow.style.display = shouldShow ? "" : "none";
      toggle.textContent = shouldShow ? "Hide policy link" : "Show policy link";
      toggle.setAttribute("aria-expanded", shouldShow ? "true" : "false");
    };
  }

  if (heuristicLink) {
    heuristicLink.textContent = link || "No policy link found";
    heuristicLink.title = link || "";
  }

  if (heuristicOpen) {
    heuristicOpen.disabled = !hasLink;
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
    renderEyeReason(null);

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

  const policyDisplayUrl = getPolicyDisplayUrl(r);
  const findings = getFindingsArray(r.findings).map((finding) => ({
    ...finding,
    policyUrl: policyDisplayUrl,
  }));
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

  setPolicyLinkUI(heuristicLink, heuristicOpen, policyDisplayUrl);
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

function formatTrackerImpact(level = "") {
  const c = String(level || "").toLowerCase();
  if (c === "high") return "High-impact";
  if (c === "medium") return "Medium-impact";
  return "Low-impact";
}

function trackerSeverityRank(value = "") {
  const severity = String(value || "").toLowerCase();
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function highestTrackerSeverity(items = [], fallback = "low") {
  return items.reduce((highest, item) => {
    const severity = item?.severity || item?.riskLevel || item?.confidence || "low";
    return trackerSeverityRank(severity) > trackerSeverityRank(highest)
      ? severity
      : highest;
  }, fallback);
}

const TRACKER_WHY_COPY = {
  routine_commerce:
    "Common on shopping pages for analytics or ad conversion; low impact unless paired with stronger tracking.",
  analytics_measurement:
    "Measures visits and page activity so the site can tune features; usually lower risk than ad profiling.",
  cross_site_ads:
    "Ad networks can connect this page visit to profiles used across other websites.",
  session_replay:
    "Can record clicks, scrolling, typing patterns, and other page interactions.",
  known_tracker:
    "Sends page activity to an outside analytics or advertising service.",
  routine_storage:
    "Keeps session or ad-attribution IDs; not severe by itself, but useful for repeat recognition.",
  persistent_ad_id:
    "Stores ad identifiers that can recognize this browser across visits.",
  persistent_browser_id:
    "Stores identifiers that can recognize repeat visits from the same browser.",
  fingerprinting_storage:
    "Stores fingerprint-style IDs that may still identify a browser when cookies are limited.",
  browser_storage:
    "Browser storage can keep identifiers after the tab closes.",
  routine_form:
    "Expected for checkout or account pages; it matters more when paired with trackers.",
  identifying_form:
    "Identity fields can tie browsing behavior to a specific person.",
  financial_form:
    "Payment fields are sensitive and should stay limited to checkout flows.",
  sensitive_form:
    "Sensitive fields can reveal highly personal information.",
  location_form:
    "Location fields can expose where someone lives or is trying to go.",
  data_entry:
    "Data-entry fields can turn anonymous browsing into identifiable activity.",
  fingerprinting:
    "Fingerprinting can recognize a browser without relying on normal cookies.",
  many_third_parties:
    "Many outside domains make it harder to know which companies receive page activity.",
  unknown_third_party:
    "Unknown third-party code can receive page activity outside the main site.",
  third_party_resource:
    "Outside resources can expose page activity to another company.",
};

function trackerWhyText(reason = "") {
  const copy = TRACKER_WHY_COPY[String(reason || "")];
  return copy ? `Why it matters: ${copy}` : "";
}

function firstImpactReason(items = [], fallback = "") {
  const high = items.find((item) => trackerSeverityRank(item?.severity) >= 3);
  const medium = items.find((item) => trackerSeverityRank(item?.severity) >= 2);
  const any = high || medium || items[0];
  return any?.impactReason || fallback;
}

function getProtectionActivityItems(activity = null) {
  if (activity?.active !== true) return [];
  return Array.isArray(activity?.items) ? activity.items : [];
}

function getProtectionBlockedCount(items = []) {
  return items.reduce((total, item) => total + Number(item?.count || 1), 0);
}

function pluralizeProtectionLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeProtectionActivity(items = []) {
  const counts = items.reduce((acc, item) => {
    const count = Number(item?.count || 1);
    const kind = String(item?.kind || "").toLowerCase();

    if (kind === "notification-trap") {
      acc.notificationPrompts += count;
    } else if (kind === "unwanted-install") {
      acc.unwantedInstalls += count;
    } else if (kind === "popup-scam") {
      acc.scamPopups += count;
    } else if (kind === "tracking-link") {
      acc.trackingLinks += count;
    } else if (kind === "ad-element") {
      acc.ads += count;
    } else if (
      kind === "known-tracker" ||
      kind === "ad-resource" ||
      kind === "resource"
    ) {
      acc.trackerRequests += count;
    } else if (kind === "third-party-script") {
      acc.thirdPartyScripts += count;
    } else if (kind === "third-party-iframe") {
      acc.thirdPartyFrames += count;
    } else {
      acc.pageItems += count;
    }

    return acc;
  }, {
    trackerRequests: 0,
    notificationPrompts: 0,
    unwantedInstalls: 0,
    scamPopups: 0,
    trackingLinks: 0,
    ads: 0,
    thirdPartyScripts: 0,
    thirdPartyFrames: 0,
    pageItems: 0,
  });

  const parts = [];

  if (counts.trackerRequests) {
    parts.push(
      pluralizeProtectionLabel(
        counts.trackerRequests,
        "tracker/ad request"
      )
    );
  }

  if (counts.notificationPrompts) {
    parts.push(
      pluralizeProtectionLabel(
        counts.notificationPrompts,
        "suspicious notification prompt"
      )
    );
  }

  if (counts.unwantedInstalls) {
    parts.push(
      pluralizeProtectionLabel(
        counts.unwantedInstalls,
        "unwanted install prompt"
      )
    );
  }

  if (counts.scamPopups) {
    parts.push(pluralizeProtectionLabel(counts.scamPopups, "fake popup"));
  }

  if (counts.trackingLinks) {
    parts.push(pluralizeProtectionLabel(counts.trackingLinks, "tracking link"));
  }

  if (counts.ads) {
    parts.push(pluralizeProtectionLabel(counts.ads, "ad element"));
  }

  if (counts.thirdPartyScripts) {
    parts.push(
      pluralizeProtectionLabel(
        counts.thirdPartyScripts,
        "third-party script"
      )
    );
  }

  if (counts.thirdPartyFrames) {
    parts.push(
      pluralizeProtectionLabel(
        counts.thirdPartyFrames,
        "third-party frame"
      )
    );
  }

  if (counts.pageItems) {
    parts.push(pluralizeProtectionLabel(counts.pageItems, "page item"));
  }

  return parts.length ? `Protected from: ${parts.join(", ")}.` : "";
}

function appendProtectionActivitySummary(parent, items = []) {
  const text = summarizeProtectionActivity(items);
  if (!parent || !text) return;

  const line = document.createElement("div");
  line.className = "tracker-protection-summary";
  line.textContent = text;
  parent.appendChild(line);

  const context = document.createElement("div");
  context.className = "tracker-protection-context";
  const hasNotificationTrap = items.some((item) =>
    ["notification-trap", "unwanted-install"].includes(
      String(item?.kind || "").toLowerCase()
    )
  );
  context.textContent = hasNotificationTrap
    ? "Helps stop fake Allow prompts, forced installers, and scam-style browser warnings."
    : "Blocked tracker behavior can lower the live score.";
  parent.appendChild(context);

  const labels = getProtectionChipLabels(items).slice(0, 5);
  if (!labels.length) return;

  const chipRow = document.createElement("div");
  chipRow.className = "tracker-chip-row tracker-protection-chips";

  for (const label of labels) {
    const chip = document.createElement("span");
    chip.className = "tracker-chip";
    chip.textContent = label;
    chipRow.appendChild(chip);
  }

  parent.appendChild(chipRow);
}

function appendTrackerSummaryMetric(parent, label, value) {
  if (!parent || value == null || value === "") return;

  const metric = document.createElement("div");
  metric.className = "tracker-summary-metric";

  const valueEl = document.createElement("strong");
  valueEl.textContent = String(value);

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  metric.appendChild(valueEl);
  metric.appendChild(labelEl);
  parent.appendChild(metric);
}

function renderTrackerSummaryBox(summary, {
  riskLevel = "low",
  title = "",
  protectionItems = [],
  vendorCount = 0,
  totalSignals = 0,
  meaningfulThirdPartyCount = 0,
} = {}) {
  if (!summary) return;

  const protectionCount = getProtectionBlockedCount(protectionItems);
  summary.className = `summary-box tracker-summary ${getTrackerSeverityClass(riskLevel)}`;
  summary.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tracker-summary-header";

  const text = document.createElement("div");
  text.className = "tracker-summary-heading";

  const name = document.createElement("div");
  name.className = "tracker-summary-name";
  name.textContent = "Page activity status";
  text.appendChild(name);

  const titleEl = document.createElement("div");
  titleEl.className = "tracker-summary-title";
  titleEl.textContent = title || "No tracker activity summary is available yet.";
  text.appendChild(titleEl);

  header.appendChild(text);

  const badge = document.createElement("span");
  badge.className = "tracker-summary-badge";
  badge.textContent = protectionCount
    ? `${protectionCount} blocked`
    : totalSignals
      ? `${totalSignals} seen`
      : "Clear";
  header.appendChild(badge);

  summary.appendChild(header);

  const metrics = document.createElement("div");
  metrics.className = "tracker-summary-metrics";
  appendTrackerSummaryMetric(metrics, "services", vendorCount || 0);
  appendTrackerSummaryMetric(metrics, "signals", totalSignals || 0);
  if (meaningfulThirdPartyCount >= 6) {
    appendTrackerSummaryMetric(metrics, "outside domains", meaningfulThirdPartyCount);
  }
  appendTrackerSummaryMetric(metrics, "blocked", protectionCount || 0);
  summary.appendChild(metrics);

  if (protectionCount > 0) {
    appendProtectionActivitySummary(summary, protectionItems);
    return;
  }

  const context = document.createElement("div");
  context.className = "tracker-protection-context";
  context.textContent =
    "No safety blocks were recorded for this page load.";
  summary.appendChild(context);
}

function normalizeToken(value = "") {
  return String(value || "").trim().toLowerCase();
}

function protectionItemMatchesTrackers(item = {}, trackerItems = [], vendorNames = []) {
  const itemVendor = normalizeToken(item.vendor || item.label);
  const itemTrackerId = normalizeToken(item.trackerId);
  const itemHost = normalizeToken(item.hostname);
  const itemUrl = normalizeToken(item.url);
  const vendors = new Set(vendorNames.map(normalizeToken).filter(Boolean));

  if (itemVendor && vendors.has(itemVendor)) return true;

  return trackerItems.some((tracker) => {
    const trackerVendor = normalizeToken(tracker.vendor || tracker.label);
    const trackerId = normalizeToken(tracker.id || tracker.trackerId);
    const trackerHost = normalizeToken(tracker.hostname);
    const trackerUrl = normalizeToken(tracker.url);

    return (
      (itemTrackerId && trackerId && itemTrackerId === trackerId) ||
      (itemVendor && trackerVendor && itemVendor === trackerVendor) ||
      (itemHost && trackerHost && itemHost === trackerHost) ||
      (itemUrl && trackerUrl && itemUrl === trackerUrl)
    );
  });
}

function getProtectionItemsForTrackers(activity = null, trackerItems = [], vendorNames = []) {
  return getProtectionActivityItems(activity).filter((item) =>
    protectionItemMatchesTrackers(item, trackerItems, vendorNames)
  );
}

function formatProtectionNotice(items = [], fallback = "matching item") {
  const count = getProtectionBlockedCount(items);
  if (!count) return "";

  return `Protect blocked ${count} ${fallback}${count === 1 ? "" : "s"} after the scan.`;
}

function getProtectionChipLabels(items = []) {
  return [
    ...new Set(
      items
        .map((item) => item.vendor || item.label || item.hostname)
        .filter(Boolean)
    ),
  ];
}

function appendTrackerItem(parent, {
  title,
  summary = "",
  why = "",
  protection = "",
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

  if (why) {
    const whyEl = document.createElement("div");
    whyEl.className = "tracker-item-why";
    whyEl.textContent = why;
    item.appendChild(whyEl);
  }

  if (protection) {
    const protectionEl = document.createElement("div");
    protectionEl.className = "tracker-protection-note";
    protectionEl.textContent = protection;
    item.appendChild(protectionEl);
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

function renderTrackerSignals(trackerSignals = null, protectionActivity = null) {
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
  const vendorSummaries = Array.isArray(groups.vendors)
    ? groups.vendors
    : Array.isArray(trackerSignals?.summary?.vendors)
      ? trackerSignals.summary.vendors
      : [];
  const vendorNames = Array.isArray(trackerSignals?.summary?.topVendors)
    ? trackerSignals.summary.topVendors
    : vendorSummaries.length
      ? vendorSummaries.map((item) => item.vendor).filter(Boolean)
      : [...new Set(trackerHits.map((hit) => hit.vendor).filter(Boolean))];
  const vendorCount = counts.vendors ?? vendorNames.length;
  const meaningfulThirdPartyCount =
    counts.meaningfulThirdParty ??
    trackerSignals?.summary?.thirdPartyProfile?.meaningful ??
    thirdPartyResources.filter((resource) => resource?.likelyBenign !== true).length;
  const protectionItems = getProtectionActivityItems(protectionActivity);
  const protectionCount = getProtectionBlockedCount(protectionItems);

  const totalSignals =
    (counts.knownTrackers ?? trackerHits.length) +
    (counts.storage ?? storageSignals.length) +
    (counts.forms ?? formSignals.length) +
    (counts.fingerprinting ?? fingerprintingHints.length);

  if (totalSignals === 0 && meaningfulThirdPartyCount < 6 && protectionCount === 0) {
    details.style.display = "";
    renderTrackerSummaryBox(summary, {
      riskLevel: "low",
      title: "No known third-party tracker services observed in this page load.",
      protectionItems,
      vendorCount,
      totalSignals,
      meaningfulThirdPartyCount,
    });
    return;
  }

  details.style.display = "";

  const confidence = trackerSignals?.summary?.confidence || trackerSignals?.confidence || "low";
  const riskLevel = trackerSignals?.summary?.riskLevel || trackerSignals?.riskLevel || confidence;
  const routineOnly = trackerSignals?.summary?.routineOnly === true;
  const highImpactCount = counts.highImpact ?? 0;
  let summaryTitle = "";
  if (totalSignals === 0 && meaningfulThirdPartyCount < 6 && protectionCount > 0) {
    summaryTitle =
      "No known third-party tracker services were observed in this page load.";
  } else if (routineOnly) {
    summaryTitle = vendorCount
      ? `Routine commerce tracker signals from ${vendorCount} known service${vendorCount === 1 ? "" : "s"}.`
      : "Routine commerce tracker signals detected.";
  } else if (highImpactCount > 0) {
    summaryTitle = vendorCount
      ? `${formatTrackerImpact(riskLevel)} tracker evidence from ${vendorCount} known service${vendorCount === 1 ? "" : "s"}.`
      : `${formatTrackerImpact(riskLevel)} tracker evidence detected.`;
  } else {
    summaryTitle = vendorCount
      ? `${formatTrackerImpact(riskLevel)} tracker evidence from ${vendorCount} known service${vendorCount === 1 ? "" : "s"}.`
      : `${formatTrackerImpact(riskLevel)} tracker evidence detected.`;
  }
  renderTrackerSummaryBox(summary, {
    riskLevel,
    title: summaryTitle,
    protectionItems,
    vendorCount,
    totalSignals,
    meaningfulThirdPartyCount,
  });

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

    const routineVendors =
      vendorSummaries.length > 0 &&
      vendorSummaries.every((vendor) => vendor?.routineCommerce === true);
    const vendorSeverity = highestTrackerSeverity(
      vendorSummaries.length ? vendorSummaries : trackerHits,
      riskLevel
    );
    const vendorReason =
      vendorSummaries.flatMap((vendor) => vendor.impactReasons || [])[0] ||
      firstImpactReason(trackerHits, routineVendors ? "routine_commerce" : "known_tracker");
    const protectedVendorItems = getProtectionItemsForTrackers(
      protectionActivity,
      trackerHits,
      vendorNames
    );

    appendTrackerItem(list, {
      title: "Known tracker services",
      summary: routineVendors
        ? `Common commerce analytics, tag, or ad-conversion services were detected across ${trackerHits.length} request${trackerHits.length === 1 ? "" : "s"}.`
        : purposes.length
        ? `Used for ${purposes.slice(0, 3).join(", ")} across ${trackerHits.length} request${trackerHits.length === 1 ? "" : "s"}.`
        : `Known analytics or advertising services were detected across ${trackerHits.length} request${trackerHits.length === 1 ? "" : "s"}.`,
      why: trackerWhyText(vendorReason),
      protection: formatProtectionNotice(protectedVendorItems, "matching tracker"),
      count: `${vendorCount}`,
      chips: [...vendorNames.slice(0, 4), ...sources.slice(0, 2)],
      severity: vendorSeverity,
    });
  }

  if (fingerprintingHints.length) {
    appendTrackerItem(list, {
      title: "Fingerprinting hints",
      summary: "Script patterns may identify the browser or device.",
      why: trackerWhyText("fingerprinting"),
      count: `${fingerprintingHints.length}`,
      chips: fingerprintingHints.slice(0, 4).map((hint) => hint.label || hint.keyword),
      severity: "high",
    });
  }

  if (storageSignals.length) {
    const labels = [...new Set(storageSignals.map((signal) => signal.label).filter(Boolean))];
    const highestStorageSeverity = highestTrackerSeverity(storageSignals, "low");
    const routineStorage = storageSignals.every(
      (signal) => signal?.routineCommerce === true
    );

    appendTrackerItem(list, {
      title: "Browser storage signals",
      summary: routineStorage
        ? "Routine ad attribution, analytics, or session identifiers were found in browser storage."
        : "Tracking-style identifiers were found in browser storage.",
      why: trackerWhyText(
        firstImpactReason(storageSignals, routineStorage ? "routine_storage" : "browser_storage")
      ),
      count: `${storageSignals.length}`,
      chips: labels.slice(0, 5),
      severity: highestStorageSeverity,
    });
  }

  if (formSignals.length) {
    const labels = [...new Set(formSignals.map((signal) => signal.label).filter(Boolean))];
    const highestFormSeverity = highestTrackerSeverity(formSignals, "low");
    const routineForms = formSignals.every(
      (signal) => signal?.routineCommerce === true
    );

    appendTrackerItem(list, {
      title: "Data-entry fields",
      summary: routineForms
        ? "Checkout, account, or order fields were detected; these are not tracker behavior by themselves."
        : "The page asks for information that can identify a visitor.",
      why: trackerWhyText(
        firstImpactReason(formSignals, routineForms ? "routine_form" : "data_entry")
      ),
      count: `${formSignals.length}`,
      chips: labels.slice(0, 5),
      severity: highestFormSeverity,
    });
  }

  if (!trackerHits.length && meaningfulThirdPartyCount >= 6) {
    const hosts = [
      ...new Set(
        thirdPartyResources
          .filter((item) => item?.likelyBenign !== true)
          .map((item) => item.hostname)
          .filter(Boolean)
      ),
    ];
    appendTrackerItem(list, {
      title: "Third-party resources",
      summary: "Several outside domains loaded resources on this page.",
      why: trackerWhyText(
        meaningfulThirdPartyCount >= 6 ? "many_third_parties" : "third_party_resource"
      ),
      count: `${meaningfulThirdPartyCount}`,
      chips: hosts.slice(0, 5),
      severity: "medium",
    });
  }

  // Protection activity is summarized at the top to avoid repeating it as a card.
}

async function loadHeuristicIntoPopup(els, { force = false } = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    renderHeuristic(els, null);
    renderMismatch(null);
    renderTrackerSignals(null, null);
    renderEyeReason(null);
    syncTrackerShortcutAndAutoView(null, null);
    return null;
  }

  const [heuristicRes, protectionActivity] = await Promise.all([
    sendRuntimeMessage({
      type: "getHeuristic",
      tabId: tab.id,
      force,
      repaintToolbar: true,
    }),
    loadProtectionActivityForTab(tab.id),
  ]);

  const r = heuristicRes?.result || null;
  renderHeuristic(els, r);
  renderMismatch(r?.mismatch || null);
  renderTrackerSignals(r?.trackerSignals || null, protectionActivity);
  renderEyeReason(r, protectionActivity);
  syncTrackerShortcutAndAutoView(r, protectionActivity);
  return r;
}

async function refreshTrackerProtectionView(heuristicResult = null) {
  const tab = await getActiveTab();
  const protectionActivity = tab?.id
    ? await loadProtectionActivityForTab(tab.id)
    : null;

  renderTrackerSignals(heuristicResult?.trackerSignals || null, protectionActivity);
  renderEyeReason(heuristicResult, protectionActivity);
  syncTrackerShortcutAndAutoView(heuristicResult, protectionActivity);
}

// ---------- Manual protection UI helpers ----------
const DEFAULT_PROTECTION_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: true,
  disableTrackingLinks: false,
  blockScamPopups: true,
};

const PROTECTION_RULE_KEYS = Object.keys(DEFAULT_PROTECTION_RULES);

function getProtectionEls() {
  return {
    siteLabel: document.getElementById("protect-site-label"),
    networkChip: document.getElementById("protect-network-chip"),
    activityShortcut: document.getElementById("protect-activity-shortcut"),
    activitySummary: document.getElementById("protect-activity-summary"),
    viewActivityBtn: document.getElementById("protect-view-activity"),
    reloadHint: document.getElementById("protect-reload-hint"),
    enableAll: document.getElementById("protect-enable-all"),
    blockTrackers: document.getElementById("protect-block-trackers"),
    blockThirdPartyScripts: document.getElementById("protect-block-third-party-scripts"),
    blockIframes: document.getElementById("protect-block-iframes"),
    removeAds: document.getElementById("protect-remove-ads"),
    disableTrackingLinks: document.getElementById("protect-disable-tracking-links"),
    blockScamPopups: document.getElementById("protect-block-scam-popups"),
    refreshBtn: document.getElementById("protect-refresh"),
    pageReloadBtn: document.getElementById("protect-page-reload"),
    saveBtn: document.getElementById("protect-save"),
    resetBtn: document.getElementById("protect-reset"),
    status: document.getElementById("protect-status"),
  };
}

function protectionUsesVisibleProtection(rules = {}) {
  const merged = { ...DEFAULT_PROTECTION_RULES, ...(rules || {}) };
  return Object.values(merged).some(Boolean);
}

function usesReloadSensitiveProtection(rules = {}) {
  const merged = { ...DEFAULT_PROTECTION_RULES, ...(rules || {}) };
  return !!(
    merged.blockTrackers ||
    merged.blockThirdPartyScripts ||
    merged.blockIframes
  );
}

function enabledReloadSensitiveProtection(previousRules = {}, nextRules = {}) {
  const previous = { ...DEFAULT_PROTECTION_RULES, ...(previousRules || {}) };
  const next = { ...DEFAULT_PROTECTION_RULES, ...(nextRules || {}) };

  return (
    (!previous.blockTrackers && next.blockTrackers) ||
    (!previous.blockThirdPartyScripts && next.blockThirdPartyScripts) ||
    (!previous.blockIframes && next.blockIframes)
  );
}

function setProtectionReloadHint(els, visible) {
  if (!els.reloadHint) return;
  els.reloadHint.hidden = !visible;
}

function updateProtectionNetworkChip(els, savedRules = {}) {
  if (!els.networkChip) return;

  const merged = { ...DEFAULT_PROTECTION_RULES, ...(savedRules || {}) };
  const savedActive = protectionUsesVisibleProtection(merged);
  const advancedActive = !!(
    merged.blockTrackers ||
    merged.blockThirdPartyScripts ||
    merged.blockIframes ||
    merged.disableTrackingLinks
  );

  els.networkChip.hidden = !savedActive;
  els.networkChip.className = "protect-network-chip protect-network-chip-on";
  els.networkChip.textContent = advancedActive
    ? "Advanced protection active"
    : "Safety defaults active";
  els.networkChip.title =
    advancedActive
      ? "One or more stronger per-site protection controls are enabled."
      : "Obvious ad cleanup and scam-notification protection are on by default.";
}

function renderProtectionActivityShortcut(els, activity = null) {
  if (!els.activityShortcut || !els.activitySummary) return;

  const count = getProtectionBlockedCount(
    getProtectionActivityItems(activity)
  );

  if (count <= 0) {
    els.activityShortcut.hidden = true;
    return;
  }

  els.activityShortcut.hidden = false;
  els.activitySummary.textContent = `${count} blocked on this page.`;
}

function getProtectionInputs(els) {
  return PROTECTION_RULE_KEYS
    .map((key) => els[key])
    .filter(Boolean);
}

function syncEnableAllProtectionControl(els) {
  if (!els.enableAll) return;

  const inputs = getProtectionInputs(els);
  const enabledCount = inputs.filter((input) => input.checked).length;

  els.enableAll.checked = inputs.length > 0 && enabledCount === inputs.length;
  els.enableAll.indeterminate =
    enabledCount > 0 && enabledCount < inputs.length;
}

function setProtectionInputsDisabled(els, disabled) {
  if (els.enableAll) els.enableAll.disabled = disabled;

  for (const input of getProtectionInputs(els)) {
    input.disabled = disabled;
  }
}

function setProtectionActionsDisabled(els, disabled) {
  els.saveBtn.disabled = disabled;
  els.resetBtn.disabled = disabled;
  setProtectionInputsDisabled(els, disabled);
}

function markProtectionChoicesChanged(els, message) {
  els.status.className = "status-text status-blue";
  els.status.textContent = message;
  setProtectionReloadHint(els, false);
}

function setProtectionUi(els, rules = {}) {
  const merged = { ...DEFAULT_PROTECTION_RULES, ...rules };

  els.blockTrackers.checked = !!merged.blockTrackers;
  els.blockThirdPartyScripts.checked = !!merged.blockThirdPartyScripts;
  els.blockIframes.checked = !!merged.blockIframes;
  els.removeAds.checked = !!merged.removeAds;
  els.disableTrackingLinks.checked = !!merged.disableTrackingLinks;
  els.blockScamPopups.checked = !!merged.blockScamPopups;
  syncEnableAllProtectionControl(els);
}

function readProtectionUi(els) {
  return {
    blockTrackers: !!els.blockTrackers.checked,
    blockThirdPartyScripts: !!els.blockThirdPartyScripts.checked,
    blockIframes: !!els.blockIframes.checked,
    removeAds: !!els.removeAds.checked,
    disableTrackingLinks: !!els.disableTrackingLinks.checked,
    blockScamPopups: !!els.blockScamPopups.checked,
  };
}

async function loadProtectionRulesIntoPopup(els, tab) {
  const hostname = getHostnameFromUrl(tab?.url || "");

  if (!hostname) {
    els.siteLabel.textContent = "Unsupported page";
    els.status.textContent = "Could not load site protection settings.";
    setProtectionActionsDisabled(els, true);
    setProtectionUi(els, DEFAULT_PROTECTION_RULES);
    updateProtectionNetworkChip(els, DEFAULT_PROTECTION_RULES);
    setProtectionReloadHint(els, false);
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
  updateProtectionNetworkChip(els, rules);
  els.status.textContent =
    "Safety defaults are active. Save only if you change this site's settings.";
  setProtectionReloadHint(els, false);
  setProtectionActionsDisabled(els, false);

  return { hostname, rules };
}

// ---------- Popup view switch ----------
function activateView(viewName, options = {}) {
  if (options.user === true) {
    popupUserSelectedView = true;
  }

  const scanTab = document.getElementById("tab-scan");
  const trackerTab = document.getElementById("tab-trackers");
  const protectTab = document.getElementById("tab-protect");
  const scanView = document.getElementById("view-scan");
  const trackerView = document.getElementById("view-trackers");
  const protectView = document.getElementById("view-protect");

  const views = {
    scan: { tab: scanTab, view: scanView },
    trackers: { tab: trackerTab, view: trackerView },
    protect: { tab: protectTab, view: protectView },
  };
  const activeName = views[viewName] ? viewName : "scan";

  for (const item of Object.values(views)) {
    item.tab?.classList.remove("active");
    item.view?.classList.remove("active");
  }

  views[activeName].tab?.classList.add("active");
  views[activeName].view?.classList.add("active");
}

async function init() {
  const toastContainer = document.getElementById("toast-container");
  const autoBtn = document.getElementById("auto-analyze");
  const heuristicRefreshBtn = document.getElementById("heuristic-refresh");
  const trackerRefreshBtn = document.getElementById("tracker-refresh");
  const trackerDriverOpen = document.getElementById("tracker-driver-open");

  const heuristicEls = {
    resultCard: document.getElementById("policy-result-card"),
    finderCard: document.getElementById("policy-finder-card"),
    summaryCard: document.getElementById("policy-summary-card"),
    policyFinderStatus: document.getElementById("policy-finder-status"),
    heuristicScore: document.getElementById("heuristic-score"),
    heuristicLink: document.getElementById("heuristic-link"),
    heuristicOpen: document.getElementById("heuristic-open"),
    heuristicReasons: document.getElementById("heuristic-reasons"),
    heuristicFindings: document.getElementById("heuristic-findings"),
    heuristicSummary: document.getElementById("heuristic-summary"),
    heuristicSummaryWrap: document.getElementById("heuristic-summary-wrap"),
  };

  const protectionEls = getProtectionEls();
  const activeTab = await getActiveTab();

  initFirstRunExplanation();

  let latestHeuristic = await loadHeuristicIntoPopup(heuristicEls);
  let protectionState = await loadProtectionRulesIntoPopup(protectionEls, activeTab);
  const initialProtectionActivity = activeTab?.id
    ? await loadProtectionActivityForTab(activeTab.id)
    : null;
  renderProtectionActivityShortcut(protectionEls, initialProtectionActivity);
  syncTrackerShortcutAndAutoView(
    latestHeuristic,
    initialProtectionActivity
  );

  if (heuristicRefreshBtn) {
    heuristicRefreshBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls, {
        force: true,
      });
      showToast(toastContainer, "Policy check refreshed", "info");
    });
  }

  if (trackerRefreshBtn) {
    trackerRefreshBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls, {
        force: true,
      });
      showToast(toastContainer, "Tracker check refreshed", "info");
    });
  }

  if (trackerDriverOpen) {
    trackerDriverOpen.addEventListener("click", () => {
      activateView("trackers", { user: true });
    });
  }

  if (protectionEls.refreshBtn) {
    protectionEls.refreshBtn.addEventListener("click", async () => {
      const tab = await getActiveTab();
      protectionState = await loadProtectionRulesIntoPopup(protectionEls, tab);
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls, {
        force: true,
      });
      const protectionActivity = tab?.id
        ? await loadProtectionActivityForTab(tab.id)
        : null;
      renderProtectionActivityShortcut(protectionEls, protectionActivity);
      showToast(toastContainer, "Protection refreshed", "info");
    });
  }

  if (protectionEls.pageReloadBtn) {
    protectionEls.pageReloadBtn.addEventListener("click", async () => {
      const tab = await getActiveTab();

      if (!tab?.id) {
        showToast(toastContainer, "No active page to reload", "error");
        return;
      }

      chrome.tabs.reload(tab.id);
      setProtectionReloadHint(protectionEls, false);
      showToast(toastContainer, "Page reload requested", "info");
    });
  }

  if (protectionEls.viewActivityBtn) {
    protectionEls.viewActivityBtn.addEventListener("click", () => {
      activateView("trackers", { user: true });
    });
  }

  if (autoBtn) {
    autoBtn.textContent = "Refresh";
    autoBtn.addEventListener("click", async () => {
      latestHeuristic = await loadHeuristicIntoPopup(heuristicEls, {
        force: true,
      });
      showToast(toastContainer, "Summary refreshed", "info");
    });
  }

  if (protectionEls.enableAll) {
    protectionEls.enableAll.addEventListener("change", () => {
      const enabled = !!protectionEls.enableAll.checked;

      for (const input of getProtectionInputs(protectionEls)) {
        input.checked = enabled;
      }

      syncEnableAllProtectionControl(protectionEls);
      markProtectionChoicesChanged(
        protectionEls,
        enabled
          ? "All protections selected. Save to apply them to this site."
          : "All protections cleared. Save to apply this change."
      );
    });
  }

  for (const input of getProtectionInputs(protectionEls)) {
    input.addEventListener("change", () => {
      syncEnableAllProtectionControl(protectionEls);
      markProtectionChoicesChanged(
        protectionEls,
        "Protection choices changed. Save to apply them to this site."
      );
    });
  }

  if (protectionEls.saveBtn) {
    protectionEls.saveBtn.addEventListener("click", async () => {
      const rules = readProtectionUi(protectionEls);
      const shouldShowReloadHint =
        enabledReloadSensitiveProtection(protectionState.rules, rules) &&
        usesReloadSensitiveProtection(rules);

      const res = await chrome.runtime.sendMessage({
        type: "SET_RULES_FOR_HOST",
        hostname: protectionState.hostname,
        rules,
      });

      if (res?.ok) {
        protectionState = {
          ...protectionState,
          rules,
        };
        protectionEls.status.className = "status-text status-green";
        protectionEls.status.textContent =
          shouldShowReloadHint
            ? "Protection saved. Reload this page to apply stronger blocking fully."
            : "Protection saved. If it blocks tracker behavior, the eye may update.";
        updateProtectionNetworkChip(protectionEls, rules);
        setProtectionReloadHint(protectionEls, shouldShowReloadHint);
        showToast(toastContainer, "Protection saved", "success");
        setTimeout(async () => {
          await refreshTrackerProtectionView(latestHeuristic);
          const tab = await getActiveTab();
          const protectionActivity = tab?.id
            ? await loadProtectionActivityForTab(tab.id)
            : null;
          renderProtectionActivityShortcut(protectionEls, protectionActivity);
        }, 300);
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
        protectionState = {
          ...protectionState,
          rules: { ...DEFAULT_PROTECTION_RULES },
        };
        protectionEls.status.className = "status-text status-blue";
        protectionEls.status.textContent =
          "Safety defaults restored for this site.";
        updateProtectionNetworkChip(protectionEls, DEFAULT_PROTECTION_RULES);
        setProtectionReloadHint(protectionEls, false);
        showToast(toastContainer, "Safety defaults restored", "info");
        setTimeout(async () => {
          await refreshTrackerProtectionView(latestHeuristic);
          const tab = await getActiveTab();
          const protectionActivity = tab?.id
            ? await loadProtectionActivityForTab(tab.id)
            : null;
          renderProtectionActivityShortcut(protectionEls, protectionActivity);
        }, 300);
      } else {
        protectionEls.status.className = "status-text status-red";
        protectionEls.status.textContent =
          "Failed to reset protection settings.";
        showToast(toastContainer, "Failed to reset protection", "error");
      }
    });
  }

  const scanTab = document.getElementById("tab-scan");
  const trackerTab = document.getElementById("tab-trackers");
  const protectTab = document.getElementById("tab-protect");

  if (scanTab) {
    scanTab.addEventListener("click", () => activateView("scan", { user: true }));
  }

  if (trackerTab) {
    trackerTab.addEventListener("click", () => activateView("trackers", { user: true }));
  }

  if (protectTab) {
    protectTab.addEventListener("click", () => activateView("protect", { user: true }));
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
