let pendingQuoteText = null;

// Tracks every compose/reply view currently open on the page, so we can
// insert directly into one that's already open (Issue #1) instead of
// only reacting to newly-opened compose views.
const activeComposeViews = [];

// Initialize InboxSDK once the page is ready.
// Replace 'YOUR_APP_ID_HERE' with a free App ID from https://www.inboxsdk.com/
InboxSDK.load(2, 'sdk_replyquote_4d30d2dcd9').then(sdk => {
  // This handler fires automatically whenever Gmail opens any compose or reply window,
  // including ones that were already open when the handler was registered.
  // No MutationObserver, no polling — the SDK manages the lifecycle entirely.
  sdk.Compose.registerComposeViewHandler(composeView => {
    activeComposeViews.push(composeView);
    composeView.on('destroy', () => {
      const idx = activeComposeViews.indexOf(composeView);
      if (idx !== -1) activeComposeViews.splice(idx, 1);
    });

    if (pendingQuoteText) {
      const text = pendingQuoteText;
      pendingQuoteText = null;
      insertQuote(composeView, text);
    }
  });
});

// Returns an already-open, non-minimized compose view, if one exists.
function getOpenComposeView() {
  return activeComposeViews.find(view => !view.isMinimized()) || null;
}

function insertQuote(composeView, text) {
  const quoteStyle = [
    'border-left:3px solid #007bff',
    'padding:6px 10px',
    'margin:0 0 6px 0',
    'color:#444',
    'font-style:italic',
    'background-color:#f0f7ff'
  ].join(';');

  // No trailing <br> here (Issue #2): since <blockquote> is already a block-level
  // element, the cursor naturally lands on the next line right after it. Adding a
  // <br> after the blockquote pushed the cursor down one extra blank line.
  const quoteHTML = `<blockquote style="${quoteStyle}">${escapeHtml(text)}</blockquote>`;

  // The SDK handles cursor placement and rich-text sanitization internally.
  composeView.insertHTMLIntoBodyAtCursor(quoteHTML);
}

// Guard against duplicate listener registration on script re-injection
if (!window.gmailQuoteListenerAdded) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'triggerReply') {
      sendResponse({ status: 'received' });
      handleQuoteReply(request.text);
    }
    return true;
  });
  window.gmailQuoteListenerAdded = true;
}

// If the user already has a compose/reply dialog open, insert straight into it.
// Otherwise, store the quote text and click the nearest reply button —
// InboxSDK's composeViewHandler picks it up once the new compose view opens.
function handleQuoteReply(quoteText) {
  const openComposeView = getOpenComposeView();
  if (openComposeView) {
    insertQuote(openComposeView, quoteText);
    return;
  }

  pendingQuoteText = quoteText;
  triggerReplyButton();
}

function triggerReplyButton() {
  const selection = window.getSelection();
  let button = null;

  if (selection && selection.rangeCount > 0) {
    const anchor = selection.anchorNode;
    const el = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    if (el) button = findNearestReplyButton(el);
  }

  if (!button) button = findReplyButton(document.body);

  if (button) {
    button.click();
  } else {
    // Last resort: fire Gmail's native reply shortcut
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
  }
}

// Walks up the DOM from the selection anchor to find the closest reply button
function findNearestReplyButton(start) {
  let el = start;
  while (el && el !== document.body) {
    const btn = findReplyButton(el);
    if (btn) return btn;
    el = el.parentElement;
  }
  return null;
}

// Finds the best reply button in a container, preferring "Reply All" over "Reply"
function findReplyButton(container) {
  if (!container) return null;
  const candidates = Array.from(
    container.querySelectorAll('[role="button"], button, a, .ams')
  ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

  return candidates.find(isReplyAllButton) || candidates.find(isReplyButton) || null;
}

function isReplyButton(el) {
  const hay = getHay(el);
  return hay.includes('reply') || hay.includes('répondre') || hay.includes('responder');
}

function isReplyAllButton(el) {
  const hay = getHay(el);
  return isReplyButton(el) && (hay.includes('all') || hay.includes('tous') || hay.includes('todos'));
}

function getHay(el) {
  return [
    el.innerText || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('data-tooltip') || ''
  ].join(' ').toLowerCase();
}

// Prevents XSS by escaping user-selected text before embedding it in HTML
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
