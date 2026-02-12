const API_URL = "http://localhost:8000/analyze";

async function findPolicyLinks() {
  const anchors = Array.from(document.querySelectorAll("a"));

  const keywords = [
    "privacy",
    "terms",
    "policy",
    "legal",
    "tos",
    "conditions"
  ];

  const matches = anchors.filter(a => {
    const text = (a.innerText || "").toLowerCase();
    const href = (a.href || "").toLowerCase();

    return keywords.some(k => text.includes(k) || href.includes(k));
  });

  return matches.slice(0, 3).map(a => a.href);
}

async function extractTextFromPage(url) {
  const res = await fetch(url);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("script, style, img").forEach(e => e.remove());

  return doc.body.innerText.slice(0, 200000);
}

document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: findPolicyLinks
  });

  const links = injected[0].result;

  let combined = "";

  for (const link of links) {
    try {
      const text = await extractTextFromPage(link);
      combined += `\n\nSOURCE: ${link}\n\n${text}`;
    } catch (e) {
      console.error("Failed to fetch:", link);
    }
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceUrl: tab.url,
      policyUrls: links,
      text: combined
    })
  });

  const data = await res.json();

  document.getElementById("result").textContent =
    JSON.stringify(data, null, 2);
});
