// Service-worker entry point.
//
// elm-background.js is compiled from src/Background.elm and defines the
// global `Elm` object.  All pure routing logic lives there; this file
// only bridges Chrome APIs ↔ Elm ports.

importScripts('elm-background.js');

const app = Elm.Background.init();

// ── Chrome API setup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'quote-reply',
    title: 'Reply to all with Quote',
    contexts: ['selection']
  });
});

// ── Chrome → Elm ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'quote-reply') {
    app.ports.onContextMenuClicked.send({ tabId: tab.id, text: info.selectionText });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'run-quote-reply' && tab.url.includes('mail.google.com')) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });
      const text = result?.result;
      if (text?.trim()) {
        app.ports.onCommandFired.send({ tabId: tab.id, text });
      }
    } catch (err) {
      console.error('Shortcut failed to grab selection text:', err);
    }
  }
});

// ── Elm → Chrome ─────────────────────────────────────────────────────────────

// Elm asks us to deliver a quote-reply to a specific tab.
app.ports.sendQuoteReply.subscribe(async ({ tabId, text }) => {
  await deliverQuoteReply(tabId, text);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Sends the selected text to the content script.
// Tabs that were open before the extension was installed/updated never get
// the manifest content scripts injected, and there is a brief window right
// after a Gmail SPA navigation where the listener isn't registered yet.  In
// both cases chrome.tabs.sendMessage fails with "Could not establish
// connection".  We recover by injecting the scripts on demand and retrying.
async function deliverQuoteReply(tabId, text) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'triggerReply', text });
  } catch (err) {
    if (!isConnectionError(err)) {
      console.error('Message send failed:', err);
      return;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['inboxsdk.js', 'elm-content.js', 'content_init.js']
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
