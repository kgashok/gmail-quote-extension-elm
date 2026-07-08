---
name: InboxSDK load() hangs on Gmail (Manifest V3)
description: Root cause found — InboxSDK.load() hangs forever with no resolve/reject when pageWorld.js is missing from the extension or not declared in web_accessible_resources.
---

**Root cause (confirmed):** InboxSDK's isolated-world content script injects `pageWorld.js`
into Gmail's actual page context to complete an internal handshake (via postMessage). If
`pageWorld.js` is not present in the extension root, or not declared in `manifest.json`'s
`web_accessible_resources` for the target site, Gmail's page context can't load it — the
handshake never completes, and `InboxSDK.load()`'s promise hangs forever with **no resolve,
no reject, no error**. This is easy to misdiagnose as an App ID or Gmail-version problem
because nothing ever fails visibly.

**Why:** Confirmed by comparing against a second working repo (same InboxSDK version) whose
InboxSDK loaded successfully. Diffing setups showed the working repo had `pageWorld.js`
copied alongside `inboxsdk.js` and declared in `web_accessible_resources`; this repo only had
`inboxsdk.js` copied and no `web_accessible_resources` entry at all.

**How to apply:** Whenever bundling `@inboxsdk/core` manually (not via npm build pipeline):
1. Copy BOTH `inboxsdk.js` and `pageWorld.js` from `node_modules/@inboxsdk/core/` into the
   extension root — never just `inboxsdk.js`.
2. Declare `pageWorld.js` in `manifest.json` under `web_accessible_resources`, matching the
   same site pattern as the content script (e.g. `https://mail.google.com/*`).
3. If `InboxSDK.load()` hangs with zero console output after "attempting load...", check
   these two things first before suspecting the App ID, network, or Gmail DOM changes.
