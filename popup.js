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
  const resultEl = document.getElementById("result");
  resultEl.textContent = "Starting...\n";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    resultEl.textContent += `Tab: ${tab.url}\n\nFinding policy links...\n`;

    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findPolicyLinks
    });

    const links = injected?.[0]?.result || [];
    resultEl.textContent += `Found ${links.length} link(s):\n${links.join("\n")}\n\n`;

    if (!links.length) {
      resultEl.textContent += "No privacy/terms links found on this page.\n";
      return;
    }

    resultEl.textContent += "Fetching policy pages...\n";
    let combined = "";

    for (const link of links) {
      try {
        const text = await extractTextFromPage(link);
        combined += `\n\nSOURCE: ${link}\n\n${text}`;
        resultEl.textContent += `✅ Fetched: ${link} (${text.length} chars)\n`;
      } catch (e) {
        resultEl.textContent += `❌ Failed: ${link}\n`;
      }
    }

    resultEl.textContent += "\nSending to API...\n";

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl: tab.url,
        policyUrls: links,
        text: combined
      })
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`API error ${res.status} ${res.statusText}\n${bodyText}`);
    }

    const data = await res.json();
    resultEl.textContent += "\n✅ API response:\n\n" + JSON.stringify(data, null, 2);
  } catch (err) {
    resultEl.textContent +=
      "\n❌ Error:\n" + String(err) +
      "\n\n(If this says 'Failed to fetch', the API server is probably not running or the URL/port is wrong.)";
  }
});
