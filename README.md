# Gmail Quote Selected

Gmail Quote Selected is a lightweight Chrome extension that lets you reply in Gmail with the currently selected text inserted as a quoted block.

## Features

- Right-click selected text in Gmail and choose the context menu item to start a reply with the selection quoted.
- Uses the Gmail compose UI to insert a styled blockquote.

## Installation (Developer / Local)

1. Clone or download this repository:

   git clone https://github.com/kgashok/git-quote-extension.git

2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select this repository folder.

## Usage

1. Open Gmail (https://mail.google.com).
2. Select text in an email or message preview.
3. Use one of the following methods to reply with the selected text quoted:
   - **Right-click** the selection and choose **Reply with Quote** from the context menu.
   - **Keyboard shortcut**: 
     - Press **Alt+Q** (Windows/Linux) or 
     - Press **MacCtrl+Q** (Mac)   

4. A reply compose box will open and the selected text will be inserted as a quoted block.

## Regression Testing

Verify the fix by reproducing the Gmail thread case:
1. Open a Gmail conversation with multiple replies.
2. Select text inside a deeper reply entry (e.g. the 3rd message in the thread).
3. Press **Alt+Q** or use the extension context menu.
4. Confirm that the quoted text opens in a reply compose box for that selected message, not the top-level thread message.

## Development

- `background.js` registers the context menu and forwards the selected text to the page via a message.
- `content.js` listens for the message, activates Gmail's reply flow, and inserts the quoted HTML.
- Manifest v3 is used (`manifest.json`) with `scripting` and `contextMenus` permissions.

## Files

- `manifest.json` — extension manifest
- `background.js` — service worker / background logic
- `content.js` — injected script that manipulates Gmail's compose box

## Contributing

Contributions are welcome — open an issue or submit a PR.

## License

This repository does not include an explicit license. Add a `LICENSE` file if you wish to specify one.
