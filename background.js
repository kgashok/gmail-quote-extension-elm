// Service-worker entry point.
//
// elm-background.js is compiled from src/Background.elm and defines the
// global `Elm` object.  All pure routing logic lives there; this file
// only bridges Chrome APIs ↔ Elm ports.

const TAG = '[GmailQuoteSelected bg]';

importScripts('elm-background.js');

console.log(TAG, 'service worker starting...');
const app = Elm.Background.init();
console.log(TAG, 'Elm.Background ready. Ports:', Object.keys(app.ports));

// ── Chrome API setup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'quote-reply',
    title: 'Reply to all with Quote',
    contexts: ['selection']
  });

  chrome.storage.sync.get(['inboxSdkAppId'], ({ inboxSdkAppId }) => {
    if (!inboxSdkAppId) {
      console.log(TAG, 'onInstalled: no App ID in storage — opening Options page.');
      chrome.runtime.openOptionsPage();
    } else {
      console.log(TAG, 'onInstalled: App ID already configured ✓');
    }
  });
});

// Content scripts cannot call openOptionsPage() directly.
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'openOptions') {
    console.log(TAG, 'received openOptions request from content script.');
    chrome.runtime.openOptionsPage();
  }
});

// ── Chrome → Elm ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'quote-reply') {
    console.log(TAG, 'context menu clicked. tabId:', tab?.id, 'text length:', info.selectionText?.length);
    app.ports.onContextMenuClicked.send({ tabId: tab.id, text: info.selectionText });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  console.log(TAG, 'command fired:', command, '| tab:', tab?.id, tab?.url?.substring(0, 50));
  if (command !== 'run-quote-reply') return;
  if (!tab?.url?.includes('mail.google.com')) {
    console.warn(TAG, 'command ignored — not on mail.google.com');
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.getSelection()?.toString() ?? ''
    });
    console.log(TAG, 'selection results from', results?.length, 'frame(s):', results?.map(r => r?.result?.length ?? 0));
    const text = (results || []).map(r => r?.result ?? '').find(t => t && t.trim());
    if (text) {
      console.log(TAG, 'sending onCommandFired with text length:', text.length);
      app.ports.onCommandFired.send({ tabId: tab.id, text });
    } else {
      console.warn(TAG, 'no selected text found in any frame — nothing sent.');
    }
  } catch (err) {
    console.error(TAG, 'shortcut failed to grab selection text:', err);
  }
});

// ── Elm → Chrome ─────────────────────────────────────────────────────────────

app.ports.sendQuoteReply.subscribe(async ({ tabId, text }) => {
  console.log(TAG, 'Elm requests sendQuoteReply → tabId:', tabId, 'text length:', text?.length);
  await deliverQuoteReply(tabId, text);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function deliverQuoteReply(tabId, text) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'triggerReply', text });
    console.log(TAG, 'triggerReply delivered to tab', tabId);
  } catch (err) {
    if (!isConnectionError(err)) {
      console.error(TAG, 'message send failed (non-connection error):', err);
      return;
    }

    console.warn(TAG, 'connection error — content script not ready. Checking Elm state...');

    try {
      const [{ result: elmAlreadyLoaded }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => !!(window.Elm && window.Elm.Content)
      });

      console.log(TAG, 'Elm.Content already in tab:', elmAlreadyLoaded);

      if (elmAlreadyLoaded) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => { delete window.gmailElmContentInitialised; }
        });
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content_init.js']
        });
        console.log(TAG, 're-ran content_init.js (Elm already loaded).');
      } else {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['inboxsdk.js', 'elm-content.js', 'content_init.js']
        });
        console.log(TAG, 'injected full script stack.');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      await chrome.tabs.sendMessage(tabId, { action: 'triggerReply', text });
      console.log(TAG, 'triggerReply delivered on retry.');
    } catch (retryErr) {
      console.error(TAG, 'message send failed after re-injection retry:', retryErr);
    }
  }
}

function isConnectionError(err) {
  return typeof err?.message === 'string' &&
    err.message.includes('Could not establish connection');
}
