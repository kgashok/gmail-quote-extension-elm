// Content-script entry point.
//
// elm-content.js is compiled from src/Content.elm and defines the
// global `Elm` object.  All pure state-machine logic lives there; this
// file only bridges InboxSDK / Chrome APIs ↔ Elm ports.
//
// The InboxSDK App ID, enabled state, and blockquote style are all read from
// chrome.storage.sync (configured via the Options page and popup).

const TAG = '[GmailQuoteSelected]';

// Guard against duplicate initialisation on script re-injection.
if (!window.gmailElmContentInitialised) {
  window.gmailElmContentInitialised = true;
  console.log(TAG, 'content_init.js starting — reading storage...');

  chrome.storage.sync.get(
    ['inboxSdkAppId', 'enabled', 'blockquoteStyle'],
    ({ inboxSdkAppId, enabled, blockquoteStyle }) => {
      console.log(TAG, 'storage read →', { inboxSdkAppId: inboxSdkAppId ? '✓ set' : '✗ missing', enabled });

      if (enabled === false) {
        console.log(TAG, 'extension disabled via popup toggle — stopping.');
        return;
      }

      if (!inboxSdkAppId) {
        console.warn(TAG, 'No InboxSDK App ID — opening Options page. Set your ID there, then reload Gmail.');
        chrome.runtime.sendMessage({ action: 'openOptions' });
        return;
      }

      const style = Object.assign(
        { borderColor: '#007bff', borderWidth: 3, boxBorderColor: '#e0e0e0', bgColor: '#f0f7ff', textStyle: 'italic', fontFamily: 'inherit' },
        blockquoteStyle || {}
      );

      console.log(TAG, 'initialising Elm.Content...');
      const app = Elm.Content.init();
      console.log(TAG, 'Elm.Content ready. Ports:', Object.keys(app.ports));

      // ── InboxSDK compose-view tracking ───────────────────────────────────

      const activeComposeViews = [];

      function getOpenComposeView() {
        return activeComposeViews.find(view => !view.isMinimized()) || null;
      }

      console.log(TAG, `loading InboxSDK v2 with App ID "${inboxSdkAppId}"...`);
      InboxSDK.load(2, inboxSdkAppId).then(sdk => {
        console.log(TAG, 'InboxSDK loaded ✓ — registering compose view handler.');
        sdk.Compose.registerComposeViewHandler(composeView => {
          console.log(TAG, 'compose view opened → tracking it.');
          activeComposeViews.push(composeView);
          composeView.on('destroy', () => {
            const idx = activeComposeViews.indexOf(composeView);
            if (idx !== -1) activeComposeViews.splice(idx, 1);
            console.log(TAG, 'compose view destroyed. Active views:', activeComposeViews.length);
          });
          app.ports.onComposeViewOpened.send(null);
        });
      }).catch(err => {
        console.error(TAG, 'InboxSDK.load failed:', err);
      });

      // ── Chrome → Elm ──────────────────────────────────────────────────────

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'triggerReply') {
          console.log(TAG, 'received triggerReply. text length:', request.text?.length, '| open compose views:', activeComposeViews.length);
          sendResponse({ status: 'received' });

          const openView = getOpenComposeView();
          if (openView) {
            console.log(TAG, 'compose view is open → sending TriggerReplyWithOpenView to Elm.');
            app.ports.onTriggerReplyWithOpenView.send(request.text);
          } else {
            console.log(TAG, 'no compose view open → sending TriggerReplyNoView to Elm (will click reply button).');
            app.ports.onTriggerReplyNoView.send(request.text);
          }
        }
        return true;
      });

      // ── Elm → DOM / InboxSDK ──────────────────────────────────────────────

      app.ports.insertQuote.subscribe(text => {
        const view = getOpenComposeView();
        console.log(TAG, 'insertQuote fired. text length:', text?.length, '| view found:', !!view);
        if (!view) {
          console.warn(TAG, 'insertQuote: no open compose view to insert into.');
          return;
        }

        const css = buildQuoteCSS(style);
        const quoteHTML =
          `<blockquote style="${css}">${escapeHtml(text)}</blockquote>`;
        view.insertHTMLIntoBodyAtCursor(quoteHTML);
        console.log(TAG, 'quote inserted ✓');
      });

      app.ports.triggerReplyButton.subscribe(() => {
        console.log(TAG, 'triggerReplyButton fired — searching for reply button...');
        const selection = window.getSelection();
        let button = null;

        if (selection && selection.rangeCount > 0) {
          const anchor = selection.anchorNode;
          const el = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
          if (el) button = findNearestReplyButton(el);
        }

        if (!button) button = findReplyButton(document.body);

        if (button) {
          console.log(TAG, 'reply button found → clicking.');
          button.click();
        } else {
          console.warn(TAG, 'no reply button found — dispatching keyboard "r" as fallback.');
          document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'r', bubbles: true })
          );
        }
      });

      // ── DOM helpers ───────────────────────────────────────────────────────

      function findNearestReplyButton(start) {
        let el = start;
        while (el && el !== document.body) {
          const btn = findReplyButton(el);
          if (btn) return btn;
          el = el.parentElement;
        }
        return null;
      }

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

      function escapeHtml(text) {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

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
} else {
  console.log(TAG, 'content_init.js skipped — already initialised on this page.');
}
