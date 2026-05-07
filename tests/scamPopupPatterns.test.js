import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  classifyScamPopupSignal,
  textLooksLikeNotificationTrap,
  textLooksLikeScamPopup,
  textLooksLikeTrustedNotificationRequest,
  textLooksLikeUnwantedInstallTrap,
  urlLooksLikeRiskyDownload,
  urlLooksLikePopupScam,
} from "../lib/scamPopupPatterns.js";

async function loadFixture(name) {
  return readFile(
    new URL(`./fixtures/scam-popups/${name}`, import.meta.url),
    "utf8"
  );
}

function stripHtml(html = "") {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("detects fake virus support overlays", () => {
  const classification = classifyScamPopupSignal({
    text: "Windows Defender security warning. Your computer is infected. Do not close this window. Call Microsoft support at 888-555-0199.",
  });

  assert.equal(classification.level, "likely");
  assert.equal(classification.label, "Likely scam");
  assert.equal(
    textLooksLikeScamPopup(
      "Windows Defender security warning. Your computer is infected. Do not close this window. Call Microsoft support at 888-555-0199."
    ),
    true
  );
});

test("detects locked-browser scare language without a phone number", () => {
  assert.equal(
    textLooksLikeScamPopup(
      "Critical alert: malware detected and your browser is locked because unauthorized access was detected."
    ),
    true
  );
});

test("detects notification permission traps", () => {
  assert.equal(
    classifyScamPopupSignal({
      text: "Click Allow to verify you are not a robot and continue.",
    }).level,
    "likely"
  );
  assert.equal(
    textLooksLikeNotificationTrap("Click Allow to verify you are not a robot and continue."),
    true
  );
  assert.equal(
    textLooksLikeScamPopup("Press Allow to download the file."),
    true
  );
});

test("detects common fake allow prompt variants", () => {
  const cases = [
    "Tap Allow to confirm you are not a robot.",
    "Click Allow to watch the video.",
    "Press Allow to claim your prize.",
    "Allow notifications to download the file.",
  ];

  for (const text of cases) {
    assert.equal(textLooksLikeNotificationTrap(text), true, text);
    assert.equal(classifyScamPopupSignal({ text }).level, "likely", text);
  }
});

test("allows ordinary user-initiated notification prompts", () => {
  const classification = classifyScamPopupSignal({
    text: "Notify me when this item is back in stock.",
    notificationRequest: true,
    recentUserGesture: true,
    notificationRequestCount: 1,
  });

  assert.equal(classification.level, "normal");
  assert.equal(
    textLooksLikeTrustedNotificationRequest("Enable alerts for shipping updates."),
    true
  );
});

test("does not treat Pushwoosh SDK URLs as scam URLs by themselves", () => {
  const urls = [
    "https://cdn.pushwoosh.com/webpush/v3/pushwoosh-web-notifications.js",
    "https://api.pushwoosh.com/json/1.3/registerDevice",
    "https://go.pushwoosh.com/content/example",
  ];

  for (const url of urls) {
    assert.equal(urlLooksLikePopupScam(url), false, url);
    assert.equal(classifyScamPopupSignal({ url }).level, "normal", url);
  }
});

test("allows normal Pushwoosh opt-in after a user action", () => {
  const classification = classifyScamPopupSignal({
    text: "Enable alerts for order updates powered by Pushwoosh.",
    url: "https://cdn.pushwoosh.com/webpush/v3/pushwoosh-web-notifications.js",
    notificationRequest: true,
    recentUserGesture: true,
    notificationRequestCount: 1,
  });

  assert.equal(classification.level, "normal");
});

test("still blocks Pushwoosh-powered fake allow traps", () => {
  const classification = classifyScamPopupSignal({
    text: "Click Allow to verify you are not a robot and continue.",
    url: "https://cdn.pushwoosh.com/webpush/v3/pushwoosh-web-notifications.js",
    notificationRequest: true,
    recentUserGesture: true,
    notificationRequestCount: 1,
  });

  assert.equal(classification.level, "likely");
  assert.equal(classification.reason, "notification trap");
});

test("flags Pushwoosh permission requests without a user action", () => {
  const classification = classifyScamPopupSignal({
    text: "Enable alerts for order updates.",
    url: "https://cdn.pushwoosh.com/webpush/v3/pushwoosh-web-notifications.js",
    notificationRequest: true,
    recentUserGesture: false,
    notificationRequestCount: 1,
  });

  assert.equal(classification.level, "suspicious");
  assert.equal(classification.reason, "notification prompt without user action");
});

test("does not allow trusted notification wording without a user action", () => {
  const classification = classifyScamPopupSignal({
    text: "Notify me when this item is back in stock.",
    notificationRequest: true,
    recentUserGesture: false,
    notificationRequestCount: 1,
  });

  assert.equal(classification.level, "suspicious");
  assert.equal(classification.reason, "notification prompt without user action");
});

test("blocks notification prompts without a user action or repeated attempts", () => {
  assert.equal(
    classifyScamPopupSignal({
      text: "This site wants to show notifications.",
      notificationRequest: true,
      recentUserGesture: false,
      notificationRequestCount: 1,
    }).level,
    "suspicious"
  );

  assert.equal(
    classifyScamPopupSignal({
      text: "This site wants to show notifications.",
      notificationRequest: true,
      recentUserGesture: true,
      notificationRequestCount: 3,
    }).level,
    "likely"
  );
});

test("detects unwanted browser install lures", () => {
  const text =
    "Your browser is out of date. Install Wave Browser now to continue safely.";

  assert.equal(textLooksLikeUnwantedInstallTrap(text), true);
  assert.equal(textLooksLikeScamPopup(text), true);
  assert.equal(
    classifyScamPopupSignal({
      text,
      url: "https://example.test/download/wavebrowser-setup.exe",
    }).reason,
    "unwanted install prompt"
  );
  assert.equal(
    urlLooksLikeRiskyDownload("https://example.test/download/wavebrowser-setup.exe"),
    true
  );
});

test("detects deceptive update and extension install lures", () => {
  const cases = [
    "Critical update required. Run installer to continue.",
    "Chrome update required. Download the setup to keep browsing.",
    "Install extension to unlock secure browser search.",
    "Video player update required. Install now to watch.",
  ];

  for (const text of cases) {
    assert.equal(textLooksLikeUnwantedInstallTrap(text), true, text);
    assert.equal(classifyScamPopupSignal({ text }).level, "likely", text);
  }
});

test("keeps risky download links suspicious unless paired with scam context", () => {
  assert.equal(
    classifyScamPopupSignal({
      url: "https://example.test/files/setup.exe",
    }).level,
    "suspicious"
  );
  assert.equal(
    classifyScamPopupSignal({
      text: "Critical warning. Browser is locked.",
      url: "https://example.test/files/setup.exe",
      forcedPopup: true,
    }).level,
    "likely"
  );
});

test("does not treat normal downloads as unwanted installs by text alone", () => {
  assert.equal(
    classifyScamPopupSignal({
      text: "Download the monthly product catalog.",
      url: "https://example.test/catalog.pdf",
    }).level,
    "normal"
  );
  assert.equal(
    classifyScamPopupSignal({
      text: "Download the official app from the app store.",
      url: "https://example.test/app",
    }).level,
    "normal"
  );
});

test("does not flag ordinary site popups", () => {
  assert.equal(
    classifyScamPopupSignal({
      text: "Subscribe to our newsletter for updates and offers.",
    }).level,
    "normal"
  );
  assert.equal(
    textLooksLikeScamPopup("Sign in to continue checkout and review your cart."),
    false
  );
  assert.equal(
    textLooksLikeScamPopup("Subscribe to our newsletter for updates and offers."),
    false
  );
});

test("detects suspicious popup urls", () => {
  assert.equal(
    classifyScamPopupSignal({
      url: "https://example.test/security-warning",
    }).level,
    "suspicious"
  );
  assert.equal(urlLooksLikePopupScam("https://example.test/security-warning"), true);
  assert.equal(urlLooksLikePopupScam("https://example.test/login"), false);
});

test("separates dialog loops from likely scam wording", () => {
  const classification = classifyScamPopupSignal({
    text: "Please wait.",
    dialogCount: 3,
  });

  assert.equal(classification.level, "suspicious");
  assert.equal(classification.label, "Suspicious popup");
});

test("classifies local scam popup fixtures safely", async () => {
  const windowsAlert = stripHtml(await loadFixture("fake-windows-alert.html"));
  const appleAlert = stripHtml(await loadFixture("fake-apple-support.html"));
  const notificationTrap = stripHtml(
    await loadFixture("notification-allow-trap.html")
  );

  assert.equal(
    classifyScamPopupSignal({ text: windowsAlert }).level,
    "likely"
  );
  assert.equal(
    classifyScamPopupSignal({ text: appleAlert }).level,
    "likely"
  );
  assert.equal(
    classifyScamPopupSignal({ text: notificationTrap }).level,
    "likely"
  );
});

test("classifies local scam behavior fixtures safely", async () => {
  const alertLoop = await loadFixture("repeated-alert-loop.html");
  const popunderChain = await loadFixture("popunder-chain.html");
  const popunderUrls = [...popunderChain.matchAll(/window\.open\("([^"]+)"/g)]
    .map((match) => match[1]);

  assert.equal(
    classifyScamPopupSignal({
      text: alertLoop,
      dialogCount: 3,
    }).level,
    "suspicious"
  );

  assert.ok(popunderUrls.length >= 3);
  assert.ok(
    popunderUrls.every(
      (url) =>
        classifyScamPopupSignal({ url, forcedPopup: true }).level !== "normal"
    )
  );
});
