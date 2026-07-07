# Flow Execution: Gmail Quote Selected Extension (Elm Edition)

This document outlines the step-by-step execution flow of the extension from initialisation to final UI manipulation. All core logic now lives in Elm (`src/Background.elm` and `src/Content.elm`); the JavaScript files are thin glue layers that bridge Chrome APIs and InboxSDK to Elm ports.

---

## 1. Initialisation

### Service worker: `background.js` + `Background.elm`

- `background.js` calls `importScripts('elm-background.js')` to load the compiled Elm module.
- It calls `Elm.Background.init()`, starting the Elm runtime as a headless `Platform.worker`.
- The Elm worker registers its port subscriptions (`onContextMenuClicked`, `onCommandFired`).
- `background.js` registers Chrome API listeners:
  - `chrome.runtime.onInstalled` → creates the "Reply to all with Quote" context menu item.
  - `chrome.contextMenus.onClicked` → sends a `{ tabId, text }` payload into `app.ports.onContextMenuClicked`.
  - `chrome.commands.onCommand` → grabs selected text via `chrome.scripting.executeScript`, then sends a payload into `app.ports.onCommandFired`.

### Content script: `content_init.js` + `Content.elm`

- `config.js`, `inboxsdk.js`, `elm-content.js`, and `content_init.js` are declared in `manifest.json` and injected into every `mail.google.com` page (in that order).
- `content_init.js` calls `Elm.Content.init()`, starting the content-script Elm worker.
- It wires up all port subscriptions and callbacks (see §4 and §5).
- It calls `InboxSDK.load(2, INBOXSDK_APP_ID)` (the App ID is read from `config.js`), which returns a Promise.
- Once resolved, it calls `sdk.Compose.registerComposeViewHandler(handler)` — a persistent listener that fires whenever Gmail opens any compose or reply window for the lifetime of the page.

---

## 2. Trigger Phase

The user triggers the extension in one of two ways:

- **Context menu:** right-click selected text → "Reply to all with Quote". The selected text comes directly from `info.selectionText` in `chrome.contextMenus.onClicked`.
- **Keyboard shortcut:** `Alt+Q` / `MacCtrl+Q`. Because the background service worker cannot access the tab's `window`, it uses `chrome.scripting.executeScript` to run `() => window.getSelection().toString()` in the active tab and captures the return value.

---

## 3. Background pipeline: `background.js` ↔ `Background.elm`

```
Chrome event (context menu click or shortcut)
    │
    ▼
background.js reads tabId + text
    │
    ▼
app.ports.onContextMenuClicked.send({ tabId, text })
  (or app.ports.onCommandFired.send({ tabId, text }))
    │
    ▼
Background.elm update:
  ContextMenuClicked payload  →  Cmd: sendQuoteReply payload
  CommandFired payload        →  Cmd: sendQuoteReply payload
    │
    ▼
app.ports.sendQuoteReply.subscribe(...)  →  background.js
    │
    ▼
chrome.tabs.sendMessage(tabId, { action: "triggerReply", text })
```

`Background.elm` is a pure router — its `Model` is `{}` and holds no state. Every incoming message immediately produces a `sendQuoteReply` command.

---

## 4. Content script — compose target resolution: `content_init.js` ↔ `Content.elm`

When `content_init.js` receives `{ action: "triggerReply", text }` from the background:

1. It checks `activeComposeViews` (a JS-side array of live InboxSDK `ComposeView` objects) to see if any non-minimised view is already open.
2. It sends the appropriate port message into `Content.elm`:

```
compose view already open?
  YES  →  app.ports.onTriggerReplyWithOpenView.send(text)
  NO   →  app.ports.onTriggerReplyNoView.send(text)
```

`Content.elm` then transitions its state machine:

```
TriggerReplyWithOpenView text  →  Cmd: insertQuote text          (Idle → Idle)
TriggerReplyNoView text        →  Cmd: triggerReplyButton
                                   Model: pendingQuoteText = Just text  (Idle → Pending)
```

---

## 5. Reply button phase (when no compose view is open)

When `Content.elm` emits `triggerReplyButton`, `content_init.js` runs the DOM walk:

- **Contextual scoping:** walks up the DOM from the selection anchor (`findNearestReplyButton`), checking each ancestor container for visible reply buttons.
- **Candidate filtering:** only elements with `offsetWidth > 0 && offsetHeight > 0` (visible on screen).
- **Preference:** "Reply All" is always preferred over plain "Reply" — detected via `aria-label`, `data-tooltip`, and `innerText` in English, French ("répondre" / "tous"), and Spanish ("responder" / "todos").
- **Global fallback:** if nothing is found near the selection, `document.body` is searched for any visible reply control.
- **Last resort:** if no button is found at all, a synthetic `r` keydown event is dispatched (Gmail's native reply shortcut).

Clicking the button causes Gmail to open an inline compose/reply view, which InboxSDK detects and fires the registered compose handler.

---

## 6. Compose view opened: InboxSDK → Elm → insert

When a compose view appears, the `registerComposeViewHandler` callback in `content_init.js`:

1. Pushes the new `ComposeView` into `activeComposeViews`.
2. Registers a `destroy` listener to prune it from the array when it closes.
3. Sends `app.ports.onComposeViewOpened.send(null)` into `Content.elm`.

`Content.elm` handles `ComposeViewOpened`:

```
Pending text  →  Cmd: insertQuote text
                  Model: pendingQuoteText = Nothing   (Pending → Idle)
Idle          →  no-op (user opened a compose window independently)
```

When `insertQuote` fires, `content_init.js`:

1. Finds the first non-minimised view via `getOpenComposeView()`.
2. Escapes the quote text (`&`, `<`, `>`, `"`) to prevent XSS.
3. Builds a styled `<blockquote>` with inline CSS. No trailing `<br>` — the block-level element already places the cursor on the next line.
4. Calls `composeView.insertHTMLIntoBodyAtCursor(quoteHTML)`.

---

## 7. Connection recovery

`chrome.tabs.sendMessage` throws *"Could not establish connection"* in two cases:

1. The Gmail tab was open **before** the extension was installed or reloaded — manifest content scripts only auto-inject on new page loads.
2. A brief race right after a Gmail SPA navigation, before `content_init.js`'s listener has registered.

`deliverQuoteReply` in `background.js` catches this specific error, re-injects `['config.js', 'inboxsdk.js', 'elm-content.js', 'content_init.js']` via `chrome.scripting.executeScript`, waits 100 ms, and retries the message once.

---

## Architecture overview

```
User action
    │
    ▼
background.js  ──port──►  Background.elm  ──port──►  background.js
(Chrome APIs)              (pure router,               (chrome.tabs.sendMessage)
                            Model = {})
                                                              │
                                                              ▼
                                                       content_init.js
                                                       (Chrome message listener)
                                                              │
                                               ┌─────────────┴──────────────┐
                                      port into Content.elm        InboxSDK events
                                               │
                                    Content.elm (state machine,
                                    Model = { pendingQuoteText : Maybe String })
                                               │
                                      port out to content_init.js
                                               │
                                    composeView.insertHTMLIntoBodyAtCursor()
```

---

## Before / after comparison

| Concern | Original JS | Elm edition |
|---|---|---|
| Background logic | Inline mutable code in `background.js` | `Background.elm` — pure router, no state, wired via ports |
| Content-script state | `let pendingQuoteText = null` (mutable) | `Maybe String` in `Content.elm` — compiler enforces both branches |
| Side effects | Mixed throughout `content.js` | Isolated in `content_init.js`; Elm emits typed commands via ports |
| Compose-box detection | `MutationObserver` on `document.body` | `InboxSDK.registerComposeViewHandler` event |
| Insert HTML | Clipboard API → `execCommand` → DOM fallback | `insertHTMLIntoBodyAtCursor` via `insertQuote` port |
| Cursor placement | Manual `document.createRange()` | Block-level `<blockquote>`, no trailing `<br>` |
| Reply button scoring | Euclidean distance (`Math.hypot`) + type weighting | Ancestor-walk, prefer-reply-all-first linear scan |
| App ID location | Hardcoded string in source | `config.js` (gitignored), read as `INBOXSDK_APP_ID` global |
