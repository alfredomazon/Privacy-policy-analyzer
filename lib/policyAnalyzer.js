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
  /\bdon['’]t\b/i,
  /\bdoesn['’]t\b/i,
  /\bwill not\b/i,
  /\bwon['’]t\b/i,
  /\bnever\b/i,
  /\bwithout\b/i,
  /\bexcept\b/i,
  /\bunless\b/i,
];

const DENIED_PRACTICE_PATTERNS = [
  /\b(?:we|company|service|site|app|advertisers?|partners?|service providers?)\s+(?:do not|does not|don['’]t|doesn['’]t|will not|won['’]t|never)\s+(?:collect|use|share|sell|disclose|process|show|serve|deliver|target|track|profile|combine|obtain|receive|store|retain|work with|partner with)\b/i,
  /\b(?:we|company|service|site|app|advertisers?|partners?|service providers?)\s+(?:do not|does not|don['’]t|doesn['’]t|will not|won['’]t|never)\s+show\b[^.!?]{0,180}\b(?:personalized ads?|targeted ads?|targeted advertising)\b/i,
  /\b(?:[a-z][a-z0-9&.' -]{1,80}|we|our services?|the company)\s+(?:do not|does not|don['’]t|doesn['’]t|will not|won['’]t|never)\s+(?:sell|rent|share|use|disclose|process|collect|target|profile|work with|partner with)\b/i,
  /\b(?:do not|does not|don['’]t|doesn['’]t|will not|won['’]t|never|not)\s+(?:sell|rent|share|use|disclose|process|collect|target|profile)\b[^.!?]{0,220}\b(?:personal information|personal data|student personal data|sensitive|advertising|targeted advertising)\b/i,
  /\b(?:not|never)\s+(?:used|shared|sold|collected|processed|stored|retained)\b[^.!?]{0,180}\b(?:advertising|tracking|sensitive|biometric|location|financial|personal information|personal data)\b/i,
  /\bnever\s+(?:work|partner)\s+with\b[^.!?]{0,120}\bdata brokers?\b/i,
  /\bhas no access to\b[^.!?]{0,120}\bcookies?\b/i,
];

const CONTRASTING_ACTIVE_PRACTICE_PATTERNS = [
  /\b(?:but|however|except|unless)\b[^.!?]{0,220}\b(?:we|company|service|site|app|advertisers?|partners?|service providers?)\s+(?:may\s+|also\s+|will\s+|can\s+)?(?:collect|use|share|sell|disclose|process|show|serve|deliver|target|track|profile|combine|obtain|receive|store|retain)\b/i,
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

const ACTION_DEPENDENCY_PATTERNS = [
  /\bwhen you (?:create|register|sign up|make a purchase|place an order|contact|upload|submit|provide|enable|use|interact)\b/i,
  /\bif you (?:provide|submit|choose|enable|allow|opt in|make a purchase|place an order|contact|upload)\b/i,
  /\bwhere you (?:provide|submit|choose|enable|allow)\b/i,
  /\bwhen (?:making|you make) (?:a )?(?:purchase|payment|order)\b/i,
  /\bwith your (?:consent|permission|authorization)\b/i,
  /\bat your (?:direction|request)\b/i,
  /\byou may provide\b/i,
  /\binformation you provide\b/i,
  /\bcontent you provide\b/i,
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

const POLICY_REFERENCE_ONLY_PATTERNS = [
  /\b(?:please )?(?:read|review|see|refer to|visit|consult)\b[^.!?]{0,180}\b(?:privacy policy|privacy notice|privacy statement|data privacy policy|consumer health data privacy policy|state data privacy notice|supplemental privacy)\b/i,
  /\b(?:privacy policy|privacy notice|privacy statement|data privacy policy|consumer health data privacy policy|state data privacy notice|supplemental privacy)\b[^.!?]{0,180}\b(?:additional information|more information|for details|to learn more)\b/i,
  /\bproduct-specific details\b[^.!?]{0,160}\b(?:section|privacy|notice|policy)\b/i,
];

const DIRECT_POLICY_PRACTICE_PATTERNS = [
  /\b(?:we|company|service|site|app|advertisers?|partners?|service providers?)\s+(?:may\s+|also\s+|will\s+|automatically\s+)?(?:collect|use|share|sell|disclose|retain|combine|obtain|receive|process)\b/i,
  /\b(?:collect|use|share|sell|disclose|retain|combine|obtain|receive|process)\s+(?:your|personal|data|information)\b/i,
];

const PRIVACY_CHOICE_ONLY_PATTERNS = [
  /\bright to (?:request|opt out|limit|delete|access|correct)\b/i,
  /\brequest that .* not sell\b/i,
  /\bdo not sell(?: or share)?\b/i,
  /\bopt out of\b/i,
  /\bprivacy choices?\b/i,
  /\byour choices?\b/i,
  /\baboutads\.info\/choices\b/i,
  /\bnetwork advertising initiative\b/i,
  /\bdigital advertising alliance\b/i,
  /\bnevada resident\b[^.!?]{0,160}\bnot sell\b/i,
];

const LEGAL_DISCLOSURE_INVENTORY_PATTERNS = [
  /\bcategories of (?:personal information|personal data|third parties|recipients)\b[^.!?]{0,260}\b(?:disclose|sell|share|sold|shared)\b/i,
  /\bcategories of third parties to whom we\b[^.!?]{0,180}\b(?:disclose|sell|share|sold|shared)\b/i,
  /\bthe categories of personal information\b[^.!?]{0,220}\b(?:sold|shared|disclosed)\b/i,
  /\bto whom we (?:disclose|sell|share)\b[^.!?]{0,120}\b(?:personal information|personal data)\b/i,
  /\b(?:disclose|sell|share),? or (?:disclose|sell|share)\b[^.!?]{0,160}\bcategories\b/i,
  /\bdata type\b[^.!?]{0,120}\bwhere we got it\b[^.!?]{0,120}\bwhy collected\b[^.!?]{0,120}\bdisclosed to\b/i,
];

const ACTIVE_SALE_OR_AD_SHARING_PATTERNS = [
  /\bwe\s+(?:may\s+|also\s+|will\s+|can\s+)?(?:sell|share)\b[^.!?]{0,220}\b(?:personal information|personal data|targeted advertising|cross[- ]context|behavioral advertising|valuable consideration)\b/i,
  /\bwe\s+(?:may\s+|also\s+|will\s+|can\s+)?(?:use|disclose)\b[^.!?]{0,220}\b(?:personal information|personal data)\b[^.!?]{0,180}\b(?:targeted advertising|cross[- ]context|behavioral advertising)\b/i,
  /\b(?:share|sell|disclose)\s+(?:your )?(?:personal )?(?:information|data)\b[^.!?]{0,220}\b(?:targeted advertising|cross[- ]context|behavioral advertising|valuable consideration|advertising partners?)\b/i,
  /\bshares? (?:your )?(?:personal )?(?:information|data)\b[^.!?]{0,180}\bfor (?:the )?purposes? of targeted advertising\b/i,
  /\b(?:sold|shared) (?:for|with)\b[^.!?]{0,180}\b(?:targeted advertising|advertising partners?|cross[- ]context|behavioral advertising)\b/i,
];

const NON_GEO_LOCATION_PATTERNS = [
  /\bstorage location\b/i,
  /\bdata (?:retention|storage) and storage location\b/i,
  /\bstored? (?:in|on|at) (?:servers?|systems?|locations?)\b/i,
  /\bserver location\b/i,
  /\bwindow\.location\b/i,
  /\blocation\.href\b/i,
  /\bprivacy policy location\b/i,
];

const LIMITED_LEGAL_OR_RIGHTS_CONTEXT_PATTERNS = [
  /\bvital interests?\b/i,
  /\blife is in danger\b/i,
  /\burgent medical situation\b/i,
  /\bconfirm your identity\b[^.!?]{0,180}\b(?:request|privacy rights?|access|delete|deletion|correct|correction|opt out)\b/i,
  /\bbefore processing your request\b[^.!?]{0,180}\b(?:identity|request|privacy rights?|access|delete|deletion|correct|correction|opt out)\b/i,
  /\bdisclose\b[^.!?]{0,140}\bfor legal reasons\b/i,
  /\blegally prohibited\b/i,
];

const NON_USER_CONTENT_PATTERNS = [
  /\bcookies?\b[^.!?]{0,120}\btext files?\b/i,
  /\btext files?\b[^.!?]{0,120}\bplaced on (?:your )?(?:computer|device)\b/i,
  /\bcookie files?\b/i,
];

const ACTIVE_PRACTICE_PATTERNS = [
  /\bwe\s+(?:may\s+|also\s+|will\s+|do\s+|can\s+)?(?:collect|use|share|sell|disclose|combine|obtain|receive|process)\b/i,
  /\b(?:we|our partners?|advertisers?)\s+(?:use|share|sell|disclose|combine|collect)\b/i,
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

const HIGH_RISK_SECONDARY_USE_PATTERNS = [
  /\btargeted ads?\b/i,
  /\btargeted advertising\b/i,
  /\bcross[- ]site\b/i,
  /\bcross[- ]context\b/i,
  /\bbehavioral advertising\b/i,
  /\bpersonalized ads?\b/i,
  /\bremarketing\b/i,
  /\bretargeting\b/i,
  /\bsell or share\b/i,
  /\bsell (?:your )?(?:personal )?information\b/i,
  /\bsale of (?:personal )?information\b/i,
  /\bvaluable consideration\b/i,
  /\bdata brokers?\b/i,
  /\bmonetiz(?:e|ation)\b/i,
  /\bprofiling\b/i,
  /\bprofiled\b/i,
  /\binfer(?:red)? (?:preferences|interests|characteristics)\b/i,
  /\bsegments?\b/i,
  /\blookalike audiences?\b/i,
  /\bcombine .* (?:information|data)\b/i,
];

const SECONDARY_USE_PATTERNS = [
  ...AD_TECH_PATTERNS,
  /\bsell or share\b/i,
  /\bsell (?:your )?(?:personal )?information\b/i,
  /\bsale of (?:personal )?information\b/i,
  /\badvertising partners?\b/i,
  /\bmarketing partners?\b/i,
  /\bad networks?\b/i,
  /\bdata brokers?\b/i,
  /\bcommercial purposes?\b/i,
  /\bmonetiz(?:e|ation)\b/i,
  /\bprofiling\b/i,
  /\bprofiled\b/i,
  /\binfer(?:red)? (?:preferences|interests|characteristics)\b/i,
  /\bsegments?\b/i,
  /\blookalike audiences?\b/i,
  /\bcombine .* (?:information|data)\b/i,
];

const HIGH_RISK_OUTSIDE_DATA_PATTERNS = [
  /\bdata brokers?\b/i,
  /\binformation (?:we )?(?:receive|obtain|collect) from (?:advertisers|data providers|public sources)\b/i,
  /\bfrom (?:advertisers|data providers|public sources)\b/i,
  /\boffline sources?\b/i,
  /\bpublic(?:ly)? available (?:sources|information)\b/i,
  /\bcombine (?:the )?information (?:we collect )?with information from\b/i,
  /\bappend (?:data|information)\b/i,
  /\benrich (?:your )?(?:profile|information|data)\b/i,
];

const OUTSIDE_DATA_PATTERNS = [
  /\bdata brokers?\b/i,
  /\bfrom (?:third parties|partners|advertisers|data providers|public sources)\b/i,
  /\binformation (?:we )?(?:receive|obtain|collect) from (?:third parties|partners|advertisers|data providers|public sources)\b/i,
  /\boffline sources?\b/i,
  /\bpublic(?:ly)? available (?:sources|information)\b/i,
  /\bcombine (?:the )?information (?:we collect )?with information from\b/i,
  /\bappend (?:data|information)\b/i,
  /\benrich (?:your )?(?:profile|information|data)\b/i,
];

const OPERATIONAL_PARTNER_DATA_PATTERNS = [
  /\bfrom (?:partners|third parties) (?:whose|that) (?:products|services)\b[^.!?]{0,180}\b(?:access|pay for|interact with|purchase|order|use)\b/i,
  /\b(?:partners|third parties) (?:whose|that) (?:products|services)\b[^.!?]{0,180}\b(?:access|pay for|interact with|purchase|order|use)\b/i,
  /\bpayment processors?\b/i,
  /\bdelivery partners?\b/i,
  /\bshipping partners?\b/i,
];

const BROAD_PARTNER_PATTERNS = [
  /\baffiliates and partners\b/i,
  /\bthird parties and partners\b/i,
  /\bpartners, affiliates\b/i,
  /\bvendors, partners\b/i,
  /\bbusiness partners\b/i,
  /\bfor business purposes\b/i,
  /\bfor commercial purposes\b/i,
  /\bincluding but not limited to\b/i,
];

const CATEGORY_EXPECTED_USE_PATTERNS = {
  financial: [
    /\bprocess (?:your )?(?:payment|transaction|order)\b/i,
    /\bcomplete (?:your )?(?:purchase|transaction|order)\b/i,
    /\bfulfill (?:your )?(?:purchase|request|order)\b/i,
    /\bbilling\b/i,
    /\bpayment processing\b/i,
    /\bpayment details?\b/i,
    /\bpayment information\b/i,
    /\bpayment card\b/i,
    /\bcredit card number\b/i,
    /\bdebit card number\b/i,
    /\bpurchase (?:products?|services?)\b/i,
    /\bpurchase information\b/i,
    /\bwhen you (?:make a purchase|place an order|pay)\b/i,
    /\bwhen you .*?\bpurchase\b/i,
  ],
  device_network: [
    /\bdiagnostics?\b/i,
    /\bcrash data\b/i,
    /\bdebug(?:ging)?\b/i,
    /\bsecurity\b/i,
    /\bfraud\b/i,
    /\bperformance\b/i,
    /\boperate (?:the|our) service\b/i,
    /\bprovide (?:the|our) service\b/i,
  ],
  identifiers: [
    /\bcreate (?:an )?account\b/i,
    /\bregister\b/i,
    /\bcontact (?:us|support)\b/i,
    /\bcustomer service\b/i,
    /\bprocess your orders?\b/i,
    /\bdeliver (?:your )?(?:order|products?)\b/i,
    /\bprovide (?:the|our) service\b/i,
  ],
  location: [
    /\bshipping address\b/i,
    /\bdeliver (?:your )?(?:order|products?)\b/i,
    /\bstore locator\b/i,
    /\bnearby (?:store|location)\b/i,
    /\blocal services\b/i,
    /\bwith your permission\b/i,
    /\bif you enable\b/i,
    /\bif you allow\b/i,
  ],
  contacts_content: [
    /\bcontent you provide\b/i,
    /\bfiles you upload\b/i,
    /\bwhen you upload\b/i,
    /\bwhen you submit\b/i,
    /\bat your direction\b/i,
  ],
  sharing: [
    /\bservice providers?.*(?:perform services|on our behalf|operate (?:the service|checkout)|payment processing|process payments|fulfill orders?|shipping|customer support)\b/i,
    /\bvendors?.*(?:perform services|on our behalf|operate (?:the service|checkout)|payment processing|process payments|fulfill orders?|shipping|customer support)\b/i,
    /\bprocessors?.*(?:on our behalf|process payments|provide services)\b/i,
  ],
  tracking: [
    /\bsession cookies?\b/i,
    /\bpreferences?\b/i,
    /\bremember (?:your )?(?:preferences|settings|cart)\b/i,
    /\bshopping cart\b/i,
    /\baggregate analytics\b/i,
    /\bunderstand usage\b/i,
    /\bimprove (?:the|our) service\b/i,
    /\bperformance\b/i,
    /\bdiagnostics?\b/i,
    /\bdebug(?:ging)?\b/i,
  ],
};

const PURPOSE_RULES = {
  provide_service: {
    label: "Provide or operate the service",
    patterns: [
      /\bprovide (?:the|our) service\b/i,
      /\boperate (?:the|our) service\b/i,
      /\bdeliver (?:the|our) products?\b/i,
      /\bprocess your orders?\b/i,
      /\bfulfill your requests?\b/i,
    ],
  },
  security: {
    label: "Security and fraud prevention",
    patterns: [
      /\bsecurity\b/i,
      /\bfraud prevention\b/i,
      /\bfraud detection\b/i,
      /\bprotect\b/i,
      /\bauthentication\b/i,
    ],
  },
  analytics: {
    label: "Analytics or measurement",
    patterns: [
      /\banalytics\b/i,
      /\bmeasure\b/i,
      /\bunderstand usage\b/i,
      /\bimprove (?:the|our) service\b/i,
      /\bperformance\b/i,
    ],
  },
  advertising: {
    label: "Advertising or personalization",
    patterns: AD_TECH_PATTERNS,
  },
  communication: {
    label: "Communications",
    patterns: [
      /\bcommunicat(?:e|ion)\b/i,
      /\bemail you\b/i,
      /\bcontact you\b/i,
      /\bsend you\b/i,
      /\bmarketing messages?\b/i,
    ],
  },
  legal: {
    label: "Legal compliance",
    patterns: [
      /\blegal obligation\b/i,
      /\bcomply with (?:law|legal)\b/i,
      /\blaw enforcement\b/i,
      /\bregulatory\b/i,
    ],
  },
};

const RECIPIENT_RULES = {
  service_providers: {
    label: "Service providers",
    patterns: [/\bservice providers?\b/i, /\bvendors?\b/i, /\bprocessors?\b/i],
  },
  affiliates: {
    label: "Affiliates",
    patterns: [/\baffiliates?\b/i, /\bsubsidiar(?:y|ies)\b/i, /\bcorporate family\b/i],
  },
  advertising_partners: {
    label: "Advertising partners",
    patterns: [/\badvertising partners?\b/i, /\bad networks?\b/i, /\bmarketing partners?\b/i],
  },
  analytics_partners: {
    label: "Analytics partners",
    patterns: [/\banalytics providers?\b/i, /\banalytics partners?\b/i],
  },
  authorities: {
    label: "Legal authorities",
    patterns: [/\blaw enforcement\b/i, /\bgovernment authorities?\b/i, /\bcourt order\b/i],
  },
};

const CONTROL_RULES = {
  access: {
    label: "Access",
    patterns: [/\bright to access\b/i, /\baccess your (?:data|information)\b/i],
  },
  delete: {
    label: "Deletion",
    patterns: [/\bright to delete\b/i, /\bdelete your (?:data|information)\b/i, /\bdeletion\b/i],
  },
  correct: {
    label: "Correction",
    patterns: [/\bright to correct\b/i, /\bcorrect your (?:data|information)\b/i, /\bcorrection\b/i],
  },
  opt_out: {
    label: "Opt out",
    patterns: [/\bopt out\b/i, /\bopt-out\b/i, /\bunsubscribe\b/i],
  },
  appeal: {
    label: "Appeal",
    patterns: [/\bappeal\b/i],
  },
};

const PRIVACY_RIGHT_RULES = {
  access: {
    label: "Access",
    patterns: [...CONTROL_RULES.access.patterns, /\bmay access\b/i],
  },
  delete: {
    label: "Deletion",
    patterns: [...CONTROL_RULES.delete.patterns, /\bmay .*delete\b/i],
  },
  correct: {
    label: "Correction",
    patterns: [...CONTROL_RULES.correct.patterns, /\bmay .*correct\b/i],
  },
  opt_out: {
    label: "Opt out",
    patterns: [
      /\bopt out\b/i,
      /\bopt-out\b/i,
      /\bunsubscribe\b/i,
      /\bright to opt out\b/i,
      /\bdo not sell or share\b/i,
    ],
  },
  portability: {
    label: "Portability",
    patterns: [
      /\bdata portability\b/i,
      /\bright to portability\b/i,
      /\bportable format\b/i,
    ],
  },
  limit_sensitive: {
    label: "Limit sensitive data use",
    patterns: [
      /\blimit (?:the )?use of (?:your )?sensitive\b/i,
      /\blimit use and disclosure of sensitive\b/i,
    ],
  },
  withdraw_consent: {
    label: "Withdraw consent",
    patterns: [/\bwithdraw (?:your )?consent\b/i, /\brevoke (?:your )?consent\b/i],
  },
  appeal: CONTROL_RULES.appeal,
  non_discrimination: {
    label: "Non-discrimination",
    patterns: [/\bnon[- ]discrimination\b/i, /\bwill not discriminate\b/i],
  },
};

const JURISDICTION_RULES = {
  california: {
    label: "California",
    patterns: [/\bcalifornia\b/i, /\bccpa\b/i, /\bcpra\b/i],
  },
  eea_uk: {
    label: "EEA/UK",
    patterns: [
      /\bgdpr\b/i,
      /\beea\b/i,
      /\beuropean economic area\b/i,
      /\beuropean union\b/i,
      /\bunited kingdom\b/i,
      /\buk gdpr\b/i,
    ],
  },
  colorado: {
    label: "Colorado",
    patterns: [/\bcolorado\b/i, /\bcolorado privacy act\b/i],
  },
  connecticut: {
    label: "Connecticut",
    patterns: [/\bconnecticut\b/i, /\bctdpa\b/i],
  },
  virginia: {
    label: "Virginia",
    patterns: [/\bvirginia\b/i, /\bvcdpa\b/i],
  },
  utah: {
    label: "Utah",
    patterns: [/\butah\b/i, /\bucpa\b/i],
  },
  oregon: {
    label: "Oregon",
    patterns: [/\boregon\b/i, /\bocpa\b/i],
  },
  texas: {
    label: "Texas",
    patterns: [/\btexas\b/i, /\btdpsa\b/i],
  },
  canada: {
    label: "Canada",
    patterns: [/\bcanada\b/i, /\bpipeda\b/i],
  },
};

const RETENTION_RULES = {
  stated: [
    /\bretain\b/i,
    /\bretention\b/i,
    /\bstore your information\b/i,
    /\bkept for\b/i,
    /\bfor as long as\b/i,
  ],
  specific: [
    /\bfor (?:up to )?\d+\s+(?:days?|months?|years?)\b/i,
    /\bno longer than \d+\s+(?:days?|months?|years?)\b/i,
    /\bwithin \d+\s+(?:days?|months?|years?)\b/i,
    /\bafter \d+\s+(?:days?|months?|years?)\b/i,
    /\buntil (?:your )?account (?:is )?(?:deleted|closed|terminated)\b/i,
    /\bdelete(?:d)? within \d+\s+(?:days?|months?|years?)\b/i,
  ],
  vague: [
    /\bas long as necessary\b/i,
    /\bas needed\b/i,
    /\bwhere required\b/i,
    /\bunless (?:a )?longer retention\b/i,
    /\bfor business purposes\b/i,
    /\bfor legal purposes\b/i,
    /\bindefinitely\b/i,
  ],
};

const VAGUE_DISCLOSURE_PATTERNS = [
  /\bmay (?:collect|use|share|disclose|process|retain)\b/i,
  /\bincluding but not limited to\b/i,
  /\bsuch as\b/i,
  /\bother (?:information|data|purposes)\b/i,
  /\bvarious (?:purposes|reasons)\b/i,
  /\bas necessary\b/i,
  /\bas needed\b/i,
  /\bfrom time to time\b/i,
  /\bbusiness purposes\b/i,
  /\bcommercial purposes\b/i,
  /\baffiliates and partners\b/i,
  /\bthird parties and partners\b/i,
];

const SPECIFIC_DISCLOSURE_PATTERNS = [
  /\bname,?\s+(?:email|e-mail|phone|address)\b/i,
  /\bemail address\b/i,
  /\bip address\b/i,
  /\bpayment information\b/i,
  /\bdevice identifier\b/i,
  /\bservice providers?\b/i,
  /\badvertising partners?\b/i,
  /\banalytics providers?\b/i,
  /\bto process your orders?\b/i,
  /\bto provide (?:the|our) service\b/i,
  /\bto prevent fraud\b/i,
  /\bfor (?:up to )?\d+\s+(?:days?|months?|years?)\b/i,
];

const SALE_DENIAL_PATTERNS = [
  /\bdo not sell\b/i,
  /\bdoes not sell\b/i,
  /\bdoesn['’]t sell\b/i,
  /\bnever sell\b/i,
  /\bwill not sell\b/i,
  /\bwon['’]t sell\b/i,
  /\bnot sell or rent\b/i,
  /\bnot use or share\b[^.!?]{0,160}\badvertising\b/i,
  /\bnot sell your personal information\b/i,
  /\bnot sell (?:or share )?(?:your )?(?:personal )?(?:information|data)\b/i,
];

const SALE_OR_AD_SHARING_PATTERNS = [
  /\bsell or share\b/i,
  /\bshare (?:your )?(?:personal )?information .*advertising\b/i,
  /\bshare .*advertising partners?\b/i,
  /\btargeted advertising\b/i,
  /\bcross[- ]context behavioral advertising\b/i,
  /\bvaluable consideration\b/i,
];

const SENSITIVE_DENIAL_PATTERNS = [
  /\bdo not collect sensitive\b/i,
  /\bdo not collect biometric\b/i,
  /\bdo not collect health\b/i,
  /\bwill not collect sensitive\b/i,
  /\bwill not collect biometric\b/i,
];

const SENSITIVE_COLLECTION_PATTERNS = [
  /\bcollect (?:sensitive|biometric|health|medical)\b/i,
  /\bbiometric information\b/i,
  /\bprecise geolocation\b/i,
  /\bgovernment[- ]issued id\b/i,
  /\bhealth information\b/i,
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
    /\bprecise location\b/i,
    /\bapproximate location\b/i,
    /\blocation (?:data|information|services|signals?)\b/i,
    /\byour location\b/i,
    /\bdevice location\b/i,
    /\bgeolocation\b/i,
    /\bgps(?: location| data)?\b/i,
    /\bip address\b[^.!?]{0,120}\b(?:location|geolocation)\b/i,
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
      /\bwe do not use .* for targeted advertising\b/i,
      /\bwe do not use .* for personalized ads?\b/i,
      /\bwe do not use your information for targeted advertising\b/i,
      /\bwe do not use your information for personalized ads?\b/i,
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
      /\bshare (?:your )?(?:personal )?(?:information|data)\b[^.!?]{0,220}\b(?:targeted advertising|cross[- ]context|behavioral advertising|advertising partners?)\b/i,
      /\bshares? (?:your )?(?:personal )?(?:information|data)\b[^.!?]{0,180}\bfor (?:the )?purposes? of targeted advertising\b/i,
      /\bexchange.*for.*valuable consideration\b/i,
    ],
    medium: [
      /\bsell\b/i,
      /\bsold\b/i,
      /\bvaluable consideration\b/i,
    ],
    negations: [
      /\bwe do not sell your personal information\b/i,
      /\bwe do not sell personal information\b/i,
      /\b(?:we|[a-z][a-z0-9&.' -]{1,80})\s+(?:do not|does not|don['’]t|doesn['’]t|will not|won['’]t|never)\s+(?:sell|rent)\b/i,
      /\bnot sell or rent\b/i,
      /\bnot use or share\b[^.!?]{0,160}\badvertising\b/i,
      /\bnot sold\b/i,
    ],
  },

  {
    category: "external_data",
    title: "Combines data from outside sources",
    summary:
      "This policy says it may obtain or combine information from outside sources such as partners, advertisers, data providers, public sources, or data brokers.",
    severity: "high",
    baseScore: 17,
    strong: [
      /\bdata brokers?\b/i,
      /\bcombine (?:the )?information (?:we collect )?with information from\b/i,
      /\binformation (?:we )?(?:receive|obtain|collect) from (?:third parties|partners|advertisers|data providers|public sources)\b/i,
      /\bappend (?:data|information)\b/i,
      /\benrich (?:your )?(?:profile|information|data)\b/i,
    ],
    medium: [
      /\bfrom third parties\b/i,
      /\bfrom partners\b/i,
      /\bfrom advertisers\b/i,
      /\bfrom data providers\b/i,
      /\boffline sources?\b/i,
      /\bpublic(?:ly)? available (?:sources|information)\b/i,
      /\bother sources\b/i,
    ],
    negations: [
      /\bwe do not collect information from third parties\b/i,
      /\bwe do not buy personal information\b/i,
      /\bwe do not use data brokers\b/i,
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
      /\bgeolocation\b/i,
      /\bgps(?: location| data)?\b/i,
      /\bapproximate location\b/i,
      /\blocation (?:data|information|services|signals?)\b/i,
      /\byour location\b/i,
      /\bdevice location\b/i,
      /\bip address\b[^.!?]{0,120}\b(?:location|geolocation)\b/i,
    ],
    negations: [
      /\bwe do not collect location\b/i,
      /\bwe do not collect geolocation\b/i,
      /\bstorage location\b/i,
      /\bwindow\.location\b/i,
    ],
  },

  {
    category: "financial",
    title: "Collects payment or financial data",
    summary:
      "This policy says it may collect payment, billing, banking, or other financial information.",
    severity: "medium",
    baseScore: 11,
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
      /\byour messages\b/i,
      /\bmessages you (?:send|provide|submit|upload)\b/i,
      /\bphotos\b/i,
      /\bvideos\b/i,
      /\bfiles\b/i,
      /\buploads?\b/i,
      /\buser content\b/i,
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
      /\baccess your data\b/i,
      /\bdelete your data\b/i,
      /\bdeletion\b/i,
      /\bcorrect your data\b/i,
      /\bopt out\b/i,
      /\bprivacy request\b/i,
      /\bsubmit a request\b/i,
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

function ruleIdFor(rule) {
  return `${rule.category}.${String(rule.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function isLikelySectionHeading(text = "") {
  const clean = norm(text || "");
  if (!clean || clean.length > 140) return false;

  return (
    /\binformation we collect\b/i.test(clean) ||
    /\bpersonal information we collect\b/i.test(clean) ||
    /\bcategories of information collected\b/i.test(clean) ||
    /\bsources of information\b/i.test(clean) ||
    /\bhow we use\b/i.test(clean) ||
    /\bhow we disclose\b/i.test(clean) ||
    /\bhow we share\b/i.test(clean) ||
    /\bsale of personal information\b/i.test(clean) ||
    /\bselling or sharing\b/i.test(clean) ||
    /\bcookies\b/i.test(clean) ||
    /\btracking technologies\b/i.test(clean) ||
    /\byour rights\b/i.test(clean) ||
    /\byour choices\b/i.test(clean) ||
    /\bstate privacy rights\b/i.test(clean) ||
    /\bdata retention\b/i.test(clean) ||
    /\bretention of\b/i.test(clean) ||
    /\bchildren('?s)? privacy\b/i.test(clean) ||
    /\bminors\b/i.test(clean) ||
    /\bsecurity\b/i.test(clean) ||
    /\bcontact us\b/i.test(clean)
  );
}

function buildSectionedUnits(sentences) {
  const normalized = sentences.map((s) => norm(s)).filter(Boolean);
  const units = [];
  let activeSection = "general";

  for (let i = 0; i < normalized.length; i++) {
    const s1 = normalized[i];
    const s2 = normalized[i + 1];
    const s3 = normalized[i + 2];
    const detected = detectSectionContext(s1);

    if (detected !== "general" && isLikelySectionHeading(s1)) {
      activeSection = detected;
    }

    function pushUnit(text) {
      const section = detectSectionContext(text);
      units.push({
        text,
        section: section === "general" ? activeSection : section,
      });
    }

    if (s1) pushUnit(s1);
    if (s1 && s2) pushUnit(`${s1} ${s2}`);
    if (s1 && s2 && s3) pushUnit(`${s1} ${s2} ${s3}`);
  }

  const seen = new Set();
  return units.filter((unit) => {
    const key = `${unit.section}|${unit.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function sentenceIsDeniedPracticeOnly(text) {
  const value = String(text || "");

  return (
    hasAny(value, DENIED_PRACTICE_PATTERNS) &&
    !hasAny(value, CONTRASTING_ACTIVE_PRACTICE_PATTERNS)
  );
}

function sentenceHasPermission(text) {
  return hasAny(text, PERMISSION_PATTERNS);
}

function sentenceHasActionDependency(text) {
  return hasAny(text, ACTION_DEPENDENCY_PATTERNS);
}

function sentenceHasSafeFunction(text) {
  return hasAny(text, SAFE_FUNCTION_PATTERNS);
}

function sentenceHasAdTech(text) {
  return hasAny(text, AD_TECH_PATTERNS);
}

function sentenceIsPolicyReferenceOnly(text) {
  const value = String(text || "");

  return (
    hasAny(value, POLICY_REFERENCE_ONLY_PATTERNS) &&
    !hasAny(value, DIRECT_POLICY_PRACTICE_PATTERNS)
  );
}

function sentenceIsPrivacyChoiceOnly(text) {
  const value = String(text || "");

  return (
    hasAny(value, PRIVACY_CHOICE_ONLY_PATTERNS) &&
    !hasAny(value, ACTIVE_PRACTICE_PATTERNS)
  );
}

function sentenceIsLegalDisclosureInventoryOnly(text) {
  const value = String(text || "");

  return (
    hasAny(value, LEGAL_DISCLOSURE_INVENTORY_PATTERNS) &&
    !hasAny(value, ACTIVE_SALE_OR_AD_SHARING_PATTERNS)
  );
}

function sentenceIsNonGeoLocationOnly(text) {
  const value = String(text || "");

  return (
    hasAny(value, NON_GEO_LOCATION_PATTERNS) &&
    !/\b(?:precise|approximate|gps|geo|geolocation|your|device|current)\s+location\b/i.test(
      value
    ) &&
    !/\blocation (?:data|information|services|signals?)\b/i.test(value)
  );
}

function sentenceIsLimitedLegalOrRightsContext(text) {
  const value = String(text || "");

  return (
    hasAny(value, LIMITED_LEGAL_OR_RIGHTS_CONTEXT_PATTERNS) &&
    !hasAny(value, HIGH_RISK_SECONDARY_USE_PATTERNS) &&
    !hasAny(value, HIGH_RISK_OUTSIDE_DATA_PATTERNS)
  );
}

function sentenceIsNonUserContentOnly(text) {
  return hasAny(text, NON_USER_CONTENT_PATTERNS);
}

function getUseContext(rule, text = "") {
  const category = String(rule?.category || "").toLowerCase();
  const t = String(text || "");
  const deniedPracticeOnly = sentenceIsDeniedPracticeOnly(t);
  const disclosureInventoryOnly = sentenceIsLegalDisclosureInventoryOnly(t);
  const saleDenial = hasAny(t, SALE_DENIAL_PATTERNS);
  const secondaryUse =
    !saleDenial &&
    !deniedPracticeOnly &&
    !disclosureInventoryOnly &&
    hasAny(t, SECONDARY_USE_PATTERNS);
  const highRiskSecondaryUse =
    !saleDenial &&
    !deniedPracticeOnly &&
    !disclosureInventoryOnly &&
    hasAny(t, HIGH_RISK_SECONDARY_USE_PATTERNS);
  const outsideSources =
    !deniedPracticeOnly &&
    !disclosureInventoryOnly &&
    hasAny(t, OUTSIDE_DATA_PATTERNS);
  const highRiskOutsideSources =
    !deniedPracticeOnly &&
    !disclosureInventoryOnly &&
    hasAny(t, HIGH_RISK_OUTSIDE_DATA_PATTERNS);
  const operationalPartnerData =
    outsideSources && hasAny(t, OPERATIONAL_PARTNER_DATA_PATTERNS);
  const broadPartnerLanguage = hasAny(t, BROAD_PARTNER_PATTERNS);
  const expectedOperational = hasAny(
    t,
    CATEGORY_EXPECTED_USE_PATTERNS[category] || []
  );
  const nonGeoLocationOnly = category === "location" && sentenceIsNonGeoLocationOnly(t);
  const preciseLocation =
    !nonGeoLocationOnly &&
    /\bprecise (?:location|geolocation)\b|\bgps location\b/i.test(t);
  const fingerprinting =
    /\bdevice fingerprint(?:ing)?\b|\bfingerprinting\b/i.test(t);
  const advertisingIdentifier = /\badvertising id\b|\badvertising identifiers?\b/i.test(t);
  const deviceTracking =
    fingerprinting || advertisingIdentifier;
  const dataBrokerSources = /\bdata brokers?\b/i.test(t);
  const publicSources =
    /\bpublic(?:ly)? available\b|\bpublic posts?\b|\bpublic databases?\b|\bsocial media\b/i.test(t);
  const profileEnrichment = /\bappend\b|\benrich\b|\bcombine\b/i.test(t);
  const targetedAdvertising =
    !deniedPracticeOnly &&
    /\btargeted ads?\b|\btargeted advertising\b|\bcross[- ]context\b|\bbehavioral advertising\b|\bpersonalized ads?\b|\bremarketing\b|\bretargeting\b/i.test(t);
  const profiling =
    /\bprofiling\b|\bprofiled\b|\binfer(?:red)?\b|\bsegments?\b|\blookalike audiences?\b/i.test(t);
  const saleOrSharing =
    !saleDenial &&
    !deniedPracticeOnly &&
    !disclosureInventoryOnly &&
    hasAny(t, ACTIVE_SALE_OR_AD_SHARING_PATTERNS);
  const serviceProviderOnly =
    category === "sharing" &&
    expectedOperational &&
    !secondaryUse &&
    !broadPartnerLanguage;

  return {
    expectedOperational,
    secondaryUse,
    highRiskSecondaryUse,
    outsideSources,
    highRiskOutsideSources,
    operationalPartnerData,
    broadPartnerLanguage,
    preciseLocation,
    fingerprinting,
    advertisingIdentifier,
    dataBrokerSources,
    publicSources,
    profileEnrichment,
    targetedAdvertising,
    profiling,
    saleOrSharing,
    deviceTracking,
    serviceProviderOnly,
    deniedPracticeOnly,
    disclosureInventoryOnly,
    nonGeoLocationOnly,
  };
}

function mergeUseContexts(items = []) {
  return items.reduce(
    (merged, item) => {
      const ctx = item?.useContext || {};
      for (const key of Object.keys(merged)) {
        merged[key] = merged[key] || ctx[key] === true;
      }
      return merged;
    },
    {
      expectedOperational: false,
      secondaryUse: false,
      highRiskSecondaryUse: false,
      outsideSources: false,
      highRiskOutsideSources: false,
      operationalPartnerData: false,
      broadPartnerLanguage: false,
      preciseLocation: false,
      fingerprinting: false,
      advertisingIdentifier: false,
      dataBrokerSources: false,
      publicSources: false,
      profileEnrichment: false,
      targetedAdvertising: false,
      profiling: false,
      saleOrSharing: false,
      deviceTracking: false,
      serviceProviderOnly: false,
      deniedPracticeOnly: false,
      disclosureInventoryOnly: false,
      nonGeoLocationOnly: false,
    }
  );
}

function priorityReasonForContext(rule, ctx = {}) {
  const category = String(rule?.category || "").toLowerCase();

  if (category === "sale") {
    return ctx.saleOrSharing ? "sale-or-sharing" : "legal-disclosure";
  }
  if (category === "financial" && ctx.expectedOperational && !ctx.secondaryUse) {
    return "expected-operational";
  }
  if (ctx.highRiskOutsideSources) return "outside-data";
  if (category === "external_data") return "partner-supplied-data";
  if (ctx.outsideSources) return "partner-supplied-data";
  if (ctx.highRiskSecondaryUse) return "secondary-use";
  if (ctx.secondaryUse) return "advertising-or-marketing";
  if (ctx.broadPartnerLanguage) return "broad-partner-language";
  if (category === "location" && ctx.preciseLocation) return "precise-location";
  if (category === "device_network" && ctx.fingerprinting) return "device-tracking";
  if (ctx.expectedOperational) return "expected-operational";

  return "policy-signal";
}

function riskLabelForContext(rule, ctx = {}) {
  const category = String(rule?.category || "").toLowerCase();

  if (category === "sale") {
    return ctx.saleOrSharing ? "Sale or sharing" : "Legal disclosure";
  }
  if (category === "biometric") return "Biometric data";
  if (category === "sensitive") return "Sensitive data";

  if (ctx.highRiskOutsideSources) {
    if (ctx.dataBrokerSources) return "Data brokers";
    if (ctx.publicSources) return "Public sources";
    if (ctx.profileEnrichment) return "Profile enrichment";
    return "Outside-source enrichment";
  }

  if (category === "external_data") {
    if (ctx.operationalPartnerData) return "Service partner data";
    return "Partner-supplied data";
  }

  if (ctx.highRiskSecondaryUse) {
    if (ctx.saleOrSharing) return "Sale or sharing";
    if (ctx.targetedAdvertising) return "Targeted ads";
    if (ctx.profiling) return "Profiling";
    return "Secondary use";
  }

  if (ctx.secondaryUse) return "Ads or measurement";
  if (ctx.broadPartnerLanguage) return "Broad partner language";
  if (category === "location" && ctx.preciseLocation) return "Precise location";
  if (category === "device_network" && ctx.fingerprinting) return "Fingerprinting";
  if (category === "device_network" && ctx.advertisingIdentifier) {
    return "Advertising identifiers";
  }
  if (ctx.expectedOperational) return "Expected operation";

  const fallback = {
    tracking: "Tracking",
    sharing: "Third-party sharing",
    location: "Location data",
    financial: "Payment data",
    identifiers: "Identifiers",
    device_network: "Device data",
    contacts_content: "User content",
    rights: "Privacy rights",
    retention: "Retention",
  };

  return fallback[category] || "Policy signal";
}

function evidenceLabelForText(text = "", fallback = "Policy") {
  const value = String(text || "");

  if (/\bdata brokers?\b/i.test(value)) return "Data brokers";
  if (/\bpublic(?:ly)? available\b|\bpublic posts?\b|\bpublic databases?\b|\bsocial media\b/i.test(value)) {
    return "Public sources";
  }
  if (/\bappend\b|\benrich\b|\bcombine\b/i.test(value)) return "Enrichment";
  if (/\btargeted advertising\b|\bcross[- ]context\b|\bbehavioral advertising\b/i.test(value)) {
    return "Targeted ads";
  }
  if (/\bprofiling\b|\bprofiled\b|\binfer(?:red)?\b|\bsegments?\b/i.test(value)) {
    return "Profiling";
  }
  if (/\badvertising identifiers?\b|\badvertising id\b/i.test(value)) {
    return "Ad identifiers";
  }
  if (/\bfingerprint(?:ing)?\b/i.test(value)) return "Fingerprinting";
  if (/\bpartners?\b|\bthird parties\b|\bservice providers?\b|\bvendors?\b/i.test(value)) {
    return "Partners";
  }
  if (/\bprecise (?:location|geolocation)\b|\bgps\b/i.test(value)) return "Precise location";
  if (/\bpayment\b|\bbilling\b|\btransaction\b/i.test(value)) return "Payment";
  if (/\bhealth\b|\bmedical\b|\bgovernment id\b|\bsocial security\b/i.test(value)) {
    return "Sensitive data";
  }

  return fallback;
}

function isNormalOperationalUse(finding = {}) {
  const category = String(finding?.category || "").toLowerCase();
  const confidence = String(finding?.confidence || "").toLowerCase();
  const ctx = finding?.primaryUseContext || finding?.useContext || {};

  if (category === "sale") return false;
  if (category === "external_data") {
    return ctx.operationalPartnerData && !ctx.highRiskOutsideSources;
  }
  if (ctx.operationalPartnerData && !ctx.highRiskOutsideSources && !ctx.highRiskSecondaryUse) {
    return true;
  }
  if (category === "financial" && ctx.expectedOperational && !ctx.secondaryUse) {
    return true;
  }
  if (ctx.highRiskSecondaryUse || ctx.highRiskOutsideSources || ctx.broadPartnerLanguage) return false;
  if (ctx.secondaryUse && !ctx.expectedOperational) return false;
  if (ctx.outsideSources && !ctx.expectedOperational) return false;
  if (ctx.fingerprinting) return false;
  if (ctx.preciseLocation && !ctx.expectedOperational) return false;

  if (ctx.serviceProviderOnly) return true;

  if (finding?.safeContext && category === "tracking") return true;

  if (
    ctx.expectedOperational &&
    [
      "financial",
      "identifiers",
      "device_network",
      "location",
      "contacts_content",
      "sharing",
      "tracking",
    ].includes(category)
  ) {
    return true;
  }

  if (
    finding?.actionDependent &&
    ["financial", "contacts_content", "location"].includes(category) &&
    confidence !== "explicit"
  ) {
    return true;
  }

  return false;
}

function detectSectionContext(text) {
  const t = String(text || "").toLowerCase();

  if (
    /information we collect|personal information we collect|categories of information collected|data we collect|sources of information/.test(
      t
    )
  ) {
    return "collection";
  }
  if (/how we use|use of information|business purposes|commercial purposes/.test(t)) {
    return "use";
  }
  if (/sale of personal information|sell or share|do not sell|targeted advertising|cross[- ]context/.test(t)) {
    return "sale";
  }
  if (/how we share|how we disclose|share with|disclose|third parties/.test(t)) {
    return "sharing";
  }
  if (/cookies|tracking|pixels|beacons|analytics/.test(t)) return "tracking";
  if (/retain|retention|stored for|kept for|delete your information/.test(t)) {
    return "retention";
  }
  if (/your rights|privacy rights|your choices|state privacy rights|ccpa|cpra|gdpr/.test(t)) {
    return "rights";
  }
  if (/children|child|minor|under 13|coppa/.test(t)) return "children";
  if (/security|protect|fraud|safeguard/.test(t)) return "security";

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

function firstRuleMatch(rule, text = "") {
  const patterns = [...(rule.strong || []), ...(rule.medium || [])];
  let best = null;

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (!match || match.index == null) continue;

    if (!best || match.index < best.index) {
      best = {
        index: match.index,
        text: match[0],
      };
    }
  }

  return best;
}

function normalizeEvidenceBoundaries(text = "") {
  return norm(text || "")
    .replace(/([.!?])(?=[A-Z])/g, "$1 ")
    .replace(/\b(From)(We\b)/g, "$1. $2")
    .replace(/\b(Information)(Automatically\b)/g, "$1. $2")
    .replace(
      /([a-z)])(?=(?:Where We|Directly from you|Automatically when|From Partners|From third parties)\b)/g,
      "$1. "
    );
}

function splitEvidenceSentences(text = "") {
  const clean = normalizeEvidenceBoundaries(text);
  if (!clean) return [];

  const parts = clean
    .split(
      /(?<=[.!?])\s+|\n+|(?=\b(?:Directly from you|Automatically when|From Partners|From third parties):?)/i
    )
    .map((part) => norm(part))
    .filter((part) => part.length >= 20);

  return parts.length ? parts : [clean];
}

function removeLeadingPolicyLabel(sentence = "", match = null) {
  const clean = norm(sentence || "");
  if (!clean || !match) return clean;

  const colonIndex = clean.lastIndexOf(":", match.index);
  if (colonIndex < 0) return clean;

  const before = clean.slice(0, colonIndex);
  const after = clean.slice(colonIndex + 1).trim();

  if (
    after.length >= 35 &&
    before.length <= 90 &&
    /(?:categories|information collected|section|notice|policy|table)\b/i.test(before)
  ) {
    return after;
  }

  return clean;
}

function normalizeEvidenceQuote(sentence = "") {
  return norm(sentence || "")
    .replace(/^[•*\-–—]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function sentenceCaseEvidenceQuote(sentence = "") {
  const clean = normalizeEvidenceQuote(sentence);
  if (!clean) return "";

  const first = clean.charAt(0);
  const rest = clean.slice(1);
  const cased = first >= "a" && first <= "z" ? first.toUpperCase() + rest : clean;

  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

function lastStarterBefore(text = "", matchIndex = 0) {
  const starters = [
    /\bwe (?:also |may |will |automatically )?collect\b/gi,
    /\byou may provide\b/gi,
    /\bwhen you\b/gi,
    /\bdirectly from you\b/gi,
    /\bfrom partners\b/gi,
    /\bfrom third parties\b/gi,
    /\bautomatically when\b/gi,
  ];

  let best = -1;

  for (const pattern of starters) {
    let match = pattern.exec(text);
    while (match) {
      if (match.index <= matchIndex && matchIndex - match.index <= 260) {
        best = Math.max(best, match.index);
      }
      match = pattern.exec(text);
    }
  }

  return best;
}

function focusLongEvidenceQuote(sentence = "", match = null, maxLen = 360) {
  const clean = normalizeEvidenceQuote(sentence);
  if (!clean || clean.length <= maxLen) return sentenceCaseEvidenceQuote(clean);

  const nextMatch = match || firstRuleMatch({ strong: [], medium: [] }, clean);
  const matchIndex = nextMatch?.index ?? 0;
  const matchEnd = matchIndex + String(nextMatch?.text || "").length;
  const starterIndex = lastStarterBefore(clean, matchIndex);
  const colonIndex = clean.lastIndexOf(": ", matchIndex);
  const sentenceIndex = Math.max(
    clean.lastIndexOf(". ", matchIndex),
    clean.lastIndexOf("; ", matchIndex)
  );

  let start = 0;
  if (starterIndex >= 0) {
    start = starterIndex;
  } else if (colonIndex >= 0 && matchIndex - colonIndex <= 220) {
    start = colonIndex + 2;
  } else if (sentenceIndex >= 0) {
    start = sentenceIndex + 2;
  }

  const punctuationAfter = clean.slice(matchEnd).search(/[.!?](?:\s|$)/);
  let end = punctuationAfter >= 0 ? matchEnd + punctuationAfter + 1 : clean.length;

  if (end - start > maxLen) {
    const commaAfter = clean.slice(matchEnd).search(/,\s+(?:and|or|but|which|when)\b/i);
    if (commaAfter >= 60) {
      end = matchEnd + commaAfter + 1;
    }
  }

  if (end - start > maxLen) {
    const targetEnd = Math.min(clean.length, start + maxLen);
    const lastComma = clean.lastIndexOf(", ", targetEnd);
    const lastSpace = clean.lastIndexOf(" ", targetEnd);
    end = lastComma > matchEnd ? lastComma + 1 : lastSpace > matchEnd ? lastSpace : targetEnd;
  }

  let focused = clean.slice(start, end).trim();
  focused = focused.replace(/^(?:and|or|,)\s+/i, "");
  return sentenceCaseEvidenceQuote(focused);
}

function extractBestSnippet(rule, text) {
  const parts = String(text || "")
    .split(/\n+/)
    .flatMap((part) => splitEvidenceSentences(part));

  if (!parts.length) return normalizeEvidenceQuote(text);

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

  const bestText = ranked[0]?.text || text;
  const match = firstRuleMatch(rule, bestText);
  const withoutLabel = removeLeadingPolicyLabel(bestText, match);
  const labelAdjustedMatch = firstRuleMatch(rule, withoutLabel);
  return focusLongEvidenceQuote(withoutLabel, labelAdjustedMatch || match);
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

function extractRuleMatches(sentences, rules, limit = 2) {
  const out = {};

  for (const [key, rule] of Object.entries(rules)) {
    const evidence = getEvidence(sentences, rule.patterns || rule, limit).map((item) =>
      shortenEvidence(item, 180)
    );

    out[key] = {
      present: evidence.length > 0,
      label: rule.label || key,
      evidence,
    };
  }

  return out;
}

function summarizePresence(map = {}) {
  return Object.entries(map)
    .filter(([, value]) => value?.present)
    .map(([key, value]) => ({
      key,
      label: value.label,
      evidence: value.evidence || [],
    }));
}

function shortenedEvidence(items, maxItems = 3, maxLen = 180) {
  return dedupeEvidence(
    (items || []).map((item) => shortenEvidence(item, maxLen)),
    maxItems
  );
}

function sectionLabel(key) {
  const labels = {
    collection: "Collection",
    use: "Use",
    sharing: "Sharing",
    sale: "Sale or ad sharing",
    tracking: "Tracking",
    retention: "Retention",
    rights: "Rights",
    children: "Children",
    security: "Security",
    general: "General",
  };

  return labels[key] || key;
}

export function extractPolicySections(sentences) {
  const units = buildSectionedUnits(sentences);
  const bySection = new Map();

  for (const unit of units) {
    const key = unit.section || "general";
    const text = norm(unit.text || "");
    if (!text || text.length < 20) continue;

    if (!bySection.has(key)) {
      bySection.set(key, {
        key,
        label: sectionLabel(key),
        count: 0,
        evidence: [],
        seen: new Set(),
      });
    }

    const entry = bySection.get(key);
    const seenKey = text.toLowerCase();
    if (entry.seen.has(seenKey)) continue;

    entry.seen.add(seenKey);
    entry.count += 1;
    if (entry.evidence.length < 2) {
      entry.evidence.push(shortenEvidence(text, 180));
    }
  }

  return Array.from(bySection.values())
    .map(({ seen, ...entry }) => entry)
    .sort((a, b) => b.count - a.count);
}

function extractRetentionProfile(sentences) {
  const statedEvidence = getEvidence(sentences, RETENTION_RULES.stated, 4);
  const specificEvidence = getEvidence(sentences, RETENTION_RULES.specific, 4);
  const vagueEvidence = getEvidence(sentences, RETENTION_RULES.vague, 4);
  const present =
    statedEvidence.length > 0 ||
    specificEvidence.length > 0 ||
    vagueEvidence.length > 0;
  const specific = specificEvidence.length > 0;
  const vague = vagueEvidence.length > 0 && !specific;
  const quality = !present ? "missing" : specific ? "specific" : vague ? "vague" : "general";

  return {
    present,
    vague,
    specific,
    quality,
    evidence: shortenedEvidence(
      [...specificEvidence, ...statedEvidence, ...vagueEvidence],
      3
    ),
    specificEvidence: shortenedEvidence(specificEvidence, 2),
    vagueEvidence: shortenedEvidence(vagueEvidence, 2),
  };
}

function extractRightsProfile(sentences) {
  const jurisdictions = summarizePresence(
    extractRuleMatches(sentences, JURISDICTION_RULES, 3)
  );
  const rights = summarizePresence(
    extractRuleMatches(sentences, PRIVACY_RIGHT_RULES, 3)
  );

  return {
    present: jurisdictions.length > 0 || rights.length > 0,
    jurisdictions,
    rights,
    evidence: shortenedEvidence(
      [
        ...jurisdictions.flatMap((item) => item.evidence || []),
        ...rights.flatMap((item) => item.evidence || []),
      ],
      4
    ),
  };
}

function getPositiveEvidence(sentences, patterns, limit = 3) {
  const hits = [];

  for (const sentence of sentences) {
    const text = norm(sentence || "");
    if (!text || !hasAny(text, patterns)) continue;
    if (sentenceHasNegation(text)) continue;

    hits.push(text);
    if (hits.length >= limit) break;
  }

  return hits;
}

function extractMixedDisclosures(sentences) {
  const items = [];
  const saleDenials = getEvidence(sentences, SALE_DENIAL_PATTERNS, 3);
  const adSharing = getPositiveEvidence(sentences, SALE_OR_AD_SHARING_PATTERNS, 3);

  if (saleDenials.length && adSharing.length) {
    items.push({
      type: "sale_ad_sharing",
      title: "Sale language is mixed with ad-sharing language",
      severity: "medium",
      summary:
        "The policy says it does not sell personal information, but it also describes targeted advertising or sharing that some laws treat separately.",
      evidence: shortenedEvidence([...saleDenials, ...adSharing], 4),
    });
  }

  const sensitiveDenials = getEvidence(sentences, SENSITIVE_DENIAL_PATTERNS, 3);
  const sensitiveCollection = getPositiveEvidence(
    sentences,
    SENSITIVE_COLLECTION_PATTERNS,
    3
  );

  if (sensitiveDenials.length && sensitiveCollection.length) {
    items.push({
      type: "sensitive_collection",
      title: "Sensitive-data language is mixed",
      severity: "medium",
      summary:
        "The policy limits sensitive-data collection in one place, but describes sensitive or biometric data elsewhere.",
      evidence: shortenedEvidence([...sensitiveDenials, ...sensitiveCollection], 4),
    });
  }

  return items;
}

function actionDependencyType(text = "") {
  const t = String(text || "").toLowerCase();

  if (/purchase|payment|order|billing|transaction/.test(t)) return "purchase";
  if (/create|register|sign up|account/.test(t)) return "account";
  if (/upload|content|files?|photos?|videos?/.test(t)) return "upload";
  if (/contact|support|communicate/.test(t)) return "contact";
  if (/location|enable|allow|permission|consent|opt in/.test(t)) return "permission";

  return "provided_by_user";
}

function actionDependencyLabel(type) {
  const labels = {
    purchase: "Purchase or payment flow",
    account: "Account action",
    upload: "User-provided content",
    contact: "Contact or support request",
    permission: "User permission or consent",
    provided_by_user: "Information the user provides",
  };

  return labels[type] || labels.provided_by_user;
}

function extractActionDependencies(sentences) {
  const evidence = getEvidence(sentences, ACTION_DEPENDENCY_PATTERNS, 8);
  const byType = new Map();

  for (const item of evidence) {
    const type = actionDependencyType(item);
    if (!byType.has(type)) {
      byType.set(type, {
        key: type,
        label: actionDependencyLabel(type),
        evidence: [],
      });
    }

    const entry = byType.get(type);
    if (entry.evidence.length < 2) {
      entry.evidence.push(shortenEvidence(item, 180));
    }
  }

  return Array.from(byType.values());
}

function extractSpecificityProfile(sentences, practices, retentionProfile, rightsProfile) {
  const vagueEvidence = getEvidence(sentences, VAGUE_DISCLOSURE_PATTERNS, 5);
  const specificEvidence = getEvidence(sentences, SPECIFIC_DISCLOSURE_PATTERNS, 5);
  const specificSignals = [
    ...(practices?.dataTypes || []).map((item) => item.key),
    ...(practices?.purposes || []).map((item) => item.label),
    ...(practices?.recipients || []).map((item) => item.label),
    ...(rightsProfile?.rights || []).map((item) => item.label),
  ];

  if (retentionProfile?.specific) specificSignals.push("Specific retention timing");
  if (rightsProfile?.jurisdictions?.length) specificSignals.push("Jurisdiction-specific rights");

  const vagueSignalCount =
    vagueEvidence.length +
    (retentionProfile?.quality === "vague" ? 2 : 0) +
    (retentionProfile?.quality === "missing" ? 1 : 0);
  const specificSignalCount =
    new Set(specificSignals.filter(Boolean)).size + specificEvidence.length;
  const score = Math.max(
    0,
    Math.min(100, Math.round(45 + specificSignalCount * 6 - vagueSignalCount * 7))
  );
  const level = score >= 70 ? "specific" : score >= 45 ? "mixed" : "vague";

  return {
    score,
    level,
    specificSignals: Array.from(new Set(specificSignals.filter(Boolean))).slice(0, 8),
    vagueSignals: shortenedEvidence(vagueEvidence, 5),
    evidence: shortenedEvidence(specificEvidence, 5),
  };
}

export function extractPolicyPractices(sentences) {
  const { dataCollected, dataEvidence } = extractDataCategories(sentences);
  const purposes = extractRuleMatches(sentences, PURPOSE_RULES);
  const recipients = extractRuleMatches(sentences, RECIPIENT_RULES);
  const controls = extractRuleMatches(sentences, CONTROL_RULES);
  const retention = extractRetentionProfile(sentences);

  return {
    dataTypes: Object.entries(dataCollected)
      .filter(([, present]) => present)
      .map(([key]) => ({
        key,
        evidence: Array.isArray(dataEvidence[key])
          ? dataEvidence[key].map((item) => shortenEvidence(item, 180)).slice(0, 2)
          : [],
      })),
    purposes: summarizePresence(purposes),
    recipients: summarizePresence(recipients),
    controls: summarizePresence(controls),
    retention,
  };
}

export function extractPolicyQuality(sentences, practices = extractPolicyPractices(sentences)) {
  const retention = practices?.retention || extractRetentionProfile(sentences);
  const rights = extractRightsProfile(sentences);

  return {
    sections: extractPolicySections(sentences),
    specificity: extractSpecificityProfile(sentences, practices, retention, rights),
    retention,
    rights,
    mixedDisclosures: extractMixedDisclosures(sentences),
    actionDependencies: extractActionDependencies(sentences),
  };
}

function determineConfidence(strongHits, mediumHits, negated, adTechHits) {
  const specificHits = strongHits + mediumHits;

  if (specificHits === 0) return "low";
  if (negated && strongHits <= 1 && mediumHits <= 1) {
    return adTechHits > 0 ? "low" : "possible";
  }
  if (negated && strongHits === 0 && mediumHits <= 1 && adTechHits === 0) {
    return "low";
  }
  if (strongHits >= 2) return "explicit";
  if (strongHits >= 1 && mediumHits >= 1) return "explicit";
  if (strongHits >= 1 || mediumHits >= 3) return "likely";
  if (adTechHits >= 1 && specificHits >= 1) return "likely";
  if (mediumHits >= 1) return "possible";
  return "low";
}

function hasHighImpactContext(rule, category, useContext = {}) {
  if (category === "sale") {
    return useContext.saleOrSharing || useContext.highRiskSecondaryUse;
  }
  if (category === "biometric") return true;
  if (category === "sensitive") return true;

  if (category === "external_data") {
    return useContext.highRiskOutsideSources || useContext.highRiskSecondaryUse;
  }

  if (category === "location") {
    return (
      (useContext.preciseLocation && !useContext.expectedOperational) ||
      useContext.highRiskSecondaryUse ||
      useContext.highRiskOutsideSources
    );
  }

  if (category === "device_network") {
    return (
      useContext.fingerprinting ||
      useContext.highRiskSecondaryUse ||
      useContext.highRiskOutsideSources
    );
  }

  if (category === "tracking") {
    return useContext.highRiskSecondaryUse || useContext.fingerprinting;
  }

  if (category === "sharing") {
    return useContext.highRiskSecondaryUse || useContext.highRiskOutsideSources;
  }

  if (category === "identifiers") {
    return useContext.highRiskSecondaryUse || useContext.highRiskOutsideSources;
  }

  if (category === "financial") {
    return useContext.highRiskSecondaryUse;
  }

  return false;
}

function maybeLowerSeverityForContext(rule, text, confidence, useContext = getUseContext(rule, text)) {
  const s = text.toLowerCase();
  const actionDependent = sentenceHasActionDependency(text);
  const category = String(rule.category || "").toLowerCase();

  if (hasHighImpactContext(rule, category, useContext)) {
    return "high";
  }

  if (category === "financial" && useContext.expectedOperational && !useContext.secondaryUse) {
    return "medium";
  }

  if (category === "external_data") {
    return useContext.operationalPartnerData ? "low" : "medium";
  }

  if (
    (useContext.secondaryUse ||
      useContext.outsideSources ||
      useContext.broadPartnerLanguage) &&
    [
      "tracking",
      "sharing",
      "location",
      "device_network",
      "identifiers",
      "financial",
    ].includes(category)
  ) {
    return "medium";
  }

  if (category === "financial" && !useContext.highRiskSecondaryUse) {
    return "medium";
  }

  if (rule.category === "tracking") {
    if (/sign in|signed in|authentication|security|fraud prevention|session cookie/.test(s)) {
      return confidence === "explicit" ? "medium" : "low";
    }
  }

  if (rule.category === "location") {
    if (/with your permission|if you enable|if you allow|opt in/.test(s)) {
      return "low";
    }
  }

  if (rule.category === "financial" && actionDependent) {
    if (/purchase|order|payment|billing|transaction/.test(s)) {
      return "medium";
    }
  }

  if (rule.category === "contacts_content" && actionDependent) {
    if (/upload|content you provide|files?|photos?|videos?/.test(s)) {
      return "medium";
    }
  }

  if (rule.category === "sharing") {
    if (useContext.serviceProviderOnly || /service providers?.*perform services|on our behalf|to operate the service/.test(s)) {
      return "low";
    }
  }

  return rule.severity;
}

function buildAdjustedSummary(
  rule,
  negated,
  permissionLimited,
  safeContext,
  actionDependent,
  useContext = {}
) {
  const category = String(rule?.category || "").toLowerCase();

  if (category === "financial" && useContext.expectedOperational && !useContext.secondaryUse) {
    return "This policy mentions payment or financial information in connection with purchases, payments, billing, or account transactions.";
  }

  if (useContext.outsideSources) {
    if (!useContext.highRiskOutsideSources) {
      return "This policy mentions information received from partners or third parties connected to your use of the service.";
    }

    return "This policy says the company may add or combine information from outside sources, which can expand what it knows beyond your direct use of the service.";
  }

  if (useContext.secondaryUse) {
    if (!useContext.highRiskSecondaryUse) {
      return "This policy connects this data use to advertising, marketing, measurement, or partner services.";
    }

    if (category === "financial") {
      return "This policy links payment or transaction information to secondary uses such as advertising, profiling, sharing, or commercial purposes.";
    }
    if (category === "location") {
      return "This policy links location data to secondary uses such as advertising, profiling, sharing, or commercial purposes.";
    }
    if (category === "device_network") {
      return "This policy links device or network data to tracking, advertising, profiling, sharing, or other secondary uses.";
    }
    if (category === "identifiers") {
      return "This policy links identifying information to advertising, profiling, sharing, or other secondary uses beyond basic account operation.";
    }
    return "This policy connects this data use to advertising, profiling, sharing, sale, or other secondary purposes.";
  }

  if (useContext.broadPartnerLanguage) {
    return "This policy uses broad partner or business-purpose language, which can make the real scope of sharing harder to understand.";
  }

  if (category === "location" && useContext.preciseLocation) {
    return "This policy mentions precise location or GPS data, which can reveal sensitive movement patterns.";
  }

  if (category === "device_network" && useContext.deviceTracking) {
    return "This policy mentions device identifiers or fingerprinting-style signals that can be used to recognize a browser or device over time.";
  }

  if (
    !negated &&
    !permissionLimited &&
    !safeContext &&
    !actionDependent &&
    !useContext.expectedOperational
  ) {
    return rule.summary;
  }

  if (rule.category === "tracking" && safeContext) {
    return "This policy mentions cookies or tracking tools, but they appear to be used mainly for login, security, or basic site features.";
  }

  if (permissionLimited) {
    if (rule.category === "location") {
      return "This policy mentions location data, but says it may only be collected if you allow it.";
    }
    return "This policy mentions this data use, but says it may only happen if you choose to allow it.";
  }

  if (actionDependent) {
    if (rule.category === "financial") {
      return "This policy mentions payment or financial information in connection with purchases, payments, or transactions.";
    }
    if (rule.category === "contacts_content") {
      return "This policy mentions contacts, files, uploads, or other content tied to information you choose to provide.";
    }
    return "This policy mentions this data use in connection with actions you choose to take on the service.";
  }

  if (useContext.expectedOperational) {
    return "This policy describes data use that appears tied to normal service operation, such as account access, checkout, delivery, security, support, or requested features.";
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

function evidenceScore(rule, text, sectionOverride = "") {
  const strongHits = countMatches(text, rule.strong || []);
  const mediumHits = countMatches(text, rule.medium || []);
  const explicitNegation = hasAny(text, rule.negations || []);
  const genericNegation = sentenceHasNegation(text);
  const deniedPracticeOnly = sentenceIsDeniedPracticeOnly(text);
  const permissionLimited = sentenceHasPermission(text);
  const actionDependent = sentenceHasActionDependency(text);
  const safeContext = sentenceHasSafeFunction(text);
  const adTechHits = sentenceHasAdTech(text) ? 1 : 0;
  const policyReferenceOnly = sentenceIsPolicyReferenceOnly(text);
  const privacyChoiceOnly = sentenceIsPrivacyChoiceOnly(text);
  const useContext = getUseContext(rule, text);
  const disclosureInventoryOnly = sentenceIsLegalDisclosureInventoryOnly(text);
  const nonGeoLocationOnly =
    rule.category === "location" && sentenceIsNonGeoLocationOnly(text);
  const limitedLegalOrRightsContext = sentenceIsLimitedLegalOrRightsContext(text);
  const nonUserContentOnly =
    rule.category === "contacts_content" && sentenceIsNonUserContentOnly(text);

  let score = 0;
  score += strongHits * 4;
  score += mediumHits * 2;

  const detectedSection = detectSectionContext(text);
  const section =
    detectedSection === "general" && sectionOverride
      ? sectionOverride
      : detectedSection;
  const specificHits = strongHits + mediumHits;

  if (rule.category === "tracking" && adTechHits > 0) {
    score += adTechHits * 3;
  }

  if (rule.category === "tracking" && section === "tracking" && specificHits > 0) {
    score += 2;
  }

  if (
    (rule.category === "sharing" || rule.category === "sale") &&
    section === "sharing" &&
    specificHits > 0
  ) {
    score += 2;
  }

  if (deniedPracticeOnly) score -= 20;
  else if (explicitNegation) score -= 5;
  else if (genericNegation && strongHits === 0) score -= 2;

  if (permissionLimited) score -= 2;
  else if (actionDependent) score -= 1;
  if (safeContext && rule.category === "tracking") score -= 3;
  if (safeContext && rule.category === "sharing") score -= 1;
  if (useContext.secondaryUse) score += 3;
  if (useContext.outsideSources) score += 4;
  if (useContext.broadPartnerLanguage) score += 2;
  if (useContext.expectedOperational && !useContext.secondaryUse) score -= 1;
  if (nonGeoLocationOnly) score -= 20;
  if (limitedLegalOrRightsContext) score -= 18;
  if (nonUserContentOnly) score -= 20;
  if (policyReferenceOnly && rule.category !== "rights") score -= 10;
  if (
    privacyChoiceOnly &&
    ["sale", "tracking", "sharing"].includes(rule.category)
  ) {
    score -= rule.category === "sale" ? 12 : 8;
  }
  if (
    disclosureInventoryOnly &&
    ["sale", "tracking", "sharing"].includes(rule.category)
  ) {
    score -= rule.category === "sale" ? 14 : 8;
  }

  if (explicitNegation && ["sale", "sharing"].includes(rule.category) && strongHits <= 1) {
    score -= 6;
  }
  if (rule.category === "sale" && !useContext.saleOrSharing) {
    score -= 8;
  }

  return {
    strongHits,
    mediumHits,
    specificHits,
    adTechHits,
    negated: deniedPracticeOnly || explicitNegation || (genericNegation && score <= 2),
    deniedPracticeOnly,
    permissionLimited,
    actionDependent,
    safeContext,
    policyReferenceOnly,
    privacyChoiceOnly,
    disclosureInventoryOnly,
    nonGeoLocationOnly,
    limitedLegalOrRightsContext,
    nonUserContentOnly,
    useContext,
    score,
    section,
  };
}

function shouldCountAsRisk(finding) {
  const severity = String(finding?.severity || "").toLowerCase();
  const confidence = String(finding?.confidence || "").toLowerCase();
  const category = String(finding?.category || "").toLowerCase();
  const evidenceCount = Array.isArray(finding?.evidence) ? finding.evidence.length : 0;

  const severityQualifies = severity === "high" || severity === "medium";
  const confidenceQualifies = confidence === "likely" || confidence === "explicit";

  const excludedCategories = new Set(["retention", "children"]);

  if (finding?.normalOperationalUse === true || isNormalOperationalUse(finding)) {
    return false;
  }
  if (finding?.deniedPracticeOnly) return false;
  if (finding?.disclosureInventoryOnly) return false;
  if (finding?.nonGeoLocationOnly) return false;
  if (finding?.limitedLegalOrRightsContext) return false;
  if (finding?.nonUserContentOnly) return false;
  if (!severityQualifies || !confidenceQualifies) return false;
  if (excludedCategories.has(category)) {
    return false;
  }
  if (finding?.negated && confidence !== "explicit") return false;
  if (finding?.permissionLimited && confidence !== "explicit") return false;
  if (
    finding?.actionDependent &&
    confidence !== "explicit" &&
    ["financial", "contacts_content", "location"].includes(category)
  ) {
    return false;
  }
  if (finding?.safeContext && category === "tracking") return false;
  if (
    finding?.privacyChoiceOnly &&
    ["sale", "tracking", "sharing"].includes(category)
  ) {
    return false;
  }
  if (category === "sale" && finding?.primaryUseContext?.saleOrSharing !== true) {
    return false;
  }
  if (
    category === "financial" &&
    finding?.primaryUseContext?.highRiskSecondaryUse !== true &&
    finding?.primaryUseContext?.highRiskOutsideSources !== true
  ) {
    return false;
  }
  if (["sale", "biometric", "sensitive"].includes(category) && evidenceCount === 0) {
    return false;
  }

  return true;
}

function normalizeDuplicateText(text = "") {
  return norm(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function evidenceTextsForDuplicateCheck(finding = {}) {
  return Array.isArray(finding.evidence)
    ? finding.evidence.map(normalizeDuplicateText).filter((item) => item.length >= 35)
    : [];
}

function evidenceOverlaps(a = {}, b = {}) {
  const aTexts = evidenceTextsForDuplicateCheck(a);
  const bTexts = evidenceTextsForDuplicateCheck(b);

  for (const left of aTexts) {
    for (const right of bTexts) {
      if (left === right) return true;
      if (left.length >= 70 && right.includes(left)) return true;
      if (right.length >= 70 && left.includes(right)) return true;
    }
  }

  return false;
}

function duplicatePreferenceScore(finding = {}) {
  const categoryPriority = {
    sale: 90,
    external_data: 85,
    biometric: 80,
    sensitive: 76,
    location: 72,
    tracking: 68,
    device_network: 64,
    financial: 58,
    sharing: 54,
    contacts_content: 50,
    identifiers: 30,
  };
  const severityPriority = { high: 30, medium: 18, low: 6 };
  const confidencePriority = { explicit: 12, likely: 8, possible: 3, low: 1 };

  const category = String(finding.category || "").toLowerCase();
  const severity = String(finding.severity || "").toLowerCase();
  const confidence = String(finding.confidence || "").toLowerCase();

  return (
    (categoryPriority[category] || 40) +
    (severityPriority[severity] || 0) +
    (confidencePriority[confidence] || 0) +
    Math.min(12, Math.max(0, Number(finding.score || 0)) / 4)
  );
}

function shouldTreatAsDuplicateFinding(a = {}, b = {}) {
  if (!evidenceOverlaps(a, b)) return false;

  const aCategory = String(a.category || "").toLowerCase();
  const bCategory = String(b.category || "").toLowerCase();
  if (!aCategory || !bCategory || aCategory === bCategory) return false;

  const sameSummary =
    normalizeDuplicateText(a.summary).length >= 35 &&
    normalizeDuplicateText(a.summary) === normalizeDuplicateText(b.summary);
  if (sameSummary) return true;

  const genericIdentifierDuplicate =
    (aCategory === "identifiers" &&
      ["device_network", "tracking", "location", "financial", "sensitive", "biometric"].includes(
        bCategory
      )) ||
    (bCategory === "identifiers" &&
      ["device_network", "tracking", "location", "financial", "sensitive", "biometric"].includes(
        aCategory
      ));

  if (genericIdentifierDuplicate) return true;

  const genericSensitiveDuplicate =
    (aCategory === "sensitive" && ["biometric", "location"].includes(bCategory)) ||
    (bCategory === "sensitive" && ["biometric", "location"].includes(aCategory));

  return genericSensitiveDuplicate;
}

function markDuplicateFinding(loser, winner) {
  loser.duplicateOf = winner.category;
  loser.duplicateReason = "same-evidence";
  loser.countAsRisk = false;
  loser.score = Math.max(4, Number(loser.score || 4) - 4);
}

function suppressDuplicateFindings(findings = []) {
  const sorted = [...findings].sort(
    (a, b) => duplicatePreferenceScore(b) - duplicatePreferenceScore(a)
  );
  const winners = [];

  for (const candidate of sorted) {
    const duplicate = winners.find((winner) =>
      shouldTreatAsDuplicateFinding(candidate, winner)
    );

    if (duplicate) {
      markDuplicateFinding(candidate, duplicate);
    } else {
      winners.push(candidate);
    }
  }

  return findings;
}

function mergeFindings(rawFindings) {
  const byCategory = new Map();

  for (const item of rawFindings) {
    const existing = byCategory.get(item.category);
    if (!existing || item.score > existing.score) {
      byCategory.set(item.category, item);
    }
  }

  return suppressDuplicateFindings(Array.from(byCategory.values())).sort(
    (a, b) => b.score - a.score
  );
}

export function extractFindings(sentences) {
  const units = buildSectionedUnits(sentences);
  const findings = [];

  for (const rule of FINDING_RULES) {
    const matched = [];

    for (const unit of units) {
      const detail = evidenceScore(rule, unit.text, unit.section);
      if (
        detail.score > 0 &&
        detail.specificHits > 0 &&
        !detail.deniedPracticeOnly &&
        !detail.nonUserContentOnly &&
        !(
          detail.limitedLegalOrRightsContext &&
          ["sensitive", "contacts_content", "tracking", "location", "sharing"].includes(
            rule.category
          )
        ) &&
        !(
          detail.disclosureInventoryOnly &&
          ["sale", "sharing", "tracking"].includes(rule.category)
        ) &&
        !detail.nonGeoLocationOnly
      ) {
        matched.push({ text: unit.text, ...detail });
      }
    }

    if (!matched.length) continue;
    matched.sort((a, b) => b.score - a.score);

    const topEvidence = cleanEvidenceForFinding(rule, matched, MAX_EVIDENCE_PER_ITEM);
    const strongHits = matched.reduce((n, m) => n + m.strongHits, 0);
    const mediumHits = matched.reduce((n, m) => n + m.mediumHits, 0);
    const adTechHits = matched.reduce((n, m) => n + m.adTechHits, 0);
    const negated = matched.some((m) => m.negated);
    const deniedPracticeOnly = matched.some((m) => m.deniedPracticeOnly);
    const permissionLimited = matched.some((m) => m.permissionLimited);
    const actionDependent = matched.some((m) => m.actionDependent);
    const safeContext = matched.some((m) => m.safeContext);
    const policyReferenceOnly =
      matched.length > 0 && matched.every((m) => m.policyReferenceOnly);
    const privacyChoiceOnly =
      matched.length > 0 && matched.every((m) => m.privacyChoiceOnly);
    const disclosureInventoryOnly =
      matched.length > 0 && matched.every((m) => m.disclosureInventoryOnly);
    const nonGeoLocationOnly =
      matched.length > 0 && matched.every((m) => m.nonGeoLocationOnly);
    const limitedLegalOrRightsContext =
      matched.length > 0 && matched.every((m) => m.limitedLegalOrRightsContext);
    const nonUserContentOnly =
      matched.length > 0 && matched.every((m) => m.nonUserContentOnly);
    const useContext = mergeUseContexts(matched);
    const primaryEvidence = topEvidence[0] || matched[0]?.text || "";
    const primaryUseContext = primaryEvidence
      ? getUseContext(rule, primaryEvidence)
      : matched[0]?.useContext || useContext;
    const priorityReason = priorityReasonForContext(rule, primaryUseContext);
    const riskLabel = riskLabelForContext(rule, primaryUseContext);
    const ambiguity = detectAmbiguity(matched);
    const sections = Array.from(new Set(matched.map((m) => m.section))).filter(Boolean);

    let confidence = determineConfidence(strongHits, mediumHits, negated, adTechHits);
    let severity = rule.severity;

    if (
      rule.category === "tracking" &&
      adTechHits > 0 &&
      primaryUseContext.highRiskSecondaryUse
    ) {
      severity = "high";
    }
    if (
      rule.category === "sharing" &&
      strongHits > 0 &&
      (primaryUseContext.highRiskSecondaryUse ||
        primaryUseContext.highRiskOutsideSources)
    ) {
      severity = "high";
    }
    if (rule.category === "identifiers" && strongHits === 0) severity = "medium";

    if (topEvidence.length) {
      severity = maybeLowerSeverityForContext(
        rule,
        topEvidence[0],
        confidence,
        primaryUseContext
      );
    }

    let score = rule.baseScore;

    if (confidence === "explicit") score += 8;
    else if (confidence === "likely") score += 4;
    else if (confidence === "low") score -= 6;

    if (severity === "high") score += 4;
    else if (severity === "low") score -= 4;

    if (negated) {
      score -=
        rule.category === "sale" || rule.category === "sharing"
          ? 10
          : rule.category === "tracking"
          ? 10
          : 6;
    }
    if (permissionLimited) score -= 3;
    else if (actionDependent) score -= 1;
    if (safeContext && rule.category === "tracking") score -= 4;
    if (
      privacyChoiceOnly &&
      ["sale", "tracking", "sharing"].includes(rule.category)
    ) {
      score -= 8;
    }
    if (
      disclosureInventoryOnly &&
      ["sale", "tracking", "sharing"].includes(rule.category)
    ) {
      score -= 8;
    }
    if (ambiguity) score += 2;
    if (primaryUseContext.secondaryUse) {
      score += primaryUseContext.highRiskSecondaryUse ? 5 : 2;
    }
    if (primaryUseContext.outsideSources) {
      score += primaryUseContext.highRiskOutsideSources ? 6 : 2;
    }
    if (primaryUseContext.broadPartnerLanguage) score += 3;
    if (primaryUseContext.expectedOperational && !primaryUseContext.secondaryUse) {
      score -= 4;
    }
    if (primaryUseContext.serviceProviderOnly) score -= 4;

    score = Math.max(4, score);

    if (
      negated &&
      ["sale", "sharing", "tracking"].includes(rule.category) &&
      (confidence === "low" || confidence === "possible")
    ) {
      continue;
    }

    let summary = buildAdjustedSummary(
      rule,
      negated,
      permissionLimited,
      safeContext,
      actionDependent,
      primaryUseContext
    );

    if (ambiguity) {
      summary =
        "This policy contains mixed or conflicting language about this issue. It may limit certain practices but still describes broad data use or sharing.";
    }

    const finding = {
      ruleId: ruleIdFor(rule),
      category: rule.category,
      title: rule.title,
      summary,
      confidence,
      severity,
      score,
      evidence: topEvidence,
      section: sections[0] || "general",
      sections,
      negated,
      deniedPracticeOnly,
      permissionLimited,
      actionDependent,
      safeContext,
      policyReferenceOnly,
      privacyChoiceOnly,
      disclosureInventoryOnly,
      nonGeoLocationOnly,
      limitedLegalOrRightsContext,
      nonUserContentOnly,
      useContext,
      primaryUseContext,
      priorityReason,
      riskLabel,
      evidenceLabels: topEvidence.map((item) =>
        evidenceLabelForText(item, riskLabel)
      ),
      ambiguity,
    };

    finding.normalOperationalUse = isNormalOperationalUse(finding);
    finding.countAsRisk = shouldCountAsRisk(finding);
    findings.push(finding);
  }

  return mergeFindings(findings);
}

export function analyzePolicy(sentences) {
  const { dataCollected, dataEvidence } = extractDataCategories(sentences);
  const findings = extractFindings(sentences);
  const practices = extractPolicyPractices(sentences);
  const quality = extractPolicyQuality(sentences, practices);

  return {
    dataCollected,
    dataEvidence,
    findings,
    practices,
    quality,
  };
}
