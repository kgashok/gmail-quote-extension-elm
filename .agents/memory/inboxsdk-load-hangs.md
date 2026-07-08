---
name: InboxSDK load() hangs on Gmail
description: InboxSDK.load() promise never settles (no then/catch) on current Gmail, even on latest @inboxsdk/core; MutationObserver is the reliable detection path.
---

In this project, `InboxSDK.load(2, appId)` is called successfully but its returned promise
never resolves or rejects — confirmed via console logging that neither `.then()` nor
`.catch()` fires. This was true on both v2.2.14 and v2.2.16 of `@inboxsdk/core`, so it is not
an App ID or version-lag issue; InboxSDK's internal readiness detection appears incompatible
with current Gmail's bootstrap sequence.

**Why:** Verified by instrumenting every InboxSDK callback with console logs and reproducing
in a live Gmail tab — the "attempting load..." log always appears, but no subsequent InboxSDK
log ever does.

**How to apply:** Don't spend time re-diagnosing App ID / network / permissions issues if
InboxSDK silently hangs. The reliable, always-in-place path is a `MutationObserver` watching
for Gmail's compose body div directly, kept as a parallel signal alongside InboxSDK (both
funnel into the same dedup logic) so the extension keeps working regardless of InboxSDK's
state. Decision made: keep InboxSDK code as an opportunistic no-op rather than adding a
timeout or removing it, since it causes no functional harm.
