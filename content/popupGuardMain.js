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
  const popupUrlTerms = [
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
  const phoneNumberRe =
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;

  let lastGestureAt = 0;
  let dialogWindowStartedAt = 0;
  let dialogCount = 0;

  function enabled() {
    return document.documentElement?.getAttribute(ENABLED_ATTR) === "1";
  }

  function normalizeText(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
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

  function looksLikeScamText(text = "") {
    const lower = normalizeText(text);
    if (!lower) return false;

    const terms = countTerms(lower);
    const hasPhone = phoneNumberRe.test(lower);
    return (
      looksLikeNotificationTrap(lower) ||
      (hasPhone && terms >= 1) ||
      terms >= 3
    );
  }

  function looksLikeSuspiciousPopupUrl(rawUrl = "") {
    const lower = String(rawUrl || "").toLowerCase();
    return popupUrlTerms.some((term) => lower.includes(term));
  }

  function classifyPopupSignal({
    text = "",
    url = "",
    forcedPopup = false,
    notificationRequest = false,
    dialogCount: count = 0,
  } = {}) {
    const lower = normalizeText(text);
    const terms = countTerms(lower);
    const hasPhone = phoneNumberRe.test(lower);
    const notificationTrap = looksLikeNotificationTrap(lower);
    const suspiciousUrl = looksLikeSuspiciousPopupUrl(url);

    if (notificationRequest || notificationTrap) {
      return {
        level: "likely",
        label: "Likely scam",
        reason: "notification trap",
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

    if (suspiciousUrl || forcedPopup || count > MAX_DIALOGS_PER_WINDOW || terms > 0) {
      return {
        level: "suspicious",
        label: "Suspicious popup",
        reason: suspiciousUrl
          ? "suspicious popup url"
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
        const classification = classifyPopupSignal({
          notificationRequest: true,
        });
        report({
          kind: "popup-scam",
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

      return nativeRequestPermission(callback);
    };
  }

  window.addEventListener(
    "beforeunload",
    (event) => {
      if (!enabled()) return;

      event.stopImmediatePropagation();
      event.returnValue = undefined;
      report({
        kind: "popup-scam",
        action: "blocked",
        label: "Suspicious popup",
        confidence: "suspicious",
        reason: "page-leave trap",
        requestType: "beforeunload",
      });
    },
    true
  );
})();
