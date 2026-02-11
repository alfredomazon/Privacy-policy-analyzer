const KEY = 'gpt5Enabled';
const SERVER_URL_KEY = 'gpt5ServerUrl';
const SERVER_TOKEN_KEY = 'gpt5ServerToken';
const SERVER_SYNC_KEY = 'gpt5ServerSync';

const checkbox = document.getElementById('gpt5-toggle');
const statusEl = document.getElementById('status');
const serverUrlInput = document.getElementById('server-url');
const serverTokenInput = document.getElementById('server-token');
const syncCheckbox = document.getElementById('sync-checkbox');
const serverStatusEl = document.getElementById('server-status');
const toastContainer = document.getElementById('toast-container');

function setStatusText(enabled){
  statusEl.textContent = enabled ? 'Enabled (local setting)' : 'Disabled (local setting)';
}

function showToast(message, type='info'){
  if(!toastContainer) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(()=> el.classList.add('visible'));
  setTimeout(()=>{ el.classList.remove('visible'); setTimeout(()=> el.remove(), 220); }, 3500);
}

function loadStatus(){
  chrome.runtime.sendMessage({type:'getStatus'}, (res) => {
    const enabled = !!(res && res.enabled);
    checkbox.checked = enabled;
    setStatusText(enabled);
  });
  // load server config
  chrome.storage.local.get([SERVER_URL_KEY, SERVER_TOKEN_KEY, SERVER_SYNC_KEY], (res) => {
    if(res){
      serverUrlInput.value = res[SERVER_URL_KEY] || '';
      serverTokenInput.value = res[SERVER_TOKEN_KEY] || '';
      syncCheckbox.checked = !!res[SERVER_SYNC_KEY];
    }
  });
}

checkbox.addEventListener('change', () => {
  const enabled = checkbox.checked;
  chrome.runtime.sendMessage({type:'setStatus', enabled}, (res) => {
    setStatusText(enabled);
    if(syncCheckbox.checked && serverUrlInput.value){
      syncToServer(serverUrlInput.value, serverTokenInput.value, enabled);
    } else {
      showToast('Local setting saved', 'success');
    }
  });
});

function syncToServer(url, token, enabled){
  serverStatusEl.textContent = 'Syncing...';
  showToast('Syncing to server...', 'info');
  fetch(`${url.replace(/\/$/, '')}/status`, {
    method: 'POST',
    headers: Object.assign({'Content-Type':'application/json'}, token ? {'X-Admin-Token': token} : {}),
    body: JSON.stringify({enabled})
  }).then(r => r.json())
    .then(j => {
      const ok = j && j.ok;
      serverStatusEl.textContent = ok ? 'Server updated' : 'Server update failed';
      showToast(ok ? 'Server updated' : 'Server update failed', ok ? 'success' : 'error');
    }).catch(err => {
      const msg = err && err.message ? err.message : String(err);
      serverStatusEl.textContent = 'Sync error: ' + msg;
      showToast('Sync error: ' + msg, 'error');
    });
}

// save server config when inputs change
serverUrlInput.addEventListener('change', () => {
  chrome.storage.local.set({[SERVER_URL_KEY]: serverUrlInput.value});
  showToast('Server URL saved', 'info');
});
serverTokenInput.addEventListener('change', () => {
  chrome.storage.local.set({[SERVER_TOKEN_KEY]: serverTokenInput.value});
  showToast('Server token saved', 'info');
});
syncCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({[SERVER_SYNC_KEY]: !!syncCheckbox.checked});
  showToast(syncCheckbox.checked ? 'Sync enabled' : 'Sync disabled', 'info');
});

document.addEventListener('DOMContentLoaded', loadStatus);

async function loadSettings() {
  const stored = await chrome.storage.local.get([TOKEN_KEY]);
  tokenInput.value = stored[TOKEN_KEY] || "";
}

tokenInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ [TOKEN_KEY]: tokenInput.value.trim() });
});

btn.addEventListener("click", async () => {
  const text = textArea.value.trim();
  if (!text) {
    out.textContent = "Paste some policy text first.";
    return;
  }

  out.textContent = "Analyzing...";

  chrome.runtime.sendMessage({ type: "analyzePolicy", text }, (res) => {
    if (!res) {
      out.textContent = "No response (background may not be running).";
      return;
    }
    if (!res.ok) {
      out.textContent = `Error: ${res.error}\n\n${JSON.stringify(res.details || {}, null, 2)}`;
      return;
    }

    // Your server returns: { ok:true, result:{...} } OR { ok:true, data:{...} } depending on your wrapper
    // In our background.js we return {ok:true, data: <serverResponse>}
    out.textContent = JSON.stringify(res.data, null, 2);
  });
});

loadSettings();