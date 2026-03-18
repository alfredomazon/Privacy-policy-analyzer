// content.js
// Chunk-based privacy-policy heuristic detector with evidence cleanup.
// Distinguishes policy-page detection from policy severity.

(function () {
  const MAX_TEXT = 140000;
  const MAX_EVIDENCE_PER_ITEM = 3;
  const MAX_SENTENCES = 1200;

  const PAGE_HINTS = [
    /\bprivacy policy\b/i,
    /\bprivacy notice\b/i,
    /\bdata policy\b/i,
    /\bcookie policy\b/i,
    /\bterms of service\b/i,
    /\bterms and conditions\b/i,
    /\bconsumer privacy\b/i,
    /\byour privacy\b/i,
    /\bhow we collect\b/i,
    /\bhow we use\b/i,
    /\bpersonal information\b/i,
    /\bpersonal data\b/i,
    /\bdo not sell\b/i,
    /\bcalifornia privacy\b/i,
    /\bgdpr\b/i,
    /\bccpa\b/i,
    /\bcpra\b/i,
    /\bprivacy choices\b/i,
  ];

  const LINK_KEYWORDS = [
    "privacy",
    "policy",
    "terms",
    "legal",
    "cookies",
    "your privacy",
    "data policy",
    "consumer privacy",
    "do not sell",
    "privacy choices",
    "ccpa",
    "gdpr",
  ];

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
      /\bname\b/i, /\bemail\b/i, /\be-mail\b/i, /\bphone\b/i, /\btelephone\b/i,
      /\baddress\b/i, /\bpostal address\b/i, /\bip address\b/i, /\bidentifier\b/i,
      /\baccount information\b/i, /\bpersonal information\b/i, /\bpersonal data\b/i,
    ],
    device_network: [
      /\bdevice id\b/i, /\bdevice identifier\b/i, /\badvertising id\b/i, /\bip address\b/i,
      /\bbrowser type\b/i, /\boperating system\b/i, /\blog data\b/i, /\bnetwork information\b/i,
      /\bdiagnostic data\b/i, /\bcrash data\b/i, /\buser agent\b/i,
    ],
    location: [/\blocation\b/i, /\bprecise location\b/i, /\bapproximate location\b/i, /\bgeolocation\b/i, /\bgps\b/i],
    cookies_tracking: [
      /\bcookies?\b/i, /\bpixels?\b/i, /\bbeacons?\b/i, /\bsimilar technologies\b/i,
      /\btracking technologies\b/i, /\bdevice fingerprint/i, /\bfingerprinting\b/i,
      /\banalytics\b/i, /\badvertising\b/i,
    ],
    payment_financial: [
      /\bpayment\b/i, /\bcredit card\b/i, /\bdebit card\b/i, /\bbilling\b/i,
      /\bfinancial information\b/i, /\btransaction information\b/i, /\bbank\b/i,
    ],
    contacts_content: [
      /\bcontacts\b/i, /\bmessages\b/i, /\bphotos\b/i, /\bvideos\b/i,
      /\bfiles\b/i, /\bcontent you provide\b/i, /\bupload\b/i, /\buser content\b/i,
    ],
    biometric: [/\bbiometric\b/i, /\bfingerprint\b/i, /\bfaceprint\b/i, /\bface geometry\b/i, /\bvoiceprint\b/i, /\bretina\b/i, /\biris\b/i],
    sensitive: [
      /\bhealth\b/i, /\bmedical\b/i, /\bsocial security\b/i, /\bgovernment id\b/i,
      /\bdriver'?s license\b/i, /\bpassport\b/i, /\bracial\b/i, /\bethnic\b/i,
      /\breligious\b/i, /\bsexual orientation\b/i, /\bprecise geolocation\b/i,
    ],
    children: [/\bchildren\b/i, /\bchild\b/i, /\bminor\b/i, /\bunder 13\b/i, /\bunder thirteen\b/i, /\bparental consent\b/i, /\bcoppa\b/i],
    sharing_third_parties: [
      /\bthird part(y|ies)\b/i, /\bservice providers?\b/i, /\bvendors?\b/i,
      /\bpartners?\b/i, /\baffiliates?\b/i, /\bshare\b/i, /\bdisclose\b/i, /\bsell\b/i,
    ],
    retention_rights: [
      /\bretain\b/i, /\bretention\b/i, /\bdelete\b/i, /\bdeletion\b/i,
      /\baccess\b/i, /\bcorrection\b/i, /\bopt out\b/i, /\bdata rights\b/i,
      /\bprivacy rights\b/i, /\brequest\b/i,
    ],
  };

  const FINDING_RULES = [
    {
      category: "tracking",
      title: "This site may track your activity",
      summary:
        "The policy suggests the site may monitor how you use the service for analytics, advertising, or similar tracking purposes.",
      severity: "high",
      baseScore: 22,
      strong: [
        /\bpersonalized ads?\b/i,
        /\btargeted ads?\b/i,
        /\btargeted advertising\b/i,
        /\badvertising partners?\b/i,
        /\bcross[- ]site\b/i,
        /\bcross[- ]context behavioral advertising\b/i,
        /\btrack your activity\b/i,
        /\bcookies?, pixels?, (and )?similar technologies\b/i,
        /\bdevice fingerprint/i,
        /\bfingerprinting\b/i,
        /\bbehavioral advertising\b/i,
      ],
      medium: [
        /\banalytics\b/i, /\bmeasure engagement\b/i, /\busage information\b/i,
        /\buser activity\b/i, /\btrack\b/i, /\bcookies?\b/i, /\bpixels?\b/i, /\bbeacons?\b/i,
      ],
      negations: [
        /\bdo not track\b/i,
        /\bwe do not track\b/i,
        /\bnot use .* for advertising\b/i,
        /\bonly for authentication\b/i,
        /\bonly to keep you signed in\b/i,
      ],
    },
    {
      category: "sharing",
      title: "Your data may be shared with third parties",
      summary:
        "The policy suggests information may be shared with vendors, service providers, affiliates, or business partners.",
      severity: "medium",
      baseScore: 20,
      strong: [
        /\bshare .* with third part/i,
        /\bshared with .* partners?\b/i,
        /\bdisclose .* to third part/i,
        /\bsell .* personal information\b/i,
        /\bservice providers? and partners?\b/i,
      ],
      medium: [/\bservice providers?\b/i, /\bvendors?\b/i, /\bpartners?\b/i, /\baffiliates?\b/i, /\bshare\b/i, /\bdisclose\b/i],
      negations: [/\bdo not share\b/i, /\bwe do not sell\b/i, /\bwe do not disclose except\b/i],
    },
    {
      category: "sale",
      title: "This policy may allow sale or sale-like disclosure of data",
      summary:
        "The policy suggests personal information may be sold or disclosed in ways similar to a sale under privacy laws.",
      severity: "high",
      baseScore: 28,
      strong: [
        /\bsell personal information\b/i,
        /\bsale of personal information\b/i,
        /\bdo not sell or share\b/i,
        /\bshare .* cross-context behavioral advertising\b/i,
      ],
      medium: [/\bsell\b/i, /\bsale\b/i],
      negations: [/\bdo not sell personal information\b/i, /\bwe do not sell\b/i],
    },
    {
      category: "location",
      title: "Location data may be collected",
      summary:
        "The policy suggests the site may collect your location or geolocation information.",
      severity: "medium",
      baseScore: 18,
      strong: [/\bprecise location\b/i, /\bgps\b/i, /\bgeolocation\b/i],
      medium: [/\blocation\b/i, /\bapproximate location\b/i],
      negations: [/\bwe do not collect location\b/i],
    },
    {
      category: "biometric",
      title: "Biometric data may be collected",
      summary:
        "The policy suggests biometric information may be collected or processed.",
      severity: "high",
      baseScore: 30,
      strong: [/\bbiometric information\b/i, /\bfingerprint\b/i, /\bface geometry\b/i, /\bvoiceprint\b/i],
      medium: [/\bbiometric\b/i],
      negations: [],
    },
    {
      category: "sensitive",
      title: "Sensitive information may be collected",
      summary:
        "The policy suggests the site may collect or process sensitive personal information.",
      severity: "high",
      baseScore: 26,
      strong: [
        /\bsensitive personal information\b/i,
        /\bhealth information\b/i,
        /\bmedical information\b/i,
        /\bsocial security number\b/i,
        /\bgovernment-issued id\b/i,
      ],
      medium: [/\bhealth\b/i, /\bmedical\b/i, /\bgovernment id\b/i, /\bpassport\b/i],
      negations: [],
    },
    {
      category: "financial",
      title: "Payment or financial information may be collected",
      summary:
        "The policy suggests the site may collect payment, transaction, or other financial information.",
      severity: "medium",
      baseScore: 18,
      strong: [/\bcredit card\b/i, /\bdebit card\b/i, /\bbilling information\b/i, /\bfinancial information\b/i],
      medium: [/\bpayment\b/i, /\btransaction\b/i, /\bbilling\b/i],
      negations: [],
    },
    {
      category: "children",
      title: "The policy mentions children or minors",
      summary:
        "The policy includes language about children, minors, or parental consent.",
      severity: "low",
      baseScore: 14,
      strong: [/\bunder 13\b/i, /\bparental consent\b/i, /\bcoppa\b/i],
      medium: [/\bchildren\b/i, /\bminor\b/i],
      negations: [],
    },
    {
      category: "retention",
      title: "The policy mentions retention or privacy rights",
      summary:
        "The policy refers to retaining data, deleting data, access requests, or other user privacy rights.",
      severity: "low",
      baseScore: 12,
      strong: [
        /\bretain .* as long as necessary\b/i,
        /\brequest deletion\b/i,
        /\bright to access\b/i,
        /\bright to delete\b/i,
        /\bopt out\b/i,
      ],
      medium: [/\bretain\b/i, /\bretention\b/i, /\bdelete\b/i, /\baccess\b/i, /\bprivacy rights\b/i],
      negations: [],
    },
  ];

  function norm(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function getVisibleText() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, svg, img, video, audio").forEach((el) => el.remove());
    return norm(clone.innerText || "").slice(0, MAX_TEXT);
  }

  function getCandidateTextBlocks() {
    const selectors = [
      "main", "article", "[role='main']", ".privacy", ".policy", ".terms", ".legal",
      ".content", ".main-content", ".entry-content", ".page-content",
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

  function splitIntoSentences(text) {
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

  function countMatches(text, rules) {
    let n = 0;
    for (const r of rules) if (r.test(text)) n += 1;
    return n;
  }

  function hasAny(text, rules) {
    return rules.some((r) => r.test(text));
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

  function normalizeForCompare(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[“”"'`]/g, "")
      .trim();
  }

  function dedupeEvidence(items, maxItems = MAX_EVIDENCE_PER_ITEM) {
    const out = [];
    const seen = new Set();

    for (const item of items) {
      const raw = item.text || item;
      const normalized = normalizeForCompare(raw);

      if (!normalized) continue;

      let tooSimilar = false;
      for (const prior of seen) {
        if (
          normalized === prior ||
          normalized.includes(prior) ||
          prior.includes(normalized)
        ) {
          tooSimilar = true;
          break;
        }
      }

      if (tooSimilar) continue;

      seen.add(normalized);
      out.push(raw);

      if (out.length >= maxItems) break;
    }

    return out;
  }

  function shortenEvidence(text, maxLen = 220) {
    const clean = norm(text);
    if (clean.length <= maxLen) return clean;

    const slice = clean.slice(0, maxLen);
    const lastPunct = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("; "),
      slice.lastIndexOf(", ")
    );

    if (lastPunct > 80) {
      return slice.slice(0, lastPunct + 1).trim();
    }

    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 80) {
      return slice.slice(0, lastSpace).trim() + "…";
    }

    return slice.trim() + "…";
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

  function scorePolicyPage(text, titleText, urlText) {
    let score = 0;
    const combinedTitle = `${titleText} ${urlText}`;

    score += countMatches(text, PAGE_HINTS) * 2;
    score += countMatches(combinedTitle, PAGE_HINTS) * 3;

    if (/\/privacy|\/privacy-policy|\/terms|\/legal|\/cookies/i.test(urlText)) score += 4;
    if (/\bprivacy\b/i.test(titleText)) score += 4;
    if (/\bterms\b/i.test(titleText)) score += 3;
    if (/\bcookies\b/i.test(titleText)) score += 2;

    if (/personal information|personal data|how we collect|how we use|do not sell/i.test(text)) {
      score += 4;
    }

    return score;
  }

  function classifyPageConfidence(score) {
    if (score >= 14) return "High";
    if (score >= 8) return "Medium";
    return "Low";
  }

  function findBestPolicyLink() {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    let best = null;

    for (const a of anchors) {
      const hrefRaw = a.getAttribute("href") || "";
      const text = norm(a.innerText || a.getAttribute("aria-label") || "");
      const hay = `${text} ${hrefRaw}`.toLowerCase();

      let score = 0;

      for (const kw of LINK_KEYWORDS) {
        if (hay.includes(kw)) score += 2;
      }

      if (/privacy policy/i.test(hay)) score += 5;
      if (/terms of service|terms and conditions/i.test(hay)) score += 4;
      if (/cookies policy/i.test(hay)) score += 3;
      if (/do not sell/i.test(hay)) score += 3;

      if (a.closest("footer, .footer, nav")) score += 1;

      try {
        const abs = new URL(hrefRaw, window.location.href).toString();
        if (/\/privacy|\/privacy-policy|\/terms|\/legal|\/cookies/i.test(abs)) score += 4;

        if (!best || score > best.score) {
          best = { url: abs, score, text };
        }
      } catch {}
    }

    return best ? { bestPolicyLink: best.url, bestLinkScore: best.score } : { bestPolicyLink: "", bestLinkScore: 0 };
  }

  function extractDataCategories(sentences) {
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
    if (negated && strongHits === 0 && mediumHits <= 1 && adTechHits === 0) return "low";
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
      return "The policy mentions tracking-related technology, but the surrounding language appears more limited to login, security, or basic service functionality.";
    }

    if (permissionLimited) {
      return "The policy mentions this data use, but it appears limited by user permission, opt-in, or similar controls.";
    }

    if (negated) {
      return "The policy mentions this issue, but the surrounding language appears to limit, deny, or narrow it.";
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

  function extractFindings(sentences) {
    const chunks = buildChunks(sentences);
    const units = chunks.length ? chunks : sentences;
    const findings = [];

    for (const rule of FINDING_RULES) {
      const matched = [];

      for (const unit of units) {
        const detail = evidenceScore(rule, unit);
        if (detail.score > 0) {
          matched.push({
            text: unit,
            ...detail,
          });
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

      findings.push({
        category: rule.category,
        title: rule.title,
        summary: buildAdjustedSummary(rule, negated, permissionLimited, safeContext),
        confidence,
        severity,
        score,
        evidence: topEvidence,
      });
    }

    return mergeFindings(findings);
  }

  function buildResult() {
    const titleText = norm(document.title || "");
    const urlText = window.location.href;
    const mainText = getCandidateTextBlocks();
    const fullText = getVisibleText();

    const pageText = mainText || fullText;
    const sentences = splitIntoSentences(pageText);

    const pageScore = scorePolicyPage(pageText, titleText, urlText);
    const isLikelyPolicyPage = pageScore >= 8;
    const confidence = classifyPageConfidence(pageScore);

    const { bestPolicyLink, bestLinkScore } = findBestPolicyLink();
    const { dataCollected, dataEvidence } = extractDataCategories(sentences);
    const findings = isLikelyPolicyPage ? extractFindings(sentences) : [];

    return {
      isLikelyPolicyPage,
      score: Math.max(0, Math.min(10, Math.round(pageScore / 2))),
      confidence,
      bestPolicyLink,
      bestLinkScore,
      reasons: findings.slice(0, 6).map((f) => f.title),
      findings,
      dataCollected,
      dataEvidence,
      pageTitle: titleText,
      pageUrl: urlText,
    };
  }

  function sendResult() {
    try {
      const result = buildResult();
      chrome.runtime.sendMessage({
        type: "heuristicResult",
        result,
      });
    } catch (err) {
      console.error("Heuristic content script failed:", err);
    }
  }

  function debounce(fn, wait = 700) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  const debouncedSend = debounce(sendResult, 900);

  if (document.readyState === "complete" || document.readyState === "interactive") {
    sendResult();
  } else {
    window.addEventListener("DOMContentLoaded", sendResult, { once: true });
  }

  window.addEventListener("load", debouncedSend, { once: true });

  const observer = new MutationObserver(() => {
    debouncedSend();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();