const appIdInput = document.getElementById('appId');
const saveBtn    = document.getElementById('save');
const statusEl   = document.getElementById('status');

// Load the saved App ID on open.
chrome.storage.sync.get(['inboxSdkAppId'], ({ inboxSdkAppId }) => {
  if (inboxSdkAppId) appIdInput.value = inboxSdkAppId;
});

saveBtn.addEventListener('click', () => {
  const appId = appIdInput.value.trim();

  if (!appId) {
    showStatus('App ID cannot be empty.', 'err');
    return;
  }

  // InboxSDK App IDs follow the pattern sdk_<name>_<10 hex chars>.
  // Warn but still allow saving in case the pattern changes.
  if (!/^sdk_/.test(appId)) {
    showStatus('App ID should start with "sdk_". Double-check the value.', 'err');
    return;
  }

  chrome.storage.sync.set({ inboxSdkAppId: appId }, () => {
    showStatus('Saved.', 'ok');
  });
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 3000);
}
