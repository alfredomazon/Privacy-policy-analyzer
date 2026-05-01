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

const SUSPICIOUS_POPUP_URL_TERMS = [
  "security-warning",
  "virus",
  "malware",
  "tech-support",
  "support-alert",
  "browser-lock",
  "push",
  "notification",
  "popunder",
  "popup",
];

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

export function textLooksLikeScamPopup(text = "") {
  return classifyScamPopupSignal({ text }).level === "likely";
}

export function classifyScamPopupSignal({
  text = "",
  url = "",
  forcedPopup = false,
  notificationRequest = false,
  dialogCount = 0,
} = {}) {
  const lower = normalizeText(text);
  const scamTerms = countScamTerms(lower);
  const phone = hasPhoneNumber(lower);
  const notificationTrap = textLooksLikeNotificationTrap(lower);
  const suspiciousUrl = urlLooksLikePopupScam(url);
  const reasons = [];

  if (notificationRequest || notificationTrap) {
    reasons.push("notification trap");
    return {
      level: "likely",
      label: "Likely scam",
      reason: "notification trap",
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

  return SUSPICIOUS_POPUP_URL_TERMS.some((term) => lower.includes(term));
}

export const SCAM_POPUP_PATTERNS_FOR_TESTS = {
  TECH_SUPPORT_SCAM_TERMS,
  NOTIFICATION_TRAP_TERMS,
  NOTIFICATION_TRAP_PURPOSES,
  SUSPICIOUS_POPUP_URL_TERMS,
};
