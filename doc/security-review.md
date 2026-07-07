# Chrome Web Store Security Review

## Overview
This document is a security and policy review of the `Gmail Quote Selected` extension for Chrome Web Store submission.

The extension provides a Gmail-only quoting feature by:
- adding a context menu item for selected text,
- supporting a keyboard shortcut,
- injecting a content script into Gmail pages,
- activating Gmail reply compose and inserting quoted text.

## Manifest and Permissions
- `manifest_version`: 3 ✅
- `permissions`: `contextMenus`, `scripting`, `activeTab`
- `host_permissions`: `https://mail.google.com/*`
- `background.service_worker`: `background.js`
- `content_scripts`: `content.js` on Gmail pages

### Security implications
- `host_permissions` is restricted to `mail.google.com/*`, which is appropriately scoped for the extension's functionality.
- `activeTab` is used to execute script only when the user triggers the extension.
- `scripting` is used to inject `content.js` on the active Gmail tab.

## Code Review Findings
### `background.js`
- Creates a context menu item only on installation.
- Handles user actions through the context menu and keyboard command.
- Extracts selected text from the active page using `chrome.scripting.executeScript`.
- Injects `content.js` and sends a message with the selected text.
- No external network requests or remote code execution.
- Error handling is present for injection and messaging failures.

### `content.js`
- Listens for messages from the extension and acts only when `request.action === "triggerReply"`.
- Locates Gmail reply/reply-all buttons by inspecting visible DOM elements and labels.
- Clicks the reply button or falls back to dispatching Gmail shortcut key `r`.
- Inserts a quoted block into the Gmail compose box.
- Uses only client-side DOM manipulation and optional clipboard operations.
- Does not store or transmit selected text outside the Gmail page.

## Policy and Security Assessment
### Chrome Web Store acceptance likelihood
This extension is likely to be accepted if submitted in a proper package, because:
- It uses Manifest V3.
- It requests only the permissions necessary for its Gmail quoting feature.
- It restricts host access to Gmail only.
- It does not appear to collect or exfiltrate user data.
- It does not use prohibited APIs or remote code execution.

### Potential review concerns
- The extension operates on user email content in Gmail. Chrome Web Store reviewers may scrutinize this as sensitive data access.
- The developer should clearly document the permission and data access in the store listing and, if applicable, include a privacy policy.
- The extension currently has no explicit `LICENSE` file in the repository; this is not a block for store entry, but it is recommended for transparency.

### Recommended hardening
- Explicitly declare in the public listing that the extension only works with Gmail and only reads selected text for quoting.
- Add a simple privacy statement noting that no data leaves the user’s browser and no external servers are contacted.
- Avoid adding broader host permissions or unnecessary APIs in future updates.

## Developer Mode Note
This repository currently describes manual installation through Chrome’s **Developer mode** and `Load unpacked`. That is fine for local use, but it is not the same as Chrome Web Store distribution.

- Developer mode is only required for sideloading the extension locally.
- If the extension is packaged and submitted to the Web Store, users will not need manual `Load unpacked` installation.
- Chrome Store security review is performed independently of whether the extension is currently loaded unpacked.

## Conclusion
From the code and manifest review, the extension appears compatible with Chrome Web Store security requirements.

It should be accepted if:
- the package is submitted correctly,
- the store listing accurately describes the Gmail-only behavior,
- any required privacy information is provided,
- no future changes expand permissions or introduce external data collection.

> Final verdict: `Likely acceptable`, provided the submission includes clear permission disclosure and no additional sensitive-data handling is added.
