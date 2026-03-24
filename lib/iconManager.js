import { scoreToLevel } from "./finalScore.js";

const ICONS = {
  blue: {
    16: "icons/EvilEye16.png",
    32: "icons/EvilEye32.png",
    48: "icons/EvilEye48.png",
    128: "icons/EvilEye128.png",
  },
  yellow: {
    16: "icons/EvilEyeYellow16.png",
    32: "icons/EvilEyeYellow32.png",
    48: "icons/EvilEyeYellow48.png",
    128: "icons/EvilEyeYellow128.png",
  },
  red: {
    16: "icons/EvilEyeRed16.png",
    32: "icons/EvilEyeRed32.png",
    48: "icons/EvilEyeRed48.png",
    128: "icons/EvilEyeRed128.png",
  },
};

export async function setToolbar(
  tabId,
  { score, issuesCount = 0, summary = "", levelHint = "none" }
) {
  const level = scoreToLevel(score);

  await chrome.action.setIcon({ tabId, path: ICONS[level] });

  await chrome.action.setBadgeText({
    tabId,
    text: issuesCount ? String(Math.min(issuesCount, 99)) : "",
  });

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color:
      level === "red"
        ? "#D93025"
        : level === "yellow"
        ? "#F9AB00"
        : "#1A73E8",
  });

  let title = "No policy detected yet";

  if (levelHint === "policy-link") {
    title = "Likely privacy policy link found — click to review";
  } else if (levelHint === "policy") {
    title =
      issuesCount > 0
        ? `${summary}: ${issuesCount} risk${issuesCount === 1 ? "" : "s"} flagged`
        : "Privacy policy detected — no major risks flagged";
  } else if (levelHint === "policy-risk") {
    title = `${summary}: ${issuesCount} risk${issuesCount === 1 ? "" : "s"} flagged — click to review`;
  } else if (levelHint === "high-risk") {
    title = `${summary}: ${issuesCount} risk${issuesCount === 1 ? "" : "s"} flagged — click to review`;
  }

  await chrome.action.setTitle({ tabId, title });
}

export async function setScanningState(tabId) {
  await chrome.action.setBadgeText({ tabId, text: "" });
  await chrome.action.setTitle({ tabId, title: "Scanning..." });
}