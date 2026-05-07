const TECH_SUPPORT_SCAM_TERMS = [
  "virus",
  "infected",
  "infection",
  "trojan",
  "malware",
  "spyware",
  "security warning",
  "critical warning",
  "critical alert",
  "system alert",
  "windows defender",
  "microsoft support",
  "apple support",
  "technical support",
  "tech support",
  "call support",
  "call now",
  "do not close",
  "computer is blocked",
  "browser is locked",
  "firewall",
  "detected suspicious",
  "unauthorized access",
  "your files",
];

const NOTIFICATION_TRAP_TERMS = [
  "click allow",
  "press allow",
  "tap allow",
  "allow notifications",
  "enable notifications",
  "show notifications",
];

const NOTIFICATION_TRAP_PURPOSES = [
  "continue",
  "verify",
  "confirm",
  "download",
  "watch",
  "not a robot",
  "captcha",
  "prize",
];

const TRUSTED_NOTIFICATION_CONTEXT_TERMS = [
  "notify me",
  "enable alerts",
  "price alert",
  "stock alert",
  "order updates",
  "shipping updates",
  "breaking news alerts",
];

const UNWANTED_INSTALL_TERMS = [
  "wave browser",
  "wavebrowser",
  "browser update",
  "chrome update",
  "critical update",
  "required update",
  "recommended browser",
  "secure browser",
  "your browser is out of date",
  "browser is out of date",
  "install extension",
  "add extension",
  "download manager",
  "run installer",
  "video player update",
  "codec update",
  "flash player",
  "search manager",
  "browser assistant",
];

const INSTALL_ACTION_RE =
  /\b(?:download|install|setup|run|open|update|add|allow|enable)\b/i;
const RISKY_DOWNLOAD_EXTENSION_RE =
  /\.(?:exe|msi|dmg|pkg|scr|bat|cmd|vbs|ps1|crx|xpi)(?:[?#]|$)/i;

const SUSPICIOUS_POPUP_URL_TERMS = [
  "security-warning",
  "virus",
  "malware",
  "tech-support",
  "support-alert",
  "browser-lock",
  "popunder",
  "popup",
];

const SUSPICIOUS_NOTIFICATION_URL_RE =
  /(?:allow[-_/]?notifications?|notification[-_/]?(?:trap|scam|alert|virus|warning)|push[-_/]?(?:trap|scam|alert|virus|warning|continue|verify|prize))/i;

const PHONE_NUMBER_RE =
  /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function countScamTerms(text = "") {
  const lower = normalizeText(text);
  if (!lower) return 0;

  return TECH_SUPPORT_SCAM_TERMS.filter((term) => lower.includes(term)).length;
}

export function hasPhoneNumber(text = "") {
  return PHONE_NUMBER_RE.test(String(text || ""));
}

export function textLooksLikeNotificationTrap(text = "") {
  const lower = normalizeText(text);
  if (!lower) return false;

  const asksForAllow = NOTIFICATION_TRAP_TERMS.some((term) =>
    lower.includes(term)
  );
  const hasPurpose = NOTIFICATION_TRAP_PURPOSES.some((term) =>
    lower.includes(term)
  );

  return asksForAllow && hasPurpose;
}

export function textLooksLikeTrustedNotificationRequest(text = "") {
  const lower = normalizeText(text);
  if (!lower) return false;

  return TRUSTED_NOTIFICATION_CONTEXT_TERMS.some((term) =>
    lower.includes(term)
  );
}

export function textLooksLikeUnwantedInstallTrap(text = "") {
  const lower = normalizeText(text);
  if (!lower) return false;

  const hasInstallAction = INSTALL_ACTION_RE.test(lower);
  const hasInstallTrap = UNWANTED_INSTALL_TERMS.some((term) =>
    lower.includes(term)
  );

  return hasInstallAction && hasInstallTrap;
}

export function urlLooksLikeRiskyDownload(rawUrl = "") {
  const lower = String(rawUrl || "").toLowerCase();
  if (!lower) return false;

  return (
    RISKY_DOWNLOAD_EXTENSION_RE.test(lower) ||
    /(?:wavebrowser|wave-browser|browser-update|chrome-update|setup|installer|download-manager)/i.test(
      lower
    )
  );
}

export function textLooksLikeScamPopup(text = "") {
  return classifyScamPopupSignal({ text }).level === "likely";
}

export function classifyScamPopupSignal({
  text = "",
  url = "",
  forcedPopup = false,
  notificationRequest = false,
  recentUserGesture = false,
  notificationRequestCount = 0,
  dialogCount = 0,
} = {}) {
  const lower = normalizeText(text);
  const scamTerms = countScamTerms(lower);
  const phone = hasPhoneNumber(lower);
  const notificationTrap = textLooksLikeNotificationTrap(lower);
  const trustedNotificationRequest = textLooksLikeTrustedNotificationRequest(lower);
  const unwantedInstallTrap = textLooksLikeUnwantedInstallTrap(lower);
  const suspiciousUrl = urlLooksLikePopupScam(url);
  const riskyDownload = urlLooksLikeRiskyDownload(url);
  const reasons = [];

  if (notificationRequest && (notificationTrap || unwantedInstallTrap)) {
    reasons.push("notification trap");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "notification trap",
      reasons,
    };
  }

  if (notificationRequest && notificationRequestCount > 2) {
    reasons.push("repeated notification prompt");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "repeated notification prompt",
      reasons,
    };
  }

  if (notificationRequest && !recentUserGesture) {
    reasons.push("notification prompt without user action");
    return {
      level: "suspicious",
      label: "Suspicious notification",
      reason: "notification prompt without user action",
      reasons,
    };
  }

  if (notificationRequest && trustedNotificationRequest) {
    return {
      level: "normal",
      label: "Normal popup",
      reason: "",
      reasons: [],
    };
  }

  if (notificationTrap) {
    reasons.push("notification trap");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "notification trap",
      reasons,
    };
  }

  if (unwantedInstallTrap) {
    reasons.push("unwanted install prompt");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "unwanted install prompt",
      reasons,
    };
  }

  if (riskyDownload && (forcedPopup || scamTerms >= 1 || suspiciousUrl)) {
    reasons.push("risky download prompt");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "risky download prompt",
      reasons,
    };
  }

  if (phone && scamTerms >= 1) {
    reasons.push("support phone number", "scare wording");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "fake support alert",
      reasons,
    };
  }

  if (scamTerms >= 3) {
    reasons.push("multiple scare terms");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "fake virus warning",
      reasons,
    };
  }

  if (suspiciousUrl && scamTerms >= 1) {
    reasons.push("suspicious popup url", "scare wording");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "scam popup url",
      reasons,
    };
  }

  if (suspiciousUrl) {
    reasons.push("suspicious popup url");
  }

  if (riskyDownload) {
    reasons.push("risky download link");
  }

  if (forcedPopup) {
    reasons.push("forced popup window");
  }

  if (dialogCount > 2) {
    reasons.push("repeated dialog loop");
  }

  if (scamTerms > 0) {
    reasons.push("scare wording");
  }

  if (reasons.length) {
    return {
      level: "suspicious",
      label: "Suspicious popup",
      reason: reasons[0],
      reasons,
    };
  }

  return {
    level: "normal",
    label: "Normal popup",
    reason: "",
    reasons: [],
  };
}

export function urlLooksLikePopupScam(rawUrl = "") {
  const lower = String(rawUrl || "").toLowerCase();
  if (!lower) return false;

  return (
    SUSPICIOUS_POPUP_URL_TERMS.some((term) => lower.includes(term)) ||
    SUSPICIOUS_NOTIFICATION_URL_RE.test(lower)
  );
}

export const SCAM_POPUP_PATTERNS_FOR_TESTS = {
  TECH_SUPPORT_SCAM_TERMS,
  NOTIFICATION_TRAP_TERMS,
  NOTIFICATION_TRAP_PURPOSES,
  TRUSTED_NOTIFICATION_CONTEXT_TERMS,
  UNWANTED_INSTALL_TERMS,
  SUSPICIOUS_POPUP_URL_TERMS,
  SUSPICIOUS_NOTIFICATION_URL_RE,
};
