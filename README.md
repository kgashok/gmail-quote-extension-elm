# Gmail Quote Selected — Elm Edition

A Chrome extension that lets you reply in Gmail with the currently selected text automatically inserted as a styled blockquote. This is a full reimplementation of the original [gmail-quote-extension](https://github.com/kgashok/gmail-quote-extension) — same user-facing behaviour, core logic rewritten in **Elm**.

## What it does

1. Select any text inside a Gmail email.
2. Either **right-click → "Reply to all with Quote"**, or press **Alt+Q** (Windows/Linux) / **MacCtrl+Q** (Mac).
3. A reply compose box opens with the selected text formatted as a blockquote — cursor ready to type below it.

Additional behaviours:
- If a compose window is already open, the quote is inserted directly into it (no extra reply window).
- In multi-message threads, the reply targets the message that contains the selection, not the top of the thread.
- "Reply All" is preferred over "Reply" when finding the nearest reply button.
- Falls back to Gmail's native `r` shortcut if no reply button is found in the DOM.

## Why Elm?

The original JavaScript version accumulated subtle bugs around two pieces of state:

- **Is a compose window already open?** (insert directly vs. click reply first)
- **Is a quote pending?** (waiting for the compose window to appear before inserting)

These two flags interacted in ways that were easy to get wrong in mutable JavaScript. Rewriting the logic in Elm gives:

- A **typed state machine** — the `Content` module has exactly two states (`Idle` and `Pending text`), modelled as `Maybe String`. The compiler rejects code that forgets to handle either branch.
- **No runtime exceptions** — Elm's type system eliminates null/undefined errors in the logic layer entirely.
- **Pure functions** — all side effects (DOM, InboxSDK, Chrome APIs) are pushed out through ports into thin JS glue files, making the logic independently testable.

## Architecture

Chrome extensions cannot run Elm as a service worker directly, so the project splits responsibility into two layers:

```
src/
  Background.elm      Pure routing: context-menu / shortcut → forward to tab
  Content.elm         State machine: pending-quote lifecycle

background.js         Service-worker glue — Chrome APIs ↔ Background.elm ports
content_init.js       Content-script glue — InboxSDK + Chrome messages ↔ Content.elm ports
config.js             Your InboxSDK App ID (gitignored — see setup below)

elm-background.js     Compiled output of Background.elm  (committed, generated)
elm-content.js        Compiled output of Content.elm     (committed, generated)

inboxsdk.js           InboxSDK library (bundled)
manifest.json         Chrome Extension Manifest v3
```

### Content.elm state machine

```
Idle
  │  TriggerReplyWithOpenView text  →  emit insertQuote      →  Idle
  │  TriggerReplyNoView text        →  emit triggerReplyButton
  │                                     store text           →  Pending text

Pending text
  │  ComposeViewOpened              →  emit insertQuote
  │                                     clear text           →  Idle
```

### Ports

| Direction | Port | Description |
|-----------|------|-------------|
| JS → `Background.elm` | `onContextMenuClicked` | User right-clicked selected text |
| JS → `Background.elm` | `onCommandFired` | Keyboard shortcut fired |
| `Background.elm` → JS | `sendQuoteReply` | Deliver text to the active tab |
| JS → `Content.elm` | `onTriggerReplyWithOpenView` | Quote triggered; compose view already open |
| JS → `Content.elm` | `onTriggerReplyNoView` | Quote triggered; no compose view yet |
| JS → `Content.elm` | `onComposeViewOpened` | InboxSDK: a compose/reply view appeared |
| `Content.elm` → JS | `insertQuote` | Insert blockquote into the open compose view |
| `Content.elm` → JS | `triggerReplyButton` | Click the nearest Gmail reply button |

## Development setup

### Prerequisites

- [Node.js](https://nodejs.org/)
- A Chromium-based browser

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your InboxSDK App ID

`config.js` is gitignored and holds your real App ID. Copy the example and fill it in:

```bash
cp config.example.js config.js
```

Then open `config.js` and replace the placeholder with your App ID. Register a free one at [inboxsdk.com](https://www.inboxsdk.com/).

### 3. Build

```bash
npm run build        # optimised — produces elm-background.js and elm-content.js
npm run build:debug  # same with the Elm debugger overlay enabled
```

The compiled `.js` files are committed so the extension can be loaded without a build step, but re-run `npm run build` after editing any `.elm` source file.

### 4. Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository folder.

### Editing

| File | What to change |
|------|---------------|
| `src/Background.elm` | Routing logic — how context-menu / shortcut events reach the right tab |
| `src/Content.elm` | State machine — when and how the quote is inserted |
| `background.js` | Chrome API wiring for the service worker |
| `content_init.js` | InboxSDK setup, DOM helpers, port wiring for the content script |

After editing any `.elm` file: `npm run build`, then click **Reload** on the extension card in `chrome://extensions`.

## Usage

1. Open [Gmail](https://mail.google.com) and find an email.
2. Select some text.
3. **Right-click → "Reply to all with Quote"**, or press **Alt+Q** / **MacCtrl+Q**.
4. A reply compose box opens with the selection formatted as a blockquote.

## Regression tests

**Multi-message thread targeting**
1. Open a Gmail conversation with several replies.
2. Select text inside a deeper reply (e.g. the 3rd message).
3. Trigger the extension.
4. Confirm the compose box opens as a reply to *that* message, not the top of the thread.

**Already-open compose window**
1. Manually open a reply draft in Gmail.
2. Select some text in the thread.
3. Trigger the extension.
4. Confirm the quote appears in the *already-open* compose box — no second window.

## Further reading

- [`doc/flow.md`](doc/flow.md) — step-by-step execution flow from trigger to compose insertion
- [`doc/glossary.md`](doc/glossary.md) — Chrome extension concepts, InboxSDK APIs, and terms used throughout
- Original JavaScript implementation: [kgashok/gmail-quote-extension](https://github.com/kgashok/gmail-quote-extension)

## Contributing

Contributions are welcome — open an issue or submit a PR.

## License

No explicit license is included. Add a `LICENSE` file if you wish to specify one.
