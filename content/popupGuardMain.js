// Runs in the page world so it can intercept popup and dialog APIs.
(() => {
  const ENABLED_ATTR = "data-evil-eye-block-scam-popups";
  const ACTIVITY_EVENT = "evil-eye-popup-guard-activity";
  const USER_GESTURE_WINDOW_MS = 1800;
  const DIALOG_WINDOW_MS = 10000;
  const MAX_DIALOGS_PER_WINDOW = 2;

  const scamTerms = [
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
  ];
  const notificationTrapTerms = [
    "click allow",
    "press allow",
    "tap allow",
    "allow notifications",
    "enable notifications",
    "show notifications",
  ];
  const notificationTrapPurposes = [
    "continue",
    "verify",
    "confirm",
    "download",
    "watch",
    "not a robot",
    "captcha",
    "prize",
  ];
  const trustedNotificationContextTerms = [
    "notify me",
    "enable alerts",
    "price alert",
    "stock alert",
    "order updates",
    "shipping updates",
    "breaking news alerts",
    "desktop notifications",
    "email notifications",
    "mail notifications",
    "new mail",
    "new email",
    "new messages",
    "incoming mail",
  ];
  const unwantedInstallTerms = [
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
  const popupUrlTerms = [
    "security-warning",
    "virus",
    "malware",
    "tech-support",
    "support-alert",
    "browser-lock",
    "popunder",
    "popup",
  ];
  const phoneNumberRe =
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
  const installActionRe =
    /\b(?:download|install|setup|run|open|update|add|allow|enable)\b/i;
  const riskyDownloadExtensionRe =
    /\.(?:exe|msi|dmg|pkg|scr|bat|cmd|vbs|ps1|crx|xpi)(?:[?#]|$)/i;
  const suspiciousNotificationUrlRe =
    /(?:allow[-_/]?notifications?|notification[-_/]?(?:trap|scam|alert|virus|warning)|push[-_/]?(?:trap|scam|alert|virus|warning|continue|verify|prize))/i;

  let lastGestureAt = 0;
  let dialogWindowStartedAt = 0;
  let dialogCount = 0;
  let notificationRequestCount = 0;

  function enabled() {
    return document.documentElement?.getAttribute(ENABLED_ATTR) === "1";
  }

  try {
    document.documentElement?.setAttribute(ENABLED_ATTR, "1");
  } catch {
    // If a page blocks early document access, the isolated enforcer will retry.
  }

  function normalizeText(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getHostname() {
    try {
      return window.location.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  function isTrustedCommunicationApp() {
    const host = getHostname();
    return (
      host === "mail.google.com" ||
      host === "gmail.com" ||
      host.endsWith(".gmail.com") ||
      host === "outlook.live.com" ||
      host === "outlook.office.com" ||
      host === "outlook.office365.com" ||
      host === "mail.live.com" ||
      host === "mail.yahoo.com" ||
      host === "mail.proton.me" ||
      host === "proton.me" ||
      host.endsWith(".proton.me") ||
      host === "protonmail.com" ||
      host.endsWith(".protonmail.com") ||
      host === "icloud.com" ||
      host.endsWith(".icloud.com")
    );
  }

  function report(detail = {}) {
    try {
      window.dispatchEvent(
        new CustomEvent(ACTIVITY_EVENT, {
          detail: {
            ...detail,
            rule: "blockScamPopups",
          },
        })
      );
    } catch {
      // Ignore pages that interfere with CustomEvent.
    }
  }

  function countTerms(text = "") {
    const lower = normalizeText(text);
    return scamTerms.filter((term) => lower.includes(term)).length;
  }

  function looksLikeNotificationTrap(text = "") {
    const lower = normalizeText(text);
    const asksForAllow = notificationTrapTerms.some((term) =>
      lower.includes(term)
    );
    const hasPurpose = notificationTrapPurposes.some((term) =>
      lower.includes(term)
    );
    return asksForAllow && hasPurpose;
  }

  function looksLikeTrustedNotificationRequest(text = "") {
    const lower = normalizeText(text);
    return trustedNotificationContextTerms.some((term) =>
      lower.includes(term)
    );
  }

  function looksLikeUnwantedInstallTrap(text = "") {
    const lower = normalizeText(text);
    if (!lower) return false;

    const hasInstallAction = installActionRe.test(lower);
    const hasInstallTrap = unwantedInstallTerms.some((term) =>
      lower.includes(term)
    );

    return hasInstallAction && hasInstallTrap;
  }

  function looksLikeScamText(text = "") {
    const lower = normalizeText(text);
    if (!lower) return false;

    const terms = countTerms(lower);
    const hasPhone = phoneNumberRe.test(lower);
    return (
      looksLikeNotificationTrap(lower) ||
      looksLikeUnwantedInstallTrap(lower) ||
      (hasPhone && terms >= 1) ||
      terms >= 3
    );
  }

  function looksLikeSuspiciousPopupUrl(rawUrl = "") {
    const lower = String(rawUrl || "").toLowerCase();
    return (
      popupUrlTerms.some((term) => lower.includes(term)) ||
      suspiciousNotificationUrlRe.test(lower)
    );
  }

  function looksLikeRiskyDownloadUrl(rawUrl = "") {
    const lower = String(rawUrl || "").toLowerCase();
    if (!lower) return false;

    return (
      riskyDownloadExtensionRe.test(lower) ||
      /(?:wavebrowser|wave-browser|browser-update|chrome-update|setup|installer|download-manager)/i.test(
        lower
      )
    );
  }

  function getElementText(el) {
    if (!el) return "";

    return [
      el.innerText || el.textContent || "",
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("title") || "",
      el.getAttribute?.("value") || "",
      el.id || "",
      el.className || "",
    ].join(" ");
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;

    const style = window.getComputedStyle?.(el);
    if (
      style &&
      (style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0")
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function getNotificationContextText() {
    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[class*="notification" i]',
      '[class*="captcha" i]',
      '[class*="verify" i]',
      '[class*="download" i]',
      '[class*="install" i]',
      '[class*="modal" i]',
      '[class*="overlay" i]',
      '[class*="popup" i]',
      '[id*="notification" i]',
      '[id*="captcha" i]',
      '[id*="verify" i]',
      '[id*="download" i]',
      '[id*="install" i]',
      '[id*="modal" i]',
      '[id*="overlay" i]',
      '[id*="popup" i]',
    ];

    const pieces = [];
    for (const el of document.querySelectorAll(selectors.join(","))) {
      if (!isVisible(el)) continue;
      const text = normalizeText(getElementText(el));
      if (text) pieces.push(text.slice(0, 800));
      if (pieces.length >= 4) break;
    }

    const bodyText = normalizeText(document.body?.innerText || "");
    if (bodyText) pieces.push(bodyText.slice(0, 1600));

    return pieces.join(" ");
  }

  function getClickableUrl(el) {
    const link = el?.closest?.("a[href], area[href]");
    if (link) return link.href || link.getAttribute("href") || "";

    const form = el?.closest?.("form[action]");
    if (form) return form.action || form.getAttribute("action") || "";

    return "";
  }

  function classifyPopupSignal({
    text = "",
    url = "",
    forcedPopup = false,
    notificationRequest = false,
    recentUserGesture = false,
    notificationRequestCount: requestCount = 0,
    dialogCount: count = 0,
  } = {}) {
    const lower = normalizeText(text);
    const terms = countTerms(lower);
    const hasPhone = phoneNumberRe.test(lower);
    const notificationTrap = looksLikeNotificationTrap(lower);
    const trustedNotification = looksLikeTrustedNotificationRequest(lower);
    const unwantedInstallTrap = looksLikeUnwantedInstallTrap(lower);
    const suspiciousUrl = looksLikeSuspiciousPopupUrl(url);
    const riskyDownload = looksLikeRiskyDownloadUrl(url);

    if (notificationRequest && (notificationTrap || unwantedInstallTrap)) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "notification trap",
      };
    }

    if (notificationRequest && requestCount > 2) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "repeated notification prompt",
      };
    }

    if (
      notificationRequest &&
      trustedNotification &&
      isTrustedCommunicationApp()
    ) {
      return {
        level: "normal",
        label: "Normal popup",
        reason: "",
      };
    }

    if (notificationRequest && !recentUserGesture) {
      return {
        level: "suspicious",
        label: "Suspicious notification",
        reason: "notification prompt without user action",
      };
    }

    if (notificationRequest && trustedNotification) {
      return {
        level: "normal",
        label: "Normal popup",
        reason: "",
      };
    }

    if (notificationTrap) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "notification trap",
      };
    }

    if (unwantedInstallTrap) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "unwanted install prompt",
      };
    }

    if (riskyDownload && (forcedPopup || terms >= 1 || suspiciousUrl)) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "risky download prompt",
      };
    }

    if (hasPhone && terms >= 1) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "fake support alert",
      };
    }

    if (terms >= 3) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "fake virus warning",
      };
    }

    if (suspiciousUrl && terms >= 1) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "scam popup url",
      };
    }

    if (
      suspiciousUrl ||
      riskyDownload ||
      forcedPopup ||
      count > MAX_DIALOGS_PER_WINDOW ||
      terms > 0
    ) {
      return {
        level: "suspicious",
        label: "Suspicious popup",
        reason: suspiciousUrl
          ? "suspicious popup url"
          : riskyDownload
            ? "risky download link"
            : forcedPopup
              ? "forced popup window"
              : count > MAX_DIALOGS_PER_WINDOW
                ? "repeated dialog loop"
                : "scare wording",
      };
    }

    return {
      level: "normal",
      label: "Normal popup",
      reason: "",
    };
  }

  function hasRecentGesture() {
    return Date.now() - lastGestureAt <= USER_GESTURE_WINDOW_MS;
  }

  function rememberGesture(event) {
    if (event?.isTrusted !== false) {
      lastGestureAt = Date.now();
    }
  }

  ["pointerdown", "mousedown", "keydown", "touchstart"].forEach((type) => {
    window.addEventListener(type, rememberGesture, true);
  });

  const nativeOpen = window.open?.bind(window);
  if (nativeOpen) {
    window.open = function guardedOpen(url, target, features) {
      if (enabled()) {
        const classification = classifyPopupSignal({
          url,
          forcedPopup: !hasRecentGesture(),
        });

        if (classification.level !== "normal") {
          report({
            kind: "popup-scam",
            action: "blocked",
            label: classification.label,
            confidence: classification.level,
            reason: classification.reason,
            url: String(url || ""),
            requestType: "popup",
          });
          return null;
        }
      }

      return nativeOpen(url, target, features);
    };
  }

  window.addEventListener(
    "click",
    (event) => {
      if (!enabled()) return;

      const target = event.target?.closest?.(
        [
          "a[href]",
          "area[href]",
          "button",
          "[role='button']",
          "input[type='button']",
          "input[type='submit']",
        ].join(",")
      );
      if (!target) return;

      const url = getClickableUrl(target);
      const text = `${getElementText(target)} ${getNotificationContextText()}`;
      const classification = classifyPopupSignal({
        text,
        url,
        forcedPopup: event.isTrusted === false,
        recentUserGesture: event.isTrusted !== false,
      });

      if (
        classification.level === "likely" &&
        /install|download|notification/.test(classification.reason || "")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        report({
          kind:
            classification.reason === "notification trap"
              ? "notification-trap"
              : "unwanted-install",
          action: "blocked",
          label:
            classification.reason === "notification trap"
              ? "Suspicious notification prompt"
              : "Unwanted install prompt",
          confidence: classification.level,
          reason: classification.reason,
          url: String(url || ""),
          requestType: "click",
        });
      }
    },
    true
  );

  function classifyDialog(message = "") {
    if (!enabled()) {
      return {
        level: "normal",
        label: "Normal popup",
        reason: "",
      };
    }

    const now = Date.now();
    if (now - dialogWindowStartedAt > DIALOG_WINDOW_MS) {
      dialogWindowStartedAt = now;
      dialogCount = 0;
    }

    dialogCount += 1;
    return classifyPopupSignal({ text: message, dialogCount });
  }

  function classifyPageLeaveTrap() {
    const text = getNotificationContextText();
    const classification = classifyPopupSignal({
      text,
      url: location.href,
    });

    if (classification.level !== "likely") return null;
    if (
      !/fake|support|virus|warning|notification|install|download|risky|scam/i.test(
        classification.reason || ""
      )
    ) {
      return null;
    }

    return classification;
  }

  const nativeAlert = window.alert?.bind(window);
  if (nativeAlert) {
    window.alert = function guardedAlert(message) {
      const classification = classifyDialog(message);
      if (classification.level !== "normal") {
        report({
          kind: "popup-scam",
          action: "blocked",
          label: `${classification.label} alert dialog`,
          confidence: classification.level,
          reason: classification.reason,
          requestType: "dialog",
        });
        return undefined;
      }

      return nativeAlert(message);
    };
  }

  const nativeConfirm = window.confirm?.bind(window);
  if (nativeConfirm) {
    window.confirm = function guardedConfirm(message) {
      const classification = classifyDialog(message);
      if (classification.level !== "normal") {
        report({
          kind: "popup-scam",
          action: "blocked",
          label: `${classification.label} confirm dialog`,
          confidence: classification.level,
          reason: classification.reason,
          requestType: "dialog",
        });
        return false;
      }

      return nativeConfirm(message);
    };
  }

  const nativePrompt = window.prompt?.bind(window);
  if (nativePrompt) {
    window.prompt = function guardedPrompt(message, value) {
      const classification = classifyDialog(message);
      if (classification.level !== "normal") {
        report({
          kind: "popup-scam",
          action: "blocked",
          label: `${classification.label} prompt dialog`,
          confidence: classification.level,
          reason: classification.reason,
          requestType: "dialog",
        });
        return null;
      }

      return nativePrompt(message, value);
    };
  }

  if (window.Notification?.requestPermission) {
    const nativeRequestPermission = window.Notification.requestPermission.bind(
      window.Notification
    );

    window.Notification.requestPermission = function guardedPermission(callback) {
      if (enabled()) {
        notificationRequestCount += 1;
        const contextText = getNotificationContextText();
        const classification = classifyPopupSignal({
          notificationRequest: true,
          text: contextText,
          recentUserGesture: hasRecentGesture(),
          notificationRequestCount,
        });

        if (classification.level !== "normal") {
          report({
            kind: "notification-trap",
            action: "blocked",
            label: classification.label,
            confidence: classification.level,
            reason: classification.reason,
            requestType: "notification",
          });

          if (typeof callback === "function") {
            try {
              callback("denied");
            } catch {
              // Ignore page callback errors.
            }
          }

          return Promise.resolve("denied");
        }
      }

      return nativeRequestPermission(callback);
    };
  }

  window.addEventListener(
    "beforeunload",
    (event) => {
      if (!enabled()) return;

      const classification = classifyPageLeaveTrap();
      if (!classification) return;

      event.stopImmediatePropagation();
      report({
        kind: "popup-scam",
        action: "blocked",
        label: `${classification.label} page-leave trap`,
        confidence: classification.level,
        reason: classification.reason,
        requestType: "beforeunload",
      });
    },
    true
  );
})();
