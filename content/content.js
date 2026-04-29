(async () => {
  try {
    const mod = await import(chrome.runtime.getURL("lib/contentMain.js"));
    if (typeof mod.runContentAnalysis === "function") {
      await mod.runContentAnalysis();
    } else {
      console.error("runContentAnalysis not found");
    }
  } catch (err) {
    console.error("Failed to run content analysis:", err);
  }
})();