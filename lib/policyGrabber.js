import { norm } from "./utils.js";

const MAX_TEXT = 140000;
const MAX_SENTENCES = 1200;
const MIN_BLOCK_TEXT = 100;

const BLOCK_SELECTORS = [
  "main",
  "article",
  "[role='main']",
  "section",
  ".privacy",
  ".policy",
  ".legal",
  ".content",
  ".main-content",
  ".entry-content",
  ".page-content",
  "[id*='privacy' i]",
  "[class*='privacy' i]",
  "[id*='policy' i]",
  "[class*='policy' i]",
];

const STRUCTURAL_BREAK_SELECTORS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "summary",
  "[role='heading']",
  "[role='tab']",
  "button[aria-controls]",
  "button[aria-expanded]",
];

function cleanClone(root) {
  const clone = root.cloneNode(true);
  clone
    .querySelectorAll(
      "script, style, noscript, svg, img, video, audio, iframe, canvas, form, input, select, textarea"
    )
    .forEach((el) => el.remove());

  clone
    .querySelectorAll("nav, footer, aside")
    .forEach((el) => el.remove());

  return clone;
}

function normalizeExtractedText(text = "") {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function appendBoundary(el) {
  try {
    el.appendChild(document.createTextNode("\n"));
  } catch {
    // Ignore nodes that cannot be edited in a cloned tree.
  }
}

function tableToReadableText(table) {
  const rows = Array.from(table.querySelectorAll("tr"));
  const headerCells = Array.from(
    rows[0]?.querySelectorAll("th") || []
  ).map((cell) => norm(cell.textContent || ""));
  const bodyRows = rows.filter((row) => row.querySelectorAll("td").length);

  return bodyRows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((cell, index) => {
        const value = norm(cell.textContent || "");
        const header = headerCells[index] || "";

        if (!value) return "";
        return header && !value.toLowerCase().startsWith(header.toLowerCase())
          ? `${header}: ${value}`
          : value;
      });

      return cells.filter(Boolean).join("; ");
    })
    .filter(Boolean)
    .join(".\n");
}

function prepareStructuredClone(el) {
  const clone = cleanClone(el);

  clone.querySelectorAll("br").forEach((node) => {
    try {
      node.replaceWith(document.createTextNode("\n"));
    } catch {}
  });

  clone.querySelectorAll("table").forEach((table) => {
    const tableText = tableToReadableText(table);
    if (!tableText) return;

    try {
      table.replaceWith(document.createTextNode(`\n${tableText}\n`));
    } catch {}
  });

  clone
    .querySelectorAll(STRUCTURAL_BREAK_SELECTORS.join(","))
    .forEach(appendBoundary);

  return clone;
}

function getTextFromElement(el) {
  if (!el) return "";

  const clone = prepareStructuredClone(el);
  const visibleText = normalizeExtractedText(clone.innerText || "");
  const fullText = normalizeExtractedText(clone.textContent || "");

  if (fullText.length > visibleText.length * 1.15) {
    return fullText;
  }

  return visibleText || fullText;
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
  const clone = prepareStructuredClone(document.documentElement);
  const visibleText = normalizeExtractedText(clone.innerText || "");
  const fullText = normalizeExtractedText(clone.textContent || "");
  const text = fullText.length > visibleText.length * 1.15 ? fullText : visibleText;

  return text.slice(0, MAX_TEXT);
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
    const bodyText = norm(document.body?.innerText || document.body?.textContent || "");
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
    const duplicateNestedBlock = deduped.some((existing) => {
      if (block.text.length < 250 || existing.text.length < 250) return false;
      return existing.text.includes(block.text) || block.text.includes(existing.text);
    });

    if (seen.has(key) || duplicateNestedBlock) continue;

    seen.add(key);
    deduped.push(block);
  }

  return deduped.map((b) => b.text).join("\n\n").slice(0, MAX_TEXT);
}

export function splitIntoSentences(text) {
  return String(text || "")
    .replace(
      /([a-z)])((?:We|You|Your|Where|How|What|When|Who|Why|Data|Information|Personal|Collection|Sharing|Use|Cookies|Contact)\b)/g,
      "$1\n$2"
    )
    .replace(/([a-z0-9)])([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,5}:)/g, "$1\n$2")
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
