import {
  norm,
  countMatches,
  hasAny,
  dedupeEvidence,
  shortenEvidence,
} from "./utils.js";

const MAX_EVIDENCE_PER_ITEM = 3;

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

// Paste your full existing FINDING_RULES here.
const FINDING_RULES = [
  {
    category: "tracking",
    title: "Uses tracking technologies",
    summary:
      "This policy says it uses cookies, analytics, pixels, or similar technologies that may track your activity.",
    severity: "medium",
    baseScore: 12,
    strong: [
      /\btracking technologies\b/i,
      /\bdevice fingerprint(?:ing)?\b/i,
      /\bcross[- ]site tracking\b/i,
      /\bcross[- ]context behavioral advertising\b/i,
      /\btracking pixels?\b/i,
      /\bweb beacons?\b/i,
      /\btargeted advertising\b/i,
      /\bbehavioral advertising\b/i,
      /\bremarketing\b/i,
      /\bretargeting\b/i,
      /\bpersonalized ads?\b/i,
      /\badvertising partners?\b/i,
    ],
    medium: [
      /\bcookies?\b/i,
      /\banalytics\b/i,
      /\bpixels?\b/i,
      /\bbeacons?\b/i,
      /\bsimilar technologies\b/i,
      /\bmeasure ad performance\b/i,
      /\bserve ads?\b/i,
      /\bdeliver ads?\b/i,
    ],
    negations: [
      /\bwe do not use tracking\b/i,
      /\bwe do not track\b/i,
      /\bdo not track your activity\b/i,
      /\bnot used for advertising\b/i,
    ],
  },

  {
    category: "sharing",
    title: "Shares data with third parties",
    summary:
      "This policy says it may share or disclose your information to third parties, partners, vendors, or affiliates.",
    severity: "medium",
    baseScore: 12,
    strong: [
      /\bshare your personal information\b/i,
      /\bdisclose your personal information\b/i,
      /\bshare with third parties\b/i,
      /\bshare with partners\b/i,
      /\bdisclose to partners\b/i,
      /\bsell or share\b/i,
      /\bprovide to third parties\b/i,
      /\btransfer your information\b/i,
    ],
    medium: [
      /\bthird part(y|ies)\b/i,
      /\bservice providers?\b/i,
      /\bvendors?\b/i,
      /\bpartners?\b/i,
      /\baffiliates?\b/i,
      /\bdisclose\b/i,
      /\bshare\b/i,
    ],
    negations: [
      /\bwe do not share your personal information\b/i,
      /\bwe do not disclose your personal information\b/i,
      /\bwe do not sell or share\b/i,
    ],
  },

  {
    category: "sale",
    title: "May sell personal information",
    summary:
      "This policy contains language suggesting personal information may be sold, shared for advertising, or exchanged for commercial benefit.",
    severity: "high",
    baseScore: 16,
    strong: [
      /\bsell your personal information\b/i,
      /\bsale of personal information\b/i,
      /\bpersonal information may be sold\b/i,
      /\bshare for cross[- ]context behavioral advertising\b/i,
      /\bexchange.*for.*valuable consideration\b/i,
    ],
    medium: [
      /\bsell\b/i,
      /\bsold\b/i,
      /\bvaluable consideration\b/i,
      /\bdo not sell or share\b/i,
    ],
    negations: [
      /\bwe do not sell your personal information\b/i,
      /\bwe do not sell personal information\b/i,
      /\bnot sold\b/i,
    ],
  },

  {
    category: "location",
    title: "Collects location data",
    summary:
      "This policy says it may collect location or geolocation information.",
    severity: "medium",
    baseScore: 10,
    strong: [
      /\bprecise location\b/i,
      /\bprecise geolocation\b/i,
      /\bgps location\b/i,
      /\bgeolocation data\b/i,
      /\blocation information\b/i,
    ],
    medium: [
      /\blocation\b/i,
      /\bgeolocation\b/i,
      /\bgps\b/i,
      /\bapproximate location\b/i,
    ],
    negations: [
      /\bwe do not collect location\b/i,
      /\bwe do not collect geolocation\b/i,
    ],
  },

  {
    category: "financial",
    title: "Collects payment or financial data",
    summary:
      "This policy says it may collect payment, billing, banking, or other financial information.",
    severity: "high",
    baseScore: 14,
    strong: [
      /\bcredit card number\b/i,
      /\bdebit card number\b/i,
      /\bbank account\b/i,
      /\bfinancial account\b/i,
      /\bpayment card\b/i,
      /\bbilling information\b/i,
      /\bpayment information\b/i,
    ],
    medium: [
      /\bpayment\b/i,
      /\bbilling\b/i,
      /\btransaction information\b/i,
      /\bfinancial information\b/i,
      /\bbank\b/i,
      /\bcredit card\b/i,
      /\bdebit card\b/i,
    ],
    negations: [
      /\bwe do not store your payment\b/i,
      /\bwe do not collect financial information\b/i,
    ],
  },

  {
    category: "sensitive",
    title: "Collects sensitive personal data",
    summary:
      "This policy mentions collection of sensitive data such as health, government IDs, precise geolocation, or other highly personal information.",
    severity: "high",
    baseScore: 16,
    strong: [
      /\bsocial security number\b/i,
      /\bdriver'?s license\b/i,
      /\bpassport number\b/i,
      /\bgovernment[- ]issued id\b/i,
      /\bhealth information\b/i,
      /\bmedical information\b/i,
      /\bprecise geolocation\b/i,
      /\brace or ethnicity\b/i,
      /\breligious beliefs?\b/i,
      /\bsexual orientation\b/i,
    ],
    medium: [
      /\bhealth\b/i,
      /\bmedical\b/i,
      /\bgovernment id\b/i,
      /\bpassport\b/i,
      /\bdriver'?s license\b/i,
      /\bracial\b/i,
      /\bethnic\b/i,
      /\breligious\b/i,
    ],
    negations: [
      /\bwe do not collect sensitive personal information\b/i,
      /\bwe do not collect health information\b/i,
    ],
  },

  {
    category: "biometric",
    title: "Collects biometric information",
    summary:
      "This policy mentions biometric identifiers or biometric information such as fingerprints, face geometry, or voiceprints.",
    severity: "high",
    baseScore: 16,
    strong: [
      /\bbiometric identifiers?\b/i,
      /\bbiometric information\b/i,
      /\bfingerprint data\b/i,
      /\bface geometry\b/i,
      /\bvoiceprint\b/i,
      /\bretina scan\b/i,
      /\biris scan\b/i,
    ],
    medium: [
      /\bbiometric\b/i,
      /\bfingerprint\b/i,
      /\bfaceprint\b/i,
      /\bvoiceprint\b/i,
      /\bretina\b/i,
      /\biris\b/i,
    ],
    negations: [
      /\bwe do not collect biometric information\b/i,
    ],
  },

  {
    category: "contacts_content",
    title: "Accesses contacts or personal content",
    summary:
      "This policy says it may collect or access contacts, messages, photos, files, uploads, or other user content.",
    severity: "high",
    baseScore: 13,
    strong: [
      /\baccess your contacts\b/i,
      /\bcollect your contacts\b/i,
      /\baccess your photos\b/i,
      /\bcollect your messages\b/i,
      /\buser content\b/i,
      /\bcontent you provide\b/i,
      /\bfiles you upload\b/i,
    ],
    medium: [
      /\bcontacts\b/i,
      /\bmessages\b/i,
      /\bphotos\b/i,
      /\bvideos\b/i,
      /\bfiles\b/i,
      /\buploads?\b/i,
      /\bcontent\b/i,
    ],
    negations: [
      /\bwe do not access your contacts\b/i,
      /\bwe do not collect your photos\b/i,
    ],
  },

  {
    category: "identifiers",
    title: "Collects identifying information",
    summary:
      "This policy says it may collect identifying information such as your name, email, phone number, IP address, or account details.",
    severity: "medium",
    baseScore: 9,
    strong: [
      /\bpersonal information we collect\b/i,
      /\bname, email(?: address)?(?:,| and)? phone\b/i,
      /\bip address\b/i,
      /\baccount information\b/i,
      /\bidentifiers?\b/i,
    ],
    medium: [
      /\bname\b/i,
      /\bemail\b/i,
      /\bphone\b/i,
      /\baddress\b/i,
      /\bip address\b/i,
      /\baccount information\b/i,
      /\bpersonal data\b/i,
      /\bpersonal information\b/i,
    ],
    negations: [
      /\bwe do not collect personal information\b/i,
    ],
  },

  {
    category: "device_network",
    title: "Collects device or network information",
    summary:
      "This policy says it may collect technical data about your device, browser, network, diagnostics, or usage.",
    severity: "medium",
    baseScore: 10,
    strong: [
      /\bdevice identifiers?\b/i,
      /\badvertising id\b/i,
      /\bip address\b/i,
      /\buser agent\b/i,
      /\boperating system\b/i,
      /\bcrash data\b/i,
      /\bdiagnostic data\b/i,
    ],
    medium: [
      /\bdevice information\b/i,
      /\bbrowser type\b/i,
      /\blog data\b/i,
      /\bnetwork information\b/i,
      /\bdiagnostics\b/i,
      /\bdevice id\b/i,
    ],
    negations: [
      /\bwe do not collect device information\b/i,
    ],
  },

  {
    category: "retention",
    title: "Describes data retention",
    summary:
      "This policy explains how long data may be stored or retained.",
    severity: "low",
    baseScore: 6,
    strong: [
      /\bretain your information\b/i,
      /\bdata retention\b/i,
      /\bstore your information for\b/i,
      /\bkept for as long as necessary\b/i,
    ],
    medium: [
      /\bretain\b/i,
      /\bretention\b/i,
      /\bstored\b/i,
      /\bkept\b/i,
    ],
    negations: [],
  },

  {
    category: "rights",
    title: "Mentions privacy rights or controls",
    summary:
      "This policy explains user rights such as access, deletion, correction, or opting out.",
    severity: "low",
    baseScore: 6,
    strong: [
      /\bright to access\b/i,
      /\bright to delete\b/i,
      /\bright to correct\b/i,
      /\bright to opt out\b/i,
      /\bprivacy rights\b/i,
      /\bsubmit a request\b/i,
    ],
    medium: [
      /\baccess\b/i,
      /\bdelete\b/i,
      /\bdeletion\b/i,
      /\bcorrection\b/i,
      /\bopt out\b/i,
      /\brequest\b/i,
    ],
    negations: [],
  },

  {
    category: "children",
    title: "References children or minors",
    summary:
      "This policy contains language about children, minors, parental consent, or age restrictions.",
    severity: "low",
    baseScore: 7,
    strong: [
      /\bchildren('?s)? privacy\b/i,
      /\bunder 13\b/i,
      /\bparental consent\b/i,
      /\bnot intended for children\b/i,
      /\bcoppa\b/i,
    ],
    medium: [
      /\bchildren\b/i,
      /\bchild\b/i,
      /\bminor\b/i,
      /\bunder thirteen\b/i,
    ],
    negations: [],
  },
];
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

function detectSectionContext(text) {
  const t = String(text || "").toLowerCase();

  if (/information we collect|data we collect/.test(t)) return "collection";
  if (/how we use|use of information/.test(t)) return "use";
  if (/how we share|share with|disclose/.test(t)) return "sharing";
  if (/cookies|tracking/.test(t)) return "tracking";
  if (/your rights|privacy rights/.test(t)) return "rights";

  return "general";
}

function detectAmbiguity(matched) {
  let hasNegation = false;
  let hasSharing = false;

  for (const m of matched) {
    if (m.negated) hasNegation = true;
    if (sentenceHasAdTech(m.text) || /share|third parties|partners/i.test(m.text)) {
      hasSharing = true;
    }
  }

  return hasNegation && hasSharing;
}

function sentenceStrength(rule, text) {
  const strongHits = countMatches(text, rule.strong || []);
  const mediumHits = countMatches(text, rule.medium || []);
  const adTechHits = sentenceHasAdTech(text) ? 1 : 0;
  return strongHits * 5 + mediumHits * 2 + adTechHits * 3;
}

function extractBestSnippet(rule, text) {
  const parts = String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => norm(s))
    .filter((s) => s.length >= 25);

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

  return shortenEvidence(ranked[0]?.text || text);
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

  const section = detectSectionContext(text);
  if (section === "sharing") score += 2;
  if (section === "tracking") score += 2;

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
    section,
  };
}

function shouldCountAsRisk(finding) {
  const severity = String(finding?.severity || "").toLowerCase();
  const confidence = String(finding?.confidence || "").toLowerCase();

  const severityQualifies = severity === "high" || severity === "medium";
  const confidenceQualifies = confidence === "likely" || confidence === "explicit";

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
    const ambiguity = detectAmbiguity(matched);

    let confidence = determineConfidence(strongHits, mediumHits, negated, adTechHits);
    let severity = rule.severity;

    if (rule.category === "tracking" && adTechHits > 0) severity = "high";
    if (rule.category === "sharing" && strongHits > 0) severity = "high";
    if (rule.category === "identifiers" && strongHits === 0) severity = "medium";

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
    if (ambiguity) score += 2;

    score = Math.max(4, score);

    let summary = buildAdjustedSummary(rule, negated, permissionLimited, safeContext);

    if (ambiguity) {
      summary =
        "This policy contains mixed or conflicting language about this issue. It may limit certain practices but still describes broad data use or sharing.";
    }

    const finding = {
      category: rule.category,
      title: rule.title,
      summary,
      confidence,
      severity,
      score,
      evidence: topEvidence,
      ambiguity,
    };

    finding.countAsRisk = shouldCountAsRisk(finding);
    findings.push(finding);
  }

  return mergeFindings(findings);
}

export function analyzePolicy(sentences) {
  const { dataCollected, dataEvidence } = extractDataCategories(sentences);
  const findings = extractFindings(sentences);

  return {
    dataCollected,
    dataEvidence,
    findings,
  };
}