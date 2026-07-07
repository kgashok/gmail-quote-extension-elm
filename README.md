# Gmail Quote Selected — Elm Rewrite

  A reimplementation of the [gmail-quote-extension](https://github.com/kgashok/gmail-quote-extension) Chrome extension using the **Elm** language. The original extension is written in plain JavaScript; this repo explores rebuilding the same functionality with Elm's strong type system and pure functional architecture.

  ## What This Extension Does

  Lets you reply in Gmail with currently selected text automatically inserted as a styled quoted block.

  - **Right-click** any selected text → **Reply with Quote**
  - **Keyboard shortcut** `Alt+Q` (Windows/Linux) or `MacCtrl+Q` (Mac)
  - Inserts the selection as a styled `<blockquote>` into the reply compose box
  - If a compose dialog is already open, the quote is added to it directly
  - Cursor lands immediately below the quoted block, ready to type

  ## Architecture

  Chrome extensions cannot run Elm as a service worker, so the architecture splits responsibility:

  | File | Language | Role |
  |---|---|---|
  | `background.js` | JavaScript | Service worker — context menu, keyboard shortcut, Chrome messaging API |
  | `content.js` | **Elm → compiled JS** | Content script — logic, InboxSDK interop via ports |
  | `inboxsdk.js` | JavaScript (bundled) | InboxSDK — Gmail compose API |
  | `manifest.json` | JSON | Extension manifest (Manifest V3) |

  ### Why Elm for the Content Script?

  - **Ports** provide a clean, typed boundary between Elm logic and InboxSDK's JavaScript API
  - The reply-button discovery walk, XSS escaping, and compose-view state tracking are all pure Elm functions — no runtime exceptions
  - The Elm compiler catches mishandled states (e.g. no compose view open, minimized view) at compile time

  ### Interop Pattern

  ```
  Chrome message (JS)
      → Elm port (incoming)
          → Elm logic: determine action
      → Elm port (outgoing)
          → JS interop: call InboxSDK
              → composeView.insertHTMLIntoBodyAtCursor(html)
  ```

  ## Getting Started

  ### Prerequisites

  - [Elm](https://guide.elm-lang.org/install/elm.html) — `npm install -g elm`
  - Node.js (for build tooling)

  ### Build

  ```bash
  elm make src/Main.elm --output=content.js
  ```

  ### Load in Chrome

  1. Clone this repository:
     ```
     git clone https://github.com/kgashok/gmail-quote-extension-elm.git
     ```
  2. Build the Elm content script (see above).
  3. Open Chrome → `chrome://extensions`.
  4. Enable **Developer mode** (top-right toggle).
  5. Click **Load unpacked** and select the cloned folder.

  > **App ID:** `content.js` uses an InboxSDK App ID. Register a free one at [inboxsdk.com](https://www.inboxsdk.com/) and set it in the Elm → JS port initialisation.

  ## Reference

  - Original JavaScript implementation: [gmail-quote-extension](https://github.com/kgashok/gmail-quote-extension)
  - Execution flow and design decisions: [`doc/flow.md`](doc/flow.md)
  - Concept and API glossary: [`doc/glossary.md`](doc/glossary.md)
  - InboxSDK documentation: [inboxsdk.com](https://www.inboxsdk.com/)
  - Elm guide: [guide.elm-lang.org](https://guide.elm-lang.org/)

  ## Contributing

  Contributions welcome — open an issue or submit a PR.

  ## License

  This repository does not include an explicit license. Add a `LICENSE` file if you wish to specify one.
  