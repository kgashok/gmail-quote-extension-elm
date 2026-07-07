# Gmail Quote Selected

A Chrome extension that lets you reply in Gmail with the currently selected text inserted as a styled blockquote.

## Features

- Right-click selected text in Gmail and choose **Reply to all with Quote** from the context menu.
- Or press **Alt+Q** (Windows/Linux) / **MacCtrl+Q** (Mac) for a keyboard shortcut.
- Uses [InboxSDK](https://www.inboxsdk.com/) to interact with Gmail's compose UI.
- Prefers "Reply All" over "Reply" when finding the nearest reply button.
- Correctly targets the message that contains the selection in multi-reply threads.

## Architecture

The extension is written in **Elm** for all logic, with thin JavaScript wrappers for browser APIs.

```
src/
  Background.elm       Pure routing logic (context menu → send to tab)
  Content.elm          State machine (pending quote, compose-view lifecycle)

background.js          Service-worker glue: Chrome APIs ↔ Elm ports
content_init.js        Content-script glue: InboxSDK + Chrome messages ↔ Elm ports

elm-background.js      Compiled output of Background.elm  (generated)
elm-content.js         Compiled output of Content.elm     (generated)

inboxsdk.js            InboxSDK library (bundled)
manifest.json          Chrome Extension Manifest v3
```

### Why Elm?

The core state — "is there a pending quote waiting for a compose window to open?" — is a tiny but critical state machine. Elm's immutable model and exhaustive pattern matching make that machine impossible to leave in an inconsistent state. All side effects (DOM manipulation, InboxSDK calls, Chrome APIs) are pushed into the JS glue layers via ports.

### Ports overview

| Direction | Port | Description |
|-----------|------|-------------|
| JS → `Background.elm` | `onContextMenuClicked` | User right-clicked |
| JS → `Background.elm` | `onCommandFired` | Keyboard shortcut fired |
| `Background.elm` → JS | `sendQuoteReply` | Deliver text to the active tab |
| JS → `Content.elm` | `onTriggerReplyWithOpenView` | Quote triggered; compose already open |
| JS → `Content.elm` | `onTriggerReplyNoView` | Quote triggered; no compose open yet |
| JS → `Content.elm` | `onComposeViewOpened` | InboxSDK compose/reply view appeared |
| `Content.elm` → JS | `insertQuote` | Insert blockquote into open compose view |
| `Content.elm` → JS | `triggerReplyButton` | Click nearest Gmail reply button |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (for the build script)
- A Chromium-based browser

### Build

```bash
npm install
npm run build          # produces elm-background.js and elm-content.js
npm run build:debug    # same but with the Elm debugger overlay enabled
```

The compiled `.js` files are committed so the extension can be loaded without a build step, but re-run `npm run build` after editing any `.elm` file.

### Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository folder.

### Edit Elm source

- `src/Background.elm` — routes context-menu / shortcut events to the right tab.
- `src/Content.elm` — owns the `pendingQuoteText` state and decides when to insert.
- `background.js` — Chrome API calls and port wiring for the background worker.
- `content_init.js` — InboxSDK setup, DOM helpers, and port wiring for the content script.

After any change to an `.elm` file, run `npm run build` and then click **Reload** on the extension card in `chrome://extensions`.

## Usage

1. Open [Gmail](https://mail.google.com).
2. Select text inside an email.
3. Either:
   - **Right-click** the selection → **Reply to all with Quote**, or
   - Press **Alt+Q** (Windows/Linux) or **MacCtrl+Q** (Mac).
4. A reply compose box opens with the selected text formatted as a blockquote.

## Regression test

1. Open a Gmail conversation with multiple replies.
2. Select text inside a deeper reply (e.g. the 3rd message in the thread).
3. Press **Alt+Q** or use the context menu.
4. Confirm the compose box opens as a reply to *that* message, not the top-level thread.

## Contributing

Contributions are welcome — open an issue or submit a PR.

## License

This repository does not include an explicit license. Add a `LICENSE` file if you wish to specify one.
