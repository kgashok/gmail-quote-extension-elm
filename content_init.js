// Content-script entry point.
//
// elm-content.js is compiled from src/Content.elm and defines the
// global `Elm` object.  All pure state-machine logic lives there; this
// file only bridges Chrome APIs ↔ Elm ports.
//
// NOTE: InboxSDK is intentionally NOT used here.  InboxSDK.load() hangs on
// current Gmail builds because InboxSDK 2.x cannot locate Gmail's internal
// elements.  Instead we use a MutationObserver to detect Gmail compose bodies
// directly and insert HTML via document.execCommand / DOM APIs.

const TAG = '[GmailQuoteSelected]';

// This line runs unconditionally — if you don't see it, content scripts aren't loading.
console.log(TAG, 'content_init.js FILE LOADED (guard:', window.gmailElmContentInitialised, ')');

if (!window.gmailElmContentInitialised) {
  window.gmailElmContentInitialised = true;
  console.log(TAG, 'content_init.js starting — reading storage...');

  chrome.storage.sync.get(
    ['inboxSdkAppId', 'enabled', 'blockquoteStyle'],
    ({ inboxSdkAppId, enabled, blockquoteStyle }) => {
      console.log(TAG, 'storage read →', {
        inboxSdkAppId: inboxSdkAppId ? '✓ set' : '✗ missing',
        enabled
      });

      if (enabled === false) {
        console.log(TAG, 'extension disabled via popup toggle — stopping.');
        return;
      }

      // App ID is not needed at runtime any more (no InboxSDK), but we still
      // require it to be set so unconfigured installs open the Options page.
      if (!inboxSdkAppId) {
        console.warn(TAG, 'No App ID configured — opening Options page.');
        chrome.runtime.sendMessage({ action: 'openOptions' });
        return;
      }

      const style = Object.assign(
        {
          borderColor: '#007bff', borderWidth: 3,
          boxBorderColor: '#e0e0e0', bgColor: '#f0f7ff',
          textStyle: 'italic', fontFamily: 'inherit'
        },
        blockquoteStyle || {}
      );

      console.log(TAG, 'initialising Elm.Content...');
      const app = Elm.Content.init();
      console.log(TAG, 'Elm.Content ready. Ports:', Object.keys(app.ports));

      // ── Compose-view tracking (MutationObserver replaces InboxSDK) ────────
      //
      // Gmail renders the compose body as a contenteditable <div>.  We watch
      // for new ones appearing in the DOM so we can tell Elm a compose view
      // opened and insert the pending quote.

      // Selectors for Gmail's compose body, from most to least specific.
      // Gmail's class names are minified and change; attribute selectors are
      // more stable across Gmail updates.
      const COMPOSE_SELECTORS = [
        'div[aria-label="Message Body"][contenteditable="true"]',
        'div[aria-label="message body"][contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[g_editable="true"]',
        'div.Am.Al.editable[contenteditable="true"]',
        'div.editable[contenteditable="true"]',
      ];

      function findComposeBody() {
        for (const sel of COMPOSE_SELECTORS) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
        return null;
      }

      // Track which compose bodies we have already notified Elm about so we
      // don't fire onComposeViewOpened multiple times for the same element.
      const seenComposeBodies = new WeakSet();

      function checkForNewComposeBody() {
        const body = findComposeBody();
        if (body && !seenComposeBodies.has(body)) {
          seenComposeBodies.add(body);
          console.log(TAG, 'compose body detected by MutationObserver → notifying Elm.');
          app.ports.onComposeViewOpened.send(null);
        }
      }

      const composeObserver = new MutationObserver(checkForNewComposeBody);
      composeObserver.observe(document.body, { childList: true, subtree: true });
      console.log(TAG, 'MutationObserver watching for compose bodies.');

      // Also check immediately in case a compose view is already open.
      checkForNewComposeBody();

      // ── Chrome → Elm ──────────────────────────────────────────────────────

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'triggerReply') {
          const composeBody = findComposeBody();
          console.log(TAG, 'received triggerReply. text length:', request.text?.length,
            '| compose body open:', !!composeBody);
          sendResponse({ status: 'received' });

          if (composeBody) {
            console.log(TAG, 'compose already open → TriggerReplyWithOpenView.');
            app.ports.onTriggerReplyWithOpenView.send(request.text);
          } else {
            console.log(TAG, 'no compose open → TriggerReplyNoView (will click reply button).');
            app.ports.onTriggerReplyNoView.send(request.text);
          }
        }
        return true;
      });

      // ── Elm → DOM ─────────────────────────────────────────────────────────

      app.ports.insertQuote.subscribe(text => {
        const body = findComposeBody();
        console.log(TAG, 'insertQuote fired. text length:', text?.length,
          '| compose body found:', !!body);
        if (!body) {
          console.warn(TAG, 'insertQuote: no compose body found — quote lost.');
          return;
        }
        insertIntoCompose(body, text, style);
      });

      app.ports.triggerReplyButton.subscribe(() => {
        console.log(TAG, 'triggerReplyButton fired — searching for reply button...');

        const btn = findReplyButton(document.body);
        if (btn) {
          console.log(TAG, 'reply button found → clicking.',
            btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || btn.innerText);
          btn.click();
          return;
        }

        // Fallback: Gmail keyboard shortcut 'a' = Reply All, 'r' = Reply.
        // Must dispatch on window with full key metadata.
        console.warn(TAG, 'no reply button found — firing keyboard "a" (Reply All) on window.');
        ['keydown', 'keypress', 'keyup'].forEach(type =>
          window.dispatchEvent(new KeyboardEvent(type, {
            key: 'a', code: 'KeyA', keyCode: 65, which: 65,
            bubbles: true, cancelable: true, composed: true
          }))
        );
      });

      // ── DOM helpers ───────────────────────────────────────────────────────

      function insertIntoCompose(body, text, s) {
        const quoteHTML =
          `<blockquote style="${buildQuoteCSS(s)}">${escapeHtml(text)}</blockquote>`;

        body.focus();

        // Prefer execCommand — it respects the current cursor position.
        try {
          const ok = document.execCommand('insertHTML', false, quoteHTML);
          if (ok) {
            console.log(TAG, 'quote inserted via execCommand ✓');
            return;
          }
        } catch (_) {}

        // Fallback: prepend to the compose body's DOM.
        console.warn(TAG, 'execCommand failed — falling back to DOM insertion.');
        const tmp = document.createElement('div');
        tmp.innerHTML = quoteHTML;
        body.insertBefore(tmp.firstChild, body.firstChild);
        console.log(TAG, 'quote inserted via DOM prepend ✓');
      }

      // NOTE: no visibility filter — Gmail hides reply buttons until hover,
      // so offsetWidth/offsetHeight would exclude every candidate.
      function findReplyButton(container) {
        if (!container) return null;
        const candidates = Array.from(
          container.querySelectorAll('[role="button"], button, a, .ams')
        );
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
