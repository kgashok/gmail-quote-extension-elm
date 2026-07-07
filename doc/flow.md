# Flow Execution: Gmail Quote Selected Extension

This document outlines the step-by-step execution flow of the extension from initialization to the final UI manipulation.

## 1. Initialization

### `background.js`
* **Installation:** When the extension is installed, a context menu item titled "Reply to all with Quote" is created for when text is selected.
* **Listeners Attached:** The background Service Worker sets up listeners for:
    * Context menu clicks (`chrome.contextMenus.onClicked`).
    * Keyboard shortcuts (`chrome.commands.onCommand` for `Alt+Q` / `MacCtrl+Q`).

### `content.js` — InboxSDK bootstrap
* `inboxsdk.js` and `content.js` are both declared in `manifest.json` and are automatically injected into every `mail.google.com` page.
* On page load, `content.js` calls `InboxSDK.load(2, APP_ID)`, which returns a Promise.
* Once resolved, it calls `sdk.Compose.registerComposeViewHandler(handler)` — a single, persistent listener that fires whenever Gmail opens **any** compose or reply window, for the lifetime of the page.

## 2. Trigger Phase
The user triggers the extension in one of two ways:
* **Via Context Menu:** The user right-clicks selected text and clicks the menu item. The highlighted text is passed directly from `info.selectionText` into the background script.
* **Via Shortcut:** The user presses the shortcut. The background script injects a tiny function into the active tab to grab `window.getSelection().toString()`.

## 3. Background Pipeline (`background.js`)
* The background script calls `sendQuoteReply(tabId, text)`.
* It sends a message payload `{ action: "triggerReply", text }` to the content script already running on the Gmail tab.
* No content script re-injection is needed — `inboxsdk.js` and `content.js` are always present on Gmail pages via the manifest declaration.

## 4. Content Script — Compose Target Resolution (`content.js`)
* The content script receives the message and calls `handleQuoteReply(quoteText)`, which first checks whether a compose/reply dialog is **already open**.
* **Already-open compose view (Issue #1 fix):**
    * `activeComposeViews` is a running list of every compose view currently on the page, populated by `registerComposeViewHandler` and pruned via each view's `destroy` event.
    * If the user had already started a reply manually before triggering the extension, `getOpenComposeView()` finds the first non-minimized entry and `insertQuote()` inserts the blockquote directly into it — no reply button click, no new compose view.
* **No compose view open — Reply Button Phase:**
    * Otherwise, the quote text is stored in `pendingQuoteText` and `triggerReplyButton()` is called to open a new reply.
* **Button Discovery (Contextual Scoping):**
    * If the user has an active text selection, the script walks up the DOM from the selection anchor (`findNearestReplyButton`), checking each ancestor container for visible reply buttons.
    * Candidates are filtered to only visible elements (`offsetWidth > 0 && offsetHeight > 0`).
    * `Reply All` is always preferred over plain `Reply` (checked via `aria-label`, `data-tooltip`, and `innerText` in English, French, and Spanish).
* **Button Discovery (Global Fallback):**
    * If no button is found near the selection, the script searches `document.body` for any visible reply control, again preferring `Reply All`.
* **Execution & Fail-safe:**
    * The chosen button is clicked, which opens Gmail's inline compose UI for that specific message.
    * If no reply button is found at all, Gmail's native `r` keyboard shortcut is dispatched as a last resort.

## 5. UI Manipulation Phase — InboxSDK Compose Handler (`content.js`)
This phase replaces the previous approach of `MutationObserver` polling, clipboard API calls, and manual cursor management.

* **Compose View Detection:**
    * The `registerComposeViewHandler` callback registered during initialization fires automatically the moment Gmail's compose/reply UI is ready.
    * No DOM polling, no `MutationObserver`, no timeout safety nets required — the SDK manages the event lifecycle internally.
* **Quote Injection:**
    * The handler checks for a non-null `pendingQuoteText`, then clears it to prevent double-insertion.
    * The selected text is HTML-escaped (`&`, `<`, `>`, `"`) before embedding to prevent XSS.
    * A styled `<blockquote>` is constructed with inline CSS (blue left border, italic text, light blue background).
    * `composeView.insertHTMLIntoBodyAtCursor(quoteHTML)` is called — the SDK handles cursor positioning and rich-text sanitization internally.
    * **Cursor placement (Issue #2 fix):** the HTML string contains no trailing `<br>`. Since `<blockquote>` is already a block-level element, the cursor naturally lands on the line immediately after it, letting the user continue typing right below the quote instead of one blank line further down.

## Architecture Comparison

| Concern | Previous approach | InboxSDK approach |
|---|---|---|
| Detect compose box | `MutationObserver` on `document.body` | `registerComposeViewHandler` |
| Insert HTML | Clipboard API → `execCommand` → DOM fallback chain | `insertHTMLIntoBodyAtCursor` |
| Cursor placement | Manual `document.createRange()` | Handled by SDK |
| Reply button scoring | Euclidean distance (`Math.hypot`) + type weighting | Prefer-reply-all-first linear scan |
| Content script wake-up | Re-injected on every trigger | Always-on via manifest declaration |
