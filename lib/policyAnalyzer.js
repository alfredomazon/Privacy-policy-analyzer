


import {
  norm,
  countMatches,
  hasAny,
  dedupeEvidence,
  shortenEvidence,
} from "./utils.js";

const MAX_TEXT = 140000;
const MAX_EVIDENCE_PER_ITEM = 3;
const MAX_SENTENCES = 1200;

const NEGATION_PATTERNS = [
  /\bdo not\b/i,
  /\bdoes not\b/i,
  /\bdon't\b/i,
  /\bdoesn't\b/i,
  /\bnever\b/i,
  /\bwithout\b/i,
  /\bexcept\b/i,
  /\bunless\b/i,
];

const PERMISSION_PATTERNS = [
  /\bwith your permission\b/i,
  /\bwith your consent\b/i,
  /\bif you enable\b/i,
  /\bif enabled\b/i,
  /\bif you allow\b/i,
  /\bif you choose to\b/i,
  /\bif you opt in\b/i,
  /\bonly when you\b/i,
  /\byou may choose\b/i,
];

const SAFE_FUNCTION_PATTERNS = [
  /\bauthentication\b/i,
  /\bsecurity\b/i,
  /\bfraud prevention\b/i,
  /\bfraud detection\b/i,
  /\blogin\b/i,
  /\bsigned in\b/i,
  /\bsign in\b/i,
  /\bsession cookie\b/i,
  /\bservice functionality\b/i,
  /\bprovide the service\b/i,
  /\bmaintain the service\b/i,
  /\bdebug(ging)?\b/i,
  /\bdiagnostics\b/i,
];

const AD_TECH_PATTERNS = [
  /\bpersonalized ads?\b/i,
  /\btargeted ads?\b/i,
  /\btargeted advertising\b/i,
  /\badvertising partners?\b/i,
  /\bad networks?\b/i,
  /\bcross[- ]site\b/i,
  /\bcross[- ]context\b/i,
  /\bbehavioral advertising\b/i,
  /\bremarketing\b/i,
  /\bretargeting\b/i,
  /\bmeasure ad performance\b/i,
  /\bdeliver ads?\b/i,
  /\bserve ads?\b/i,
];

const DATA_CATEGORY_RULES = {
  identifiers: [
    /\bname\b/i,
    /\bemail\b/i,
    /\be-mail\b/i,
    /\bphone\b/i,
    /\btelephone\b/i,
    /\baddress\b/i,
    /\bpostal address\b/i,
    /\bip address\b/i,
    /\bidentifier\b/i,
    /\baccount information\b/i,
    /\bpersonal information\b/i,
    /\bpersonal data\b/i,
  ],
  device_network: [
    /\bdevice id\b/i,
    /\bdevice identifier\b/i,
    /\badvertising id\b/i,
    /\bip address\b/i,
    /\bbrowser type\b/i,
    /\boperating system\b/i,
    /\blog data\b/i,
    /\bnetwork information\b/i,
    /\bdiagnostic data\b/i,
    /\bcrash data\b/i,
    /\buser agent\b/i,
  ],
  location: [
    /\blocation\b/i,
    /\bprecise location\b/i,
    /\bapproximate location\b/i,
    /\bgeolocation\b/i,
    /\bgps\b/i,
  ],
  cookies_tracking: [
    /\bcookies?\b/i,
    /\bpixels?\b/i,
    /\bbeacons?\b/i,
    /\bsimilar technologies\b/i,
    /\btracking technologies\b/i,
    /\bdevice fingerprint/i,
    /\bfingerprinting\b/i,
    /\banalytics\b/i,
    /\badvertising\b/i,
  ],
  payment_financial: [
    /\bpayment\b/i,
    /\bcredit card\b/i,
    /\bdebit card\b/i,
    /\bbilling\b/i,
    /\bfinancial information\b/i,
    /\btransaction information\b/i,
    /\bbank\b/i,
  ],
  contacts_content: [
    /\bcontacts\b/i,
    /\bmessages\b/i,
    /\bphotos\b/i,
    /\bvideos\b/i,
    /\bfiles\b/i,
    /\bcontent you provide\b/i,
    /\bupload\b/i,
    /\buser content\b/i,
  ],
  biometric: [
    /\bbiometric\b/i,
    /\bfingerprint\b/i,
    /\bfaceprint\b/i,
    /\bface geometry\b/i,
    /\bvoiceprint\b/i,
    /\bretina\b/i,
    /\biris\b/i,
  ],
  sensitive: [
    /\bhealth\b/i,
    /\bmedical\b/i,
    /\bsocial security\b/i,
    /\bgovernment id\b/i,
    /\bdriver'?s license\b/i,
    /\bpassport\b/i,
    /\bracial\b/i,
    /\bethnic\b/i,
    /\breligious\b/i,
    /\bsexual orientation\b/i,
    /\bprecise geolocation\b/i,
  ],
  children: [
    /\bchildren\b/i,
    /\bchild\b/i,
    /\bminor\b/i,
    /\bunder 13\b/i,
    /\bunder thirteen\b/i,
    /\bparental consent\b/i,
    /\bcoppa\b/i,
  ],
  sharing_third_parties: [
    /\bthird part(y|ies)\b/i,
    /\bservice providers?\b/i,
    /\bvendors?\b/i,
    /\bpartners?\b/i,
    /\baffiliates?\b/i,
    /\bshare\b/i,
    /\bdisclose\b/i,
    /\bsell\b/i,
  ],
  retention_rights: [
    /\bretain\b/i,
    /\bretention\b/i,
    /\bdelete\b/i,
    /\bdeletion\b/i,
    /\baccess\b/i,
    /\bcorrection\b/i,
    /\bopt out\b/i,
    /\bdata rights\b/i,
    /\bprivacy rights\b/i,
    /\brequest\b/i,
  ],
};

const FINDING_RULES = [/* keep your existing FINDING_RULES exactly here */];

export function getVisibleText() {
  const clone = document.documentElement.cloneNode(true);
  clone
    .querySelectorAll("script, style, noscript, svg, img, video, audio")
    .forEach((el) => el.remove());
  return norm(clone.innerText || "").slice(0, MAX_TEXT);
}

export function getCandidateTextBlocks() {
  const selectors = [
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

  const blocks = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      const txt = norm(el.innerText || "");
      if (txt.length > 100) blocks.push(txt);
    });
  }

  if (!blocks.length) {
    const bodyText = norm(document.body?.innerText || "");
    if (bodyText) blocks.push(bodyText);
  }

  return blocks.join("\n\n").slice(0, MAX_TEXT);
}

export function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => norm(s))
    .filter((s) => s.length >= 25)
    .slice(0, MAX_SENTENCES);
}

function buildChunks(sentences) {
  const chunks = [];

  for (let i = 0; i < sentences.length; i++) {
    const s1 = sentences[i];
    const s2 = sentences[i + 1];
    const s3 = sentences[i + 2];

    if (s1) chunks.push(s1);
    if (s1 && s2) chunks.push(`${s1} ${s2}`);
    if (s1 && s2 && s3) chunks.push(`${s1} ${s2} ${s3}`);
  }

  return Array.from(new Set(chunks));
}

function getEvidence(units, rules, limit = MAX_EVIDENCE_PER_ITEM) {
  const hits = [];
  for (const u of units) {
    if (hasAny(u, rules)) {
      hits.push(u);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

function sentenceHasNegation(text) {
  return hasAny(text, NEGATION_PATTERNS);
}

function sentenceHasPermission(text) {
  return hasAny(text, PERMISSION_PATTERNS);
}

function sentenceHasSafeFunction(text) {
  return hasAny(text, SAFE_FUNCTION_PATTERNS);
}

function sentenceHasAdTech(text) {
  return hasAny(text, AD_TECH_PATTERNS);
}

function sentenceStrength(rule, text) {
  const strongHits = countMatches(text, rule.strong || []);
  const mediumHits = countMatches(text, rule.medium || []);
  const adTechHits = sentenceHasAdTech(text) ? 1 : 0;
  return strongHits * 5 + mediumHits * 2 + adTechHits * 3;
}

function extractBestSnippet(rule, text) {
  const parts = splitIntoSentences(text);

  if (!parts.length) return shortenEvidence(text);

  const ranked = parts
    .map((p) => ({
      text: p,
      strength: sentenceStrength(rule, p),
      length: p.length,
    }))
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      return a.length - b.length;
    });

  const best = ranked[0]?.text || text;
  return shortenEvidence(best);
}

function cleanEvidenceForFinding(rule, matchedItems, maxItems = MAX_EVIDENCE_PER_ITEM) {
  const sorted = [...matchedItems].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.text.length - b.text.length;
  });

  const snippets = sorted.map((m) => extractBestSnippet(rule, m.text));
  return dedupeEvidence(snippets, maxItems);
}

export function extractDataCategories(sentences) {
  const dataCollected = {};
  const dataEvidence = {};

  for (const [key, patterns] of Object.entries(DATA_CATEGORY_RULES)) {
    const evidence = getEvidence(sentences, patterns);
    dataCollected[key] = evidence.length > 0;
    dataEvidence[key] = evidence;
  }

  return { dataCollected, dataEvidence };
}

function determineConfidence(strongHits, mediumHits, negated, adTechHits) {
  if (negated && strongHits === 0 && mediumHits <= 1 && adTechHits === 0) {
    return "low";
  }
  if (strongHits >= 2 || adTechHits >= 2) return "explicit";
  if (strongHits >= 1 || mediumHits >= 3 || adTechHits >= 1) return "likely";
  if (mediumHits >= 1) return "possible";
  return "low";
}

function maybeLowerSeverityForContext(rule, text, confidence) {
  const s = text.toLowerCase();

  if (rule.category === "tracking") {
    if (/sign in|signed in|authentication|security|fraud prevention|session cookie/.test(s)) {
      return confidence === "explicit" ? "medium" : "low";
    }
  }

  if (rule.category === "location") {
    if (/with your permission|if you enable|opt in/.test(s)) {
      return "low";
    }
  }

  if (rule.category === "sharing") {
    if (/service providers?.*perform services|on our behalf|to operate the service/.test(s)) {
      return "low";
    }
  }

  return rule.severity;
}

function buildAdjustedSummary(rule, negated, permissionLimited, safeContext) {
  if (!negated && !permissionLimited && !safeContext) return rule.summary;

  if (rule.category === "tracking" && safeContext) {
    return "This policy mentions cookies or tracking tools, but they appear to be used mainly for login, security, or basic site features.";
  }

  if (permissionLimited) {
    if (rule.category === "location") {
      return "This policy mentions location data, but says it may only be collected if you allow it.";
    }
    return "This policy mentions this data use, but says it may only happen if you choose to allow it.";
  }

  if (negated) {
    if (rule.category === "sale") {
      return "This policy mentions selling or sharing data, but says it may not sell your personal information.";
    }
    if (rule.category === "tracking") {
      return "This policy mentions tracking-related language, but says some tracking may not apply.";
    }
    if (rule.category === "sharing") {
      return "This policy mentions sharing data, but says some types of sharing may be limited.";
    }
    return "This policy mentions this issue, but says it may be limited or may not apply in some cases.";
  }

  return rule.summary;
}

function evidenceScore(rule, text) {
  const strongHits = countMatches(text, rule.strong || []);
  const mediumHits = countMatches(text, rule.medium || []);
  const explicitNegation = hasAny(text, rule.negations || []);
  const genericNegation = sentenceHasNegation(text);
  const permissionLimited = sentenceHasPermission(text);
  const safeContext = sentenceHasSafeFunction(text);
  const adTechHits = sentenceHasAdTech(text) ? 1 : 0;

  let score = 0;
  score += strongHits * 4;
  score += mediumHits * 2;
  score += adTechHits * 3;

  if (explicitNegation) score -= 5;
  else if (genericNegation && strongHits === 0) score -= 2;

  if (permissionLimited) score -= 2;
  if (safeContext && rule.category === "tracking") score -= 3;
  if (safeContext && rule.category === "sharing") score -= 1;

  return {
    strongHits,
    mediumHits,
    adTechHits,
    negated: explicitNegation || (genericNegation && score <= 2),
    permissionLimited,
    safeContext,
    score,
  };
}

function shouldCountAsRisk(finding) {
  const severity = String(finding?.severity || "").toLowerCase();
  const confidence = String(finding?.confidence || "").toLowerCase();

  const severityQualifies = severity === "high" || severity === "medium";
  const confidenceQualifies =
    confidence === "likely" || confidence === "explicit";

  const excludedCategories = new Set(["retention", "children"]);

  if (!severityQualifies || !confidenceQualifies) return false;
  if (excludedCategories.has(String(finding?.category || "").toLowerCase())) {
    return false;
  }

  return true;
}

function mergeFindings(rawFindings) {
  const byCategory = new Map();

  for (const item of rawFindings) {
    const existing = byCategory.get(item.category);
    if (!existing || item.score > existing.score) {
      byCategory.set(item.category, item);
    }
  }

  return Array.from(byCategory.values()).sort((a, b) => b.score - a.score);
}

export function extractFindings(sentences) {
  const chunks = buildChunks(sentences);
  const units = chunks.length ? chunks : sentences;
  const findings = [];

  for (const rule of FINDING_RULES) {
    const matched = [];

    for (const unit of units) {
      const detail = evidenceScore(rule, unit);
      if (detail.score > 0) {
        matched.push({ text: unit, ...detail });
      }
    }

    if (!matched.length) continue;

    matched.sort((a, b) => b.score - a.score);

    const topEvidence = cleanEvidenceForFinding(rule, matched, MAX_EVIDENCE_PER_ITEM);
    const strongHits = matched.reduce((n, m) => n + m.strongHits, 0);
    const mediumHits = matched.reduce((n, m) => n + m.mediumHits, 0);
    const adTechHits = matched.reduce((n, m) => n + m.adTechHits, 0);
    const negated = matched.some((m) => m.negated);
    const permissionLimited = matched.some((m) => m.permissionLimited);
    const safeContext = matched.some((m) => m.safeContext);

    let confidence = determineConfidence(strongHits, mediumHits, negated, adTechHits);
    let severity = rule.severity;

    if (topEvidence.length) {
      severity = maybeLowerSeverityForContext(rule, topEvidence[0], confidence);
    }

    let score = rule.baseScore;

    if (confidence === "explicit") score += 8;
    else if (confidence === "likely") score += 4;
    else if (confidence === "low") score -= 6;

    if (severity === "high") score += 4;
    else if (severity === "low") score -= 4;

    if (negated && confidence !== "explicit") score -= 6;
    if (permissionLimited) score -= 3;
    if (safeContext && rule.category === "tracking") score -= 4;

    score = Math.max(4, score);

    const finding = {
      category: rule.category,
      title: rule.title,
      summary: buildAdjustedSummary(rule, negated, permissionLimited, safeContext),
      confidence,
      severity,
      score,
      evidence: topEvidence,
    };

    finding.countAsRisk = shouldCountAsRisk(finding);
    findings.push(finding);
  }

  return mergeFindings(findings);
}