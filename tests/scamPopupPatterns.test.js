import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  classifyScamPopupSignal,
  textLooksLikeNotificationTrap,
  textLooksLikeScamPopup,
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
