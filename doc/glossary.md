# Glossary: Gmail Quote Selected Extension (Elm Edition)

A reference of the concepts, APIs, and terms used to build this extension — from Chrome extension fundamentals to the Elm architecture, InboxSDK integration, and the specific bugs it fixes.

_Complements `doc/flow.md` (which explains execution order) by explaining what each term or API means rather than when it runs._

---

## Chrome Extension Fundamentals

**Manifest V3 (MV3)**
The current Chrome extension platform version, declared via `"manifest_version": 3` in `manifest.json`. Replaces the older background-page model with service workers and tightens permission scoping. This extension is built entirely on MV3.

**`manifest.json`**
The extension's configuration file. Declares its name, version, permissions, background service worker, keyboard commands, and content scripts. It is the single source of truth for what the browser injects and where. Content scripts are loaded in declaration order: `config.js` → `inboxsdk.js` → `elm-content.js` → `content_init.js`.

**Service Worker (`background.js` + `elm-background.js`)**
The extension's background process. Unlike the old persistent background page, a service worker is event-driven and can be unloaded by Chrome when idle, then woken up again when an event fires. `background.js` is the entry point declared in the manifest; it uses `importScripts('elm-background.js')` to load the compiled Elm logic, then wires Chrome API events to Elm ports.

**Content Scripts (`config.js`, `inboxsdk.js`, `elm-content.js`, `content_init.js`)**
JavaScript files that Chrome injects directly into matching web pages (`https://mail.google.com/*`). Content scripts can read and modify the page's DOM, but run in an **isolated world** — sharing the DOM with the page but not its JavaScript variables. The four files serve distinct roles: `config.js` sets the InboxSDK App ID global; `inboxsdk.js` is the bundled SDK; `elm-content.js` is the compiled Elm logic; `content_init.js` is the JS glue that wires them all together.

**Isolated World**
The sandboxed JavaScript execution context Chrome gives content scripts. This is why the content scripts can manipulate Gmail's DOM freely but cannot directly call any of Gmail's own internal JavaScript functions — everything goes through DOM events, clicks, and standard browser APIs.

**Permissions & `host_permissions`**
Declared capabilities the extension requests: `contextMenus` (custom right-click menu items), `scripting` (inject code/files into tabs on demand), `activeTab` (temporary access to the focused tab). `host_permissions` scopes all of this to `https://mail.google.com/*` only.

---

## Extension Trigger Mechanisms

**Context Menu (`chrome.contextMenus`)**
Registers "Reply to all with Quote" as a right-click option that appears only when text is selected (`contexts: ["selection"]`). Created once on `chrome.runtime.onInstalled`.

**Keyboard Command (`chrome.commands`)**
Declared in `manifest.json` under `commands.run-quote-reply`, bound to `Alt+Q` (Windows/Linux) or `MacCtrl+Q` (Mac). Fired via `chrome.commands.onCommand`.

**`chrome.scripting.executeScript`**
Used two ways in this extension:
1. To run an inline function (`() => window.getSelection().toString()`) in the active tab — how the keyboard shortcut path grabs selected text, since the background service worker cannot access the tab's `window.getSelection()` directly.
2. As a **connection-recovery mechanism**: force-injecting `['config.js', 'inboxsdk.js', 'elm-content.js', 'content_init.js']` into a tab that doesn't already have the content scripts running.

**`chrome.tabs.sendMessage` / `chrome.runtime.onMessage`**
The message-passing bridge between the background service worker and the content script. The background sends `{ action: "triggerReply", text }`; `content_init.js` listens and acknowledges via `sendResponse`.

---

## Elm Architecture

**`Platform.worker`**
An Elm program type with no UI. It runs a `Model`/`update`/`subscriptions` loop entirely in the background, communicating with the outside world only through ports. Both `Background.elm` and `Content.elm` use `Platform.worker` — they have no HTML or DOM of their own.

**Ports**
Elm's typed message-passing boundary with JavaScript. There are two directions:
- **Incoming ports** (`port foo : (a -> msg) -> Sub msg`) — JavaScript calls `app.ports.foo.send(value)` to deliver a value into the Elm `update` loop.
- **Outgoing ports** (`port bar : a -> Cmd msg`) — Elm returns a command that causes JavaScript's `app.ports.bar.subscribe(callback)` to fire.

Ports are the *only* way Elm interacts with Chrome APIs, InboxSDK, and the DOM. All side effects are pushed into the JS glue files this way.

**`Background.elm`**
The compiled-to-`elm-background.js` Elm module for the service-worker layer. Its `Model` is `{}` (no state). It is a pure router: every `ContextMenuClicked` or `CommandFired` message immediately produces a `sendQuoteReply` command. There is no mutable state to go wrong.

**`Content.elm`**
The compiled-to-`elm-content.js` Elm module for the content-script layer. Its `Model` is `{ pendingQuoteText : Maybe String }`. It owns the extension's only real state: whether a quote is waiting for a compose window to open.

**`Maybe String` (pendingQuoteText)**
Elm's `Maybe` type replaces the original JavaScript `let pendingQuoteText = null`. `Nothing` means "idle — no quote pending"; `Just text` means "a quote is waiting for a compose view to open". The Elm compiler requires all code that touches this value to explicitly handle both cases, making it impossible to accidentally use a null/undefined value or forget the pending branch.

**`elm-background.js` / `elm-content.js`**
The compiled outputs of `Background.elm` and `Content.elm` respectively, produced by `npm run build` (which passes `--optimize` to `elm make`). These files are committed to the repository so the extension can be loaded without a build step. The `--optimize` flag removes the development-mode runtime warning and applies dead-code elimination.

---

## InboxSDK

**InboxSDK**
A third-party JavaScript library (`inboxsdk.js`, bundled locally) purpose-built for writing Gmail browser extensions. It abstracts away Gmail's unstable internal DOM structure and provides a stable API for hooking into compose windows, threads, toolbars, and more.

**`INBOXSDK_APP_ID` / `config.js`**
The InboxSDK App ID is a free identifier registered at [inboxsdk.com](https://www.inboxsdk.com/), used by the SDK for usage tracking. It is stored in `config.js` (gitignored) as a global `var INBOXSDK_APP_ID`. `config.js` is loaded first in the content-script order so that `content_init.js` can read the variable. A `config.example.js` template (committed) shows the expected shape without the real ID.

**`InboxSDK.load(version, appId)`**
The SDK's entry point, called once per page load in `content_init.js`. Returns a Promise that resolves with an `sdk` object once the SDK has attached itself to Gmail's interface.

**`ComposeView`**
InboxSDK's abstraction over a single Gmail compose or reply window. Instead of locating and interpreting raw `<div contenteditable>` elements, the SDK provides a `ComposeView` object with a stable API.

**`sdk.Compose.registerComposeViewHandler(handler)`**
Registers a persistent callback that fires once for every compose/reply view that exists or opens on the page, for as long as the page is loaded — including ones already open at registration time. This replaces the need for `MutationObserver` polling.

**`composeView.insertHTMLIntoBodyAtCursor(html)`**
Inserts an HTML string at the current cursor position inside the compose body, handling cursor placement and rich-text sanitisation internally. Replaces what was previously a fragile three-tier fallback chain (Clipboard API → `execCommand('insertHTML')` → raw `insertAdjacentHTML`).

**`composeView.isMinimized()`**
Reports whether a compose view is currently minimised (collapsed to a bar at the bottom of Gmail). Used to skip minimised drafts when searching for the active compose view to insert into.

**`composeView.on('destroy', callback)`**
Fired when a compose view is closed (sent, discarded, or otherwise removed). Used to prune closed views from `activeComposeViews` in `content_init.js`.

---

## Core Extension Logic

**`activeComposeViews`**
An array in `content_init.js` that tracks every `ComposeView` currently open on the page. Populated inside `registerComposeViewHandler` and pruned on each view's `destroy` event. This array lives in JavaScript (not Elm) because `ComposeView` objects are opaque JS values that cannot be passed through ports. It is the source of truth for whether a compose window is open.

**Reply Button Discovery**
When `Content.elm` emits `triggerReplyButton`, `content_init.js` must click a Gmail reply button to cause a compose view to open (InboxSDK does not open replies on the extension's behalf). The discovery logic in `content_init.js`:
- `findNearestReplyButton` — walks up the DOM from the text-selection anchor through ancestor containers.
- `findReplyButton` — within a container, filters to visible elements (`offsetWidth > 0 && offsetHeight > 0`) and prefers "Reply All" over plain "Reply".
- `isReplyButton` / `isReplyAllButton` / `getHay` — text-matching helpers that check `innerText`, `aria-label`, and `data-tooltip` in English, French ("répondre" / "tous"), and Spanish ("responder" / "todos").
- **Fail-safe:** if no button is found, a synthetic `r` keydown event is dispatched (Gmail's native reply shortcut).

**Blockquote Construction & Escaping**
Done in `content_init.js` on the `insertQuote` port callback. The quote text from Elm is HTML-escaped (`&`, `<`, `>`, `"`) to prevent XSS, then wrapped in a `<blockquote>` with inline CSS (blue left border, italic text, light-blue background). No trailing `<br>` — `<blockquote>` is block-level, so the cursor lands on the next line naturally.

**Connection Recovery (`deliverQuoteReply`)**
`chrome.tabs.sendMessage` fails with *"Could not establish connection"* when:
1. The Gmail tab was open **before** the extension was installed or reloaded (manifest content scripts only auto-inject on new page loads).
2. A brief race right after a Gmail SPA navigation, before `content_init.js`'s listener has registered.

`deliverQuoteReply` in `background.js` catches this specific error, re-injects `['config.js', 'inboxsdk.js', 'elm-content.js', 'content_init.js']` via `chrome.scripting.executeScript`, waits 100 ms, and retries the message once.

---

## Bugs Fixed During Development

**Issue #1 — Insert into an already-open compose box**
Originally, triggering the extension always tried to click a reply button, even if the user had manually opened a reply draft already. Fixed in `Content.elm`: `content_init.js` checks `activeComposeViews` first and sends `onTriggerReplyWithOpenView` if a non-minimised view exists, causing Elm to emit `insertQuote` immediately without touching the reply-button path.

**Issue #2 — Extra blank line after the quote**
The inserted HTML originally ended with `<blockquote>...</blockquote><br>`. Since `<blockquote>` is block-level, the trailing `<br>` pushed the cursor an extra blank line below the quote. Fixed by removing the `<br>` from the blockquote constructed in `content_init.js`'s `insertQuote` subscriber.

---

## Superseded Techniques

These approaches were used in earlier iterations and are documented here for historical context.

**`MutationObserver` polling**
Previously watched `document.body` for DOM changes to detect when Gmail's compose box appeared, with a 5-second timeout safety net. Replaced by `registerComposeViewHandler`, which fires as a proper event.

**Clipboard API fallback chain**
The original HTML insertion strategy tried three methods in order: `navigator.clipboard.write` + `execCommand('paste')`, then `execCommand('insertHTML')`, then raw `insertAdjacentHTML`. Replaced by `insertHTMLIntoBodyAtCursor`.

**Euclidean distance button scoring (`Math.hypot`)**
The original reply-button algorithm computed the pixel distance between the text selection's bounding rectangle and every visible reply button, weighting "Reply All" with a scoring bonus. Replaced by the simpler ancestor-walk approach, which is cheaper and equally reliable.

**Hardcoded InboxSDK App ID**
Previously the App ID was a string literal in the source file, which caused a GitHub secret-scanning alert. Moved to a gitignored `config.js` file read as `INBOXSDK_APP_ID`.

**Single monolithic `content.js`**
The original content script was one JavaScript file containing both logic and DOM/SDK calls. Replaced by two layers: `Content.elm` (pure logic, compiled to `elm-content.js`) and `content_init.js` (JS glue).
