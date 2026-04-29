import { norm } from "./utils.js";

const MAX_TEXT = 140000;
const MAX_SENTENCES = 1200;
const MIN_BLOCK_TEXT = 100;

const BLOCK_SELECTORS = [
  "main",
  "article",
  "[role='main']",
  ".privacy",
  ".policy",
  ".legal",
  ".content",
  ".main-content",
  ".entry-content",
  ".page-content",
];

function cleanClone(root) {
  const clone = root.cloneNode(true);
  clone
    .querySelectorAll(
      "script, style, noscript, svg, img, video, audio, iframe, canvas, form, button, input"
    )
    .forEach((el) => el.remove());

  clone
    .querySelectorAll("nav, footer, aside")
    .forEach((el) => el.remove());

  return clone;
}

function getTextFromElement(el) {
  return norm(el?.innerText || "");
}

function scoreBlock(el) {
  const text = getTextFromElement(el);
  if (text.length < MIN_BLOCK_TEXT) return -999;

  const pCount = el.querySelectorAll("p").length;
  const headingCount = el.querySelectorAll("h1, h2, h3").length;
  const linkCount = el.querySelectorAll("a").length;
  const textLen = text.length || 1;

  const linkDensity = linkCount / Math.max(1, textLen / 300);

  let score = 0;
  score += Math.min(8, Math.floor(text.length / 700));
  score += Math.min(4, pCount);
  score += Math.min(3, headingCount);
  score -= Math.min(6, Math.round(linkDensity));

  if (el.matches("main, article, [role='main']")) score += 4;
  if (el.matches(".privacy, .policy, .legal")) score += 3;

  return score;
}

export function getVisibleText() {
  const clone = cleanClone(document.documentElement);
  return norm(clone.innerText || "").slice(0, MAX_TEXT);
}

export function getCandidateTextBlocks() {
  const blocks = [];

  for (const sel of BLOCK_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      const txt = getTextFromElement(el);
      if (txt.length > MIN_BLOCK_TEXT) {
        blocks.push({
          text: txt,
          score: scoreBlock(el),
        });
      }
    });
  }

  if (!blocks.length) {
    const bodyText = norm(document.body?.innerText || "");
    if (bodyText) {
      blocks.push({
        text: bodyText,
        score: 0,
      });
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const block of blocks.sort((a, b) => b.score - a.score)) {
    const key = block.text.slice(0, 500);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(block);
    }
  }

  return deduped.map((b) => b.text).join("\n\n").slice(0, MAX_TEXT);
}

export function splitIntoSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => norm(s))
    .filter((s) => s.length >= 25)
    .slice(0, MAX_SENTENCES);
}

export function grabPolicyText({ preferFocusedBlocks = true } = {}) {
  const focused = preferFocusedBlocks ? getCandidateTextBlocks() : "";
  const fallback = !focused ? getVisibleText() : "";

  const text = focused || fallback;
  const sentences = splitIntoSentences(text);

  return {
    text,
    sentences,
    length: text.length,
    source: focused ? "focused-blocks" : "visible-page",
  };
}