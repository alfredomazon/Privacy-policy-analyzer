const KEY = 'gpt5Enabled';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([KEY], (res) => {
    if (res[KEY] === undefined) {
      chrome.storage.local.set({ [KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'getStatus') {
    chrome.storage.local.get([KEY], (res) => {
      sendResponse({ enabled: !!res[KEY] });
    });
    return true; // indicate async response
  }

  if (msg.type === 'setStatus') {
    chrome.storage.local.set({ [KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true; // indicate async response
  }
});
