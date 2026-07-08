// Content-script entry point.
//
// elm-content.js is compiled from src/Content.elm and defines the
// global `Elm` object.  All pure state-machine logic lives there; this
// file only bridges InboxSDK / Chrome APIs ↔ Elm ports.
//
// The InboxSDK App ID, enabled state, and blockquote style are all read from
// chrome.storage.sync (configured via the Options page and popup).

// Guard against duplicate initialisation on script re-injection.
if (!window.gmailElmContentInitialised) {
  window.gmailElmContentInitialised = true;

  chrome.storage.sync.get(
    ['inboxSdkAppId', 'enabled', 'blockquoteStyle'],
    ({ inboxSdkAppId, enabled, blockquoteStyle }) => {

      // Respect the popup toggle — default is enabled.
      if (enabled === false) return;

      if (!inboxSdkAppId) {
        console.warn(
          '[Gmail Quote Selected] No InboxSDK App ID configured. ' +
          'Click the extension icon → "Style & settings" to set one.'
        );
        return;
      }

      // Merge saved style with hardcoded defaults so missing keys never crash.
      const style = Object.assign(
        { borderColor: '#007bff', borderWidth: 3, boxBorderColor: '#e0e0e0', bgColor: '#f0f7ff', textStyle: 'italic', fontFamily: 'inherit' },
        blockquoteStyle || {}
      );

      const app = Elm.Content.init();

      // ── InboxSDK compose-view tracking ───────────────────────────────────

      // We keep a JS-side list of live compose views because the composeView
      // objects are JS values that Elm cannot hold.
      const activeComposeViews = [];

      function getOpenComposeView() {
        return activeComposeViews.find(view => !view.isMinimized()) || null;
      }

      InboxSDK.load(2, inboxSdkAppId).then(sdk => {
        sdk.Compose.registerComposeViewHandler(composeView => {
          activeComposeViews.push(composeView);
          composeView.on('destroy', () => {
            const idx = activeComposeViews.indexOf(composeView);
            if (idx !== -1) activeComposeViews.splice(idx, 1);
          });

          // Tell Elm a compose view just opened so it can flush any pending quote.
          app.ports.onComposeViewOpened.send(null);
        });
      });

      // ── Chrome → Elm ──────────────────────────────────────────────────────

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'triggerReply') {
          sendResponse({ status: 'received' });

          // Pre-check in JS whether a compose view is already open so Elm
          // receives the right event and can decide immediately.
          const openView = getOpenComposeView();
          if (openView) {
            app.ports.onTriggerReplyWithOpenView.send(request.text);
          } else {
            app.ports.onTriggerReplyNoView.send(request.text);
          }
        }
        return true;
      });

      // ── Elm → DOM / InboxSDK ──────────────────────────────────────────────

      // Elm asks us to insert quoted text into the currently open compose view.
      app.ports.insertQuote.subscribe(text => {
        const view = getOpenComposeView();
        if (!view) return;

        const css = buildQuoteCSS(style);
        const quoteHTML =
          `<blockquote style="${css}">${escapeHtml(text)}</blockquote>`;

        view.insertHTMLIntoBodyAtCursor(quoteHTML);
      });

      // Elm asks us to click the nearest Gmail reply button so a compose view
      // opens (which will trigger onComposeViewOpened above).
      app.ports.triggerReplyButton.subscribe(() => {
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
          // Last resort: fire Gmail's native reply shortcut.
          document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'r', bubbles: true })
          );
        }
      });

      // ── DOM helpers ───────────────────────────────────────────────────────

      // Walks up the DOM from the selection anchor to find the closest reply button.
      function findNearestReplyButton(start) {
        let el = start;
        while (el && el !== document.body) {
          const btn = findReplyButton(el);
          if (btn) return btn;
          el = el.parentElement;
        }
        return null;
      }

      // Finds the best reply button in a container, preferring "Reply All".
      function findReplyButton(container) {
        if (!container) return null;
        const candidates = Array.from(
          container.querySelectorAll('[role="button"], button, a, .ams')
        ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

        return (
          candidates.find(isReplyAllButton) ||
          candidates.find(isReplyButton) ||
          null
        );
      }

      function isReplyButton(el) {
        const hay = getHay(el);
        return (
          hay.includes('reply') ||
          hay.includes('répondre') ||
          hay.includes('responder')
        );
      }

      function isReplyAllButton(el) {
        const hay = getHay(el);
        return (
          isReplyButton(el) &&
          (hay.includes('all') || hay.includes('tous') || hay.includes('todos'))
        );
      }

      function getHay(el) {
        return [
          el.innerText || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('data-tooltip') || ''
        ]
          .join(' ')
          .toLowerCase();
      }

      // Prevents XSS by escaping user-selected text before embedding in HTML.
      function escapeHtml(text) {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // Builds the inline CSS string for the blockquote from user preferences.
      function buildQuoteCSS(s) {
        const fontStyle  = s.textStyle.includes('italic') ? 'italic' : 'normal';
        const fontWeight = s.textStyle.includes('bold')   ? 'bold'   : 'normal';
        const fontFamily = s.fontFamily === 'inherit' ? 'inherit' : s.fontFamily;

        return [
          `border:1px solid ${s.boxBorderColor}`,
          `border-left:${s.borderWidth}px solid ${s.borderColor}`,
          'padding:6px 10px',
          'margin:0 0 6px 0',
          'color:#444',
          `font-style:${fontStyle}`,
          `font-weight:${fontWeight}`,
          `font-family:${fontFamily}`,
          `background-color:${s.bgColor}`,
        ].join(';');
      }
    }
  );
}
