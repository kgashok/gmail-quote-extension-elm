const toggle      = document.getElementById('enabledToggle');
const hint        = document.getElementById('disabledHint');
const openOptions = document.getElementById('openOptions');

// Load saved enabled state (default: true).
chrome.storage.sync.get(['enabled'], ({ enabled }) => {
  const isEnabled = enabled !== false;
  toggle.checked = isEnabled;
  hint.style.display = isEnabled ? 'none' : 'block';
});

// Write immediately on change — no Save button needed.
toggle.addEventListener('change', () => {
  const isEnabled = toggle.checked;
  chrome.storage.sync.set({ enabled: isEnabled });
  hint.style.display = isEnabled ? 'none' : 'block';
});

// Open the options page.
openOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
