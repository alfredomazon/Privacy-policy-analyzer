function categoryWeight(category, pageContext = "unknown") {
  const base = {
    tracking: 18,
    sharing: 18,
    location: 10,
    financial: 22,
    sensitive: 24,
    identifiers: 6,
  };

  let weight = base[category] || 0;

  if (pageContext === "checkout" && category === "financial") weight += 8;
  if (pageContext === "location" && category === "location") weight += 6;
  if (
    pageContext === "marketing" &&
    (category === "tracking" || category === "sharing")
  ) {
    weight += 6;
  }
  if (pageContext === "account" && category === "identifiers") weight += 4;

  return weight;
}

function detectPageContext() {
  const href = String(location.href || "").toLowerCase();
  const title = String(document.title || "").toLowerCase();
  const text = `${href} ${title}`;

  if (
    text.includes("checkout") ||
    text.includes("cart") ||
    text.includes("payment") ||
    text.includes("billing")
  ) {
    return "checkout";
  }

  if (
    text.includes("account") ||
    text.includes("sign in") ||
    text.includes("login") ||
    text.includes("profile")
  ) {
    return "account";
  }

  if (
    text.includes("store locator") ||
    text.includes("find store") ||
    text.includes("location") ||
    text.includes("near me")
  ) {
    return "location";
  }

  if (
    text.includes("support") ||
    text.includes("contact") ||
    text.includes("help")
  ) {
    return "support";
  }

  if (
    text.includes("privacy") ||
    text.includes("policy") ||
    text.includes("notice")
  ) {
    return "policy";
  }

  return "marketing";
}

function computeBehaviorIntensity(trackerSignals = {}) {
  let intensity = 0;

  if (trackerSignals.tracking) intensity += 24;
  if (trackerSignals.sharing) intensity += 24;
  if (trackerSignals.location) intensity += 16;
  if (trackerSignals.payment_financial) intensity += 22;
  if (trackerSignals.sensitive) intensity += 24;
  if (trackerSignals.identifiers) intensity += 8;

  if (trackerSignals.confidence === "high") intensity += 12;
  else if (trackerSignals.confidence === "medium") intensity += 6;

  if (
    Array.isArray(trackerSignals.trackerHits) &&
    trackerSignals.trackerHits.length >= 2
  ) {
    intensity += 8;
  }

  if (
    Array.isArray(trackerSignals.fingerprintingHints) &&
    trackerSignals.fingerprintingHints.length > 0
  ) {
    intensity += 15;
  }

  return Math.min(100, intensity);
}

function getPolicySignals(policyResult = {}) {
  const findings = Array.isArray(policyResult?.findings)
    ? policyResult.findings
    : [];

  const dataCollected =
    policyResult && typeof policyResult.dataCollected === "object"
      ? policyResult.dataCollected
      : {};

  const dataEvidence =
    policyResult && typeof policyResult.dataEvidence === "object"
      ? policyResult.dataEvidence
      : {};

  function categoryAliases(category) {
    const map = {
      tracking: ["tracking", "cookies_tracking"],
      sharing: ["sharing", "sharing_third_parties"],
      location: ["location"],
      financial: ["financial", "payment_financial"],
      sensitive: ["sensitive", "biometric", "children"],
      identifiers: ["identifiers", "device_network"],
    };

    return map[category] || [category];
  }

  function buildCategory(category, fallbackKeys = []) {
    const aliases = categoryAliases(category);

    const relevant = findings.filter((f) =>
      aliases.includes(String(f?.category || "").toLowerCase())
    );

    const fallbackDetected = fallbackKeys.some((key) => !!dataCollected[key]);

    const fallbackEvidenceCount = fallbackKeys.reduce((sum, key) => {
      const arr = Array.isArray(dataEvidence?.[key]) ? dataEvidence[key] : [];
      return sum + arr.length;
    }, 0);

    if (!relevant.length && !fallbackDetected) {
      return {
        detected: false,
        clarity: "none",
        explicit: false,
      };
    }

    const best = [...relevant].sort(
      (a, b) => (b?.score || 0) - (a?.score || 0)
    )[0];

    if (best) {
      const confidence = String(best?.confidence || "").toLowerCase();

      let clarity = "low";
      let explicit = false;

      if (confidence === "explicit") {
        clarity = "high";
        explicit = true;
      } else if (confidence === "likely") {
        clarity = "medium";
      } else {
        clarity = "low";
      }

      return {
        detected: true,
        clarity,
        explicit,
      };
    }

    // Fallback path when findings did not map directly,
    // but extracted category evidence is still strong.
    if (fallbackDetected) {
      let clarity = "low";

      if (fallbackEvidenceCount >= 2) clarity = "medium";
      if (fallbackEvidenceCount >= 4) clarity = "high";

      return {
        detected: true,
        clarity,
        explicit: clarity === "high",
      };
    }

    return {
      detected: false,
      clarity: "none",
      explicit: false,
    };
  }

  return {
    tracking: buildCategory("tracking", ["cookies_tracking"]),
    sharing: buildCategory("sharing", ["sharing_third_parties"]),
    location: buildCategory("location", ["location"]),
    financial: buildCategory("financial", ["payment_financial"]),
    sensitive: buildCategory("sensitive", [
      "sensitive",
      "biometric",
      "children",
    ]),
    identifiers: buildCategory("identifiers", [
      "identifiers",
      "device_network",
    ]),
  };
}

function getBehaviorSignals(trackerSignals = {}) {
  return {
    tracking: !!trackerSignals.tracking,
    sharing: !!trackerSignals.sharing,
    location: !!trackerSignals.location,
    financial: !!trackerSignals.payment_financial,
    sensitive: !!trackerSignals.sensitive,
    identifiers: !!trackerSignals.identifiers,
  };
}

export function comparePolicyAndBehavior(
  policySignals = {},
  behaviorSignals = {},
  pageContext = "unknown"
) {
  const categories = [
    "tracking",
    "sharing",
    "location",
    "financial",
    "sensitive",
    "identifiers",
  ];

  const matches = [];
  const mismatches = [];
  const warnings = [];

  for (const category of categories) {
    const policyObj = policySignals?.[category] || {
      detected: false,
      clarity: "none",
      explicit: false,
    };

    const policyHas = !!policyObj.detected;
    const policyClearlyDiscloses =
      policyObj.clarity === "medium" || policyObj.clarity === "high";

    const behaviorHas = !!behaviorSignals?.[category];

    if (policyClearlyDiscloses && behaviorHas) {
      matches.push({
        category,
        type: "aligned_positive",
        message: `${category} is clearly disclosed in the policy and also visible in page behavior.`,
      });
      continue;
    }

    if (!policyHas && !behaviorHas) {
      matches.push({
        category,
        type: "aligned_negative",
        message: `${category} is not strongly indicated in either the policy or visible page behavior.`,
      });
      continue;
    }

    if (!policyClearlyDiscloses && behaviorHas) {
      mismatches.push({
        category,
        type: "undisclosed_behavior",
        weight: categoryWeight(category, pageContext),
        message: `${category} behavior was detected on this page, but is not clearly disclosed in the policy.`,
      });
      continue;
    }

    if (policyHas && !behaviorHas) {
      warnings.push({
        category,
        type: "policy_only",
        internalOnly: true,
        weight: 0,
        message: `${category} is mentioned in the policy, but was not clearly detected on this page.`,
      });
      continue;
    }

    if (policyHas && behaviorHas && !policyClearlyDiscloses) {
      warnings.push({
        category,
        type: "weak_disclosure",
        internalOnly: true,
        weight: 0,
        message: `${category} may be mentioned in the policy, but the disclosure does not appear especially clear.`,
      });
    }
  }

  return { matches, mismatches, warnings };
}

export function scoreMismatch(compareResult, trackerSignals = {}) {
  const mismatches = Array.isArray(compareResult?.mismatches)
    ? compareResult.mismatches
    : [];

  const intensity = computeBehaviorIntensity(trackerSignals);

  const mismatchWeight = mismatches.reduce(
    (sum, item) => sum + (item?.weight || 0),
    0
  );

  const categories = mismatches.map((x) =>
    String(x?.category || "").toLowerCase()
  );

  const hasHighImpactMismatch =
    categories.includes("sensitive") ||
    categories.includes("financial") ||
    categories.includes("tracking") ||
    categories.includes("sharing");

  const hasMultipleMeaningfulMismatches = mismatches.length >= 2;

  const severeBehavior = intensity >= 35;
  const verySevereBehavior = intensity >= 55;

  const shouldShow =
    mismatches.length > 0 &&
    ((hasHighImpactMismatch && severeBehavior) ||
      hasMultipleMeaningfulMismatches ||
      verySevereBehavior);

  if (!shouldShow) {
    return {
      show: false,
      score: 0,
      level: "hidden",
      intensity,
    };
  }

  let score = mismatchWeight + Math.round(intensity * 0.45);
  score = Math.max(0, Math.min(100, score));

  let level = "warning";
  if (score >= 65) level = "strong_mismatch";
  else if (score >= 40) level = "partial_mismatch";

  return {
    show: true,
    score,
    level,
    intensity,
  };
}

export function buildMismatchSummary(level, compareResult) {
  const categories = (compareResult?.mismatches || []).map((x) =>
    String(x?.category || "").toLowerCase()
  );

  if (level === "strong_mismatch") {
    return "High-impact behavior was detected on this page that is not clearly disclosed in the policy.";
  }

  if (level === "partial_mismatch" || level === "warning") {
    if (categories.includes("tracking") || categories.includes("sharing")) {
      return "Tracking or third-party behavior was detected on this page without clear policy disclosure.";
    }

    if (categories.includes("financial") || categories.includes("sensitive")) {
      return "High-impact data behavior was detected on this page without clear policy disclosure.";
    }

    return "Some meaningful page behavior was detected without clear policy disclosure.";
  }

  return "";
}

export function computePolicyBehaviorMismatch(policyResult, trackerSignals = {}) {
  const pageContext = detectPageContext();
  const policy = getPolicySignals(policyResult);
  const behavior = getBehaviorSignals(trackerSignals);
  const compareResult = comparePolicyAndBehavior(policy, behavior, pageContext);
  const scored = scoreMismatch(compareResult, trackerSignals);

  if (!scored.show) {
    return {
      show: false,
      pageContext,
      policy,
      behavior,
      score: 0,
      level: "hidden",
      summary: "",
      matches: compareResult.matches,
      mismatches: [],
      warnings: compareResult.warnings,
      confidence: trackerSignals.confidence || "low",
    };
  }

  const summary = buildMismatchSummary(scored.level, compareResult);

  return {
    show: true,
    pageContext,
    policy,
    behavior,
    score: scored.score,
    level: scored.level,
    summary,
    matches: compareResult.matches,
    mismatches: compareResult.mismatches,
    warnings: compareResult.warnings,
    confidence: trackerSignals.confidence || "low",
  };
}