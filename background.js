// Setup context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'quote-reply',
    title: 'Reply to all with Quote',
    contexts: ['selection']
  });
});

// Listener 1: Handle right-click context menu usage
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'quote-reply') {
    sendQuoteReply(tab.id, info.selectionText);
  }
});

// Listener 2: Handle keyboard shortcut usage
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'run-quote-reply' && tab.url.includes('mail.google.com')) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });
      const text = result?.result;
      if (text?.trim()) sendQuoteReply(tab.id, text);
    } catch (err) {
      console.error('Shortcut failed to grab text:', err);
    }
  }
});

// Sends the selected text to the content script.
// inboxsdk.js and content.js are normally already loaded via the manifest
// on every mail.google.com page. However, tabs that were already open
// before the extension was installed/updated never get the manifest's
// content scripts injected, and there's a brief window right after a
// Gmail SPA navigation where the listener isn't registered yet. In both
// cases chrome.tabs.sendMessage fails with "Could not establish
// connection. Receiving end does not exist." We recover by injecting
// the scripts on demand and retrying.
async function sendQuoteReply(tabId, text) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'triggerReply', text });
  } catch (err) {
    if (!isConnectionError(err)) {
      console.error('Message send failed:', err);
      return;
    }

    try {
      // Ensure the content scripts are present, then retry once.
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['inboxsdk.js', 'content.js']
      });

      // Give the freshly-injected listener a moment to register.
      await new Promise(resolve => setTimeout(resolve, 100));

      await chrome.tabs.sendMessage(tabId, { action: 'triggerReply', text });
    } catch (retryErr) {
      console.error('Message send failed after re-injection retry:', retryErr);
    }
  }
}

function isConnectionError(err) {
  return typeof err?.message === 'string' &&
    err.message.includes('Could not establish connection');
}
