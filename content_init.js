// Content-script entry point.
//
// elm-content.js is compiled from src/Content.elm and defines the
// global `Elm` object.  All pure state-machine logic lives there; this
// file only bridges Chrome APIs ↔ Elm ports.
//
// IMPORTANT: InboxSDK.load() must be called synchronously at script load time —
// before any async work — so it can hook into Gmail's page setup at the right
// moment.  Calling it inside a chrome.storage callback causes it to hang forever
// because Gmail has already moved past the window InboxSDK needs.
// We therefore start both InboxSDK.load() and chrome.storage.sync.get in parallel,
// then Promise.all() them together before wiring up Elm and the port listeners.

const TAG = '[GmailQuoteSelected]';

// This line runs unconditionally — if you don't see it, content scripts aren't loading.
console.log(TAG, 'content_init.js FILE LOADED (guard:', window.gmailElmContentInitialised, ')');

if (!window.gmailElmContentInitialised) {
  window.gmailElmContentInitialised = true;

  // ── 1. Read storage (async) ────────────────────────────────────────────────
  const storagePromise = new Promise(resolve => {
    chrome.storage.sync.get(
      ['inboxSdkAppId', 'enabled', 'blockquoteStyle'],
      resolve
    );
  });

  // ── 2. Load InboxSDK synchronously at top level ────────────────────────────
  // Must happen NOW (not inside a callback) so InboxSDK can hook Gmail's boot.
  let inboxSdkPromise = Promise.resolve(null);
  if (typeof InboxSDK !== 'undefined') {
    // We don't have the App ID yet — read it from storage first, then load.
    // But we must at least START the storage read before anything async blocks.
    // The actual InboxSDK.load() call happens once we have the App ID, but we
    // chain it immediately off the storage promise so it runs as early as possible.
    console.log(TAG, 'InboxSDK global present — will load once App ID is confirmed.');
    inboxSdkPromise = storagePromise.then(({ inboxSdkAppId }) => {
      if (!inboxSdkAppId) return null;
      console.log(TAG, 'InboxSDK.load() called with appId:', inboxSdkAppId);
      return InboxSDK.load(2, inboxSdkAppId).catch(err => {
        console.warn(TAG, 'InboxSDK.load failed:', err);
        return null;
      });
    });
  } else {
    console.log(TAG, 'InboxSDK global not present — MutationObserver only.');
  }

  // ── 3. Wait for both, then wire everything up ──────────────────────────────
  Promise.all([storagePromise, inboxSdkPromise]).then(([storage, sdk]) => {
    const { inboxSdkAppId, enabled, blockquoteStyle } = storage;

    console.log(TAG, 'storage read →', {
      inboxSdkAppId: inboxSdkAppId ?? '✗ missing',
      enabled
    });

    if (enabled === false) {
      console.log(TAG, 'extension disabled via popup toggle — stopping.');
      return;
    }

    if (!inboxSdkAppId) {
      console.warn(TAG, 'No App ID configured — opening Options page.');
      chrome.runtime.sendMessage({ action: 'openOptions' });
      return;
    }

    if (sdk) {
      console.log(TAG, 'InboxSDK loaded ✓');
    } else {
      console.warn(TAG, 'InboxSDK not available — MutationObserver fallback active.');
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

    // ── Compose-view tracking ──────────────────────────────────────────────
    //
    // InboxSDK's registerComposeViewHandler is the primary signal; a
    // MutationObserver watching Gmail's DOM is the fallback.  Both funnel
    // through checkForNewComposeBody() which deduplicates via a WeakSet so
    // Elm never receives duplicate onComposeViewOpened events.

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

    const seenComposeBodies = new WeakSet();

    function checkForNewComposeBody(source) {
      const body = findComposeBody();
      if (body && !seenComposeBodies.has(body)) {
        seenComposeBodies.add(body);
        console.log(TAG, `compose body detected (source: ${source}) → notifying Elm.`);
        app.ports.onComposeViewOpened.send(null);
      }
    }

    // MutationObserver fallback — always active regardless of InboxSDK.
    const composeObserver = new MutationObserver(() => checkForNewComposeBody('MutationObserver'));
    composeObserver.observe(document.body, { childList: true, subtree: true });
    console.log(TAG, 'MutationObserver watching for compose bodies.');

    // Check immediately in case a compose view is already open.
    checkForNewComposeBody('init');

    // Wire up InboxSDK compose handler if SDK loaded successfully.
    if (sdk) {
      sdk.Compose.registerComposeViewHandler(() => {
        console.log(TAG, 'InboxSDK: compose view handler fired.');
        checkForNewComposeBody('InboxSDK');
      });
      console.log(TAG, 'InboxSDK compose view handler registered.');
    }

    // ── Chrome → Elm ───────────────────────────────────────────────────────

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

    // ── Elm → DOM ──────────────────────────────────────────────────────────

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
      console.warn(TAG, 'no reply button found — firing keyboard "a" (Reply All) on window.');
      ['keydown', 'keypress', 'keyup'].forEach(type =>
        window.dispatchEvent(new KeyboardEvent(type, {
          key: 'a', code: 'KeyA', keyCode: 65, which: 65,
          bubbles: true, cancelable: true, composed: true
        }))
      );
    });

    // ── DOM helpers ────────────────────────────────────────────────────────

    function insertIntoCompose(body, text, s) {
      body.focus();

      const bq = document.createElement('blockquote');
      bq.setAttribute('style', buildQuoteCSS(s));
      bq.textContent = text;

      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(bq);
      } else {
        body.insertBefore(bq, body.firstChild);
      }

      placeCursorAfter(bq);
      setTimeout(() => placeCursorAfter(bq), 0);

      console.log(TAG, 'quote inserted ✓');
    }

    function placeCursorAfter(el) {
      if (!el.isConnected) return;
      try {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStartAfter(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    }

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
  });

} else {
  console.log(TAG, 'content_init.js skipped — already initialised on this page.');
}
