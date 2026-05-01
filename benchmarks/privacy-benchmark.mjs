export const benchmarkCases = [
  {
    id: "normal-retail-payment",
    name: "Normal retail checkout data",
    host: "www.example-shop.test",
    policyUrl: "https://www.example-shop.test/privacy",
    policyText: `
      Example Shop Privacy Policy.
      Information we collect.
      We collect account information, shipping address, and payment details when you purchase products from us.
      How we use information.
      We use this information to process orders, provide support, prevent fraud, and deliver the service.
      How we share information.
      We share information with service providers that help operate checkout, shipping, payment processing, and customer support.
      Cookies.
      We use essential cookies for login, security, and service functionality.
      Your rights include access, deletion, and correction.
      Contact us with privacy questions.
    `,
    expected: {
      level: "blue",
      excludeCategories: ["financial", "sale", "external_data"],
      maxCountedRisks: 0,
    },
  },
  {
    id: "targeted-ad-sharing",
    name: "Targeted advertising sharing",
    host: "ads.example.test",
    policyUrl: "https://ads.example.test/privacy",
    policyText: `
      Advertising Example Privacy Policy.
      Information we collect includes identifiers and internet activity.
      We use cookies and similar technologies.
      We may share your personal information with advertising partners for targeted advertising and cross-context behavioral advertising.
      You can opt out of targeted advertising in your privacy choices.
      We explain data retention, privacy rights, and contact information.
    `,
    expected: {
      level: "yellow",
      includeCategories: ["sale"],
      includeTitleParts: ["sell personal information"],
    },
  },
  {
    id: "denied-sensitive-ads",
    name: "Denied sensitive ad targeting",
    host: "video.example.test",
    policyUrl: "https://video.example.test/privacy",
    policyText: `
      Video Example Privacy Policy.
      We do not show you personalized ads based on sensitive categories, such as race, religion, sexual orientation, or health.
      We use information to provide the service, maintain security, and communicate with you.
      We describe privacy rights, retention, and contact information.
    `,
    expected: {
      level: "blue",
      excludeCategories: ["sensitive", "tracking", "sale"],
      maxCountedRisks: 0,
    },
  },
  {
    id: "denied-data-brokers",
    name: "Denied data broker use",
    host: "community.example.test",
    policyUrl: "https://community.example.test/privacy",
    policyText: `
      Community Example Privacy Policy.
      We collect the least amount of data possible while maintaining safety measures and the effective operation of the platform.
      We never sell private data, and we never work with data brokers.
      We use information to provide the service, maintain security, and respond to support requests.
      Your privacy rights include access and deletion.
    `,
    expected: {
      level: "blue",
      excludeCategories: ["external_data", "sale"],
      maxCountedRisks: 0,
    },
  },
  {
    id: "public-source-enrichment",
    name: "Public-source profile enrichment",
    host: "profiles.example.test",
    policyUrl: "https://profiles.example.test/privacy",
    policyText: `
      Profile Example Privacy Policy.
      We collect information you provide and information from publicly available sources such as public posts on social media platforms and public databases.
      We may combine this information with information we collect directly to improve advertising, personalization, and profile recommendations.
      We use cookies and analytics and explain privacy rights, retention, and contact information.
    `,
    expected: {
      level: "yellow",
      includeCategories: ["external_data"],
      includeTitleParts: ["outside sources"],
    },
  },
  {
    id: "tracker-heavy-publisher",
    name: "Tracker-heavy publisher page",
    host: "publisher.example.test",
    isLikelyPolicyPage: false,
    networkUrls: [
      "https://ad.doubleclick.net/activity",
      "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
      "https://connect.facebook.net/en_US/fbevents.js",
      "https://analytics.google.com/g/collect",
    ],
    expected: {
      level: "yellow",
      trackerLevel: "high",
      minTrackerCount: 3,
    },
  },
  {
    id: "cloudflare-challenge-link",
    name: "Security challenge infrastructure link",
    host: "www.fandom.com",
    pageUrl: "https://www.fandom.com/",
    linkCandidates: [
      {
        href: "https://www.cloudflare.com/privacypolicy/",
        text: "Privacy",
        title: "Performance and Security by Cloudflare",
        inFooterOrNav: true,
      },
    ],
    expected: {
      bestPolicyLink: "",
    },
  },
  {
    id: "known-dynamic-policy",
    name: "Known registry for dynamic site",
    host: "store.steampowered.com",
    expected: {
      registryUrl: "https://store.steampowered.com/privacy_agreement/",
    },
  },
];
