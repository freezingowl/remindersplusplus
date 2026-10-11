# Automatic Live Activity updates

The Worker can update the **same** Cue Live Activity at each due time while the app is suspended. It uses a SQLite Durable Object alarm and an ActivityKit APNs push, with no `alert`, `sound` or notification badge. A local notification is not created. The native app still saves every reminder locally and reloads that store on opening.

Background App Refresh cannot replace this scheduler: Apple's [`earliestBeginDate`](https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate) is a lower bound, with no guarantee of execution at that time. Push delivery also depends on network connectivity and Apple's delivery budgets; it is not a hard real-time alarm. A Live Activity still has an eight-hour active lifetime.

## Apple setup

Use the paid Apple Developer team that signs Cue. Enable **Push Notifications** for its explicit app identifier, `com.remindersplusplus.cue`, and obtain an APNs signing key allowed for that app and environment. Apple's [token authentication guide](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns) describes the Team ID, Key ID and `.p8` key. Keep the key outside this repository; `.p8` files are also ignored as a precaution.

Set these Cloudflare **Secrets** on the existing Worker:

- `APNS_TEAM_ID`: ten-character Apple team identifier.
- `APNS_KEY_ID`: ten-character key identifier.
- `APNS_PRIVATE_KEY`: the complete PEM contents of the downloaded `.p8` file.

From the app folder, the private key can be uploaded without printing it:

```bash
npx wrangler secret put APNS_TEAM_ID --config worker/wrangler.jsonc
npx wrangler secret put APNS_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put APNS_PRIVATE_KEY --config worker/wrangler.jsonc < "/absolute/path/to/AuthKey_YOURKEYID.p8"
```

`APNS_BUNDLE_ID` and `APNS_ENVIRONMENT` are ordinary Worker variables. The tracked config uses `com.remindersplusplus.cue` and `development`. A wired Xcode development-signed build normally uses the sandbox even in Release configuration. App Store/TestFlight builds use `production`; change both the Worker environment and the app's `CUE_APNS_ENVIRONMENT` before rebuilding. Use the actual signing entitlement, rather than guessing from Debug/Release.

No Apple private key, Team ID or Key ID belongs in the phone's `.env`. The app's optional `CUE_APNS_ENVIRONMENT` contains only `development` or `production`.

## Deploy and rebuild

```bash
npx wrangler d1 execute cue-ai-limits --remote --file worker/schema.sql --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
npm run cloud:check
npm run ios:sync:companion
npm run ios:build:standalone
```

The schema adds a separate activity-sync quota table without replacing AI counters. Wrangler adds the `CUE_ACTIVITIES` Durable Object binding/migration. For dashboard deployments, paste all of `worker.mjs` and configure that binding/class as well; the APNs feature needs Durable Objects, not another D1 reminder database.

Expect `liveActivity.configured: true` in `cloud:check`. This verifies setting names/formats and binding presence; only a real push proves the key's validity and delivery. In Xcode, both app/widget signing must use the intended team, and the app's provisioning profile must support Push Notifications. Do not uninstall Cue to rebuild: its existing reminders should survive installation over the same app identifier.

Open the rebuilt app. If an activity was created by the old build without push support, turn **Lock Screen companion** off and on once. Existing activities cannot gain a push token after creation. Settings will show **Automatic updates scheduled with Apple push** after the new activity's token and queue have registered. Missing setup or network failures are reported there; saving a reminder still succeeds locally.

## Verify the requested handoff

1. Complete old reminders so this is an isolated test. Keep the normal Back Tap Shortcut with **Ask for Input → Add Cue reminder**; remove any separately added **Show Result/Show Alert** action.
2. Through Back Tap add `Remind me to make sushi in 2 minutes`, then `Remind me to drink water in 3 minutes`. Check both parsed due times: each duration starts when that request reaches the Worker.
3. Each capture shows processing and a brief saved acknowledgement on the existing card. There is no custom Shortcut success dialog or Done button. Apple's text-input/progress/authentication/error UI remains system-controlled.
4. Lock the phone and leave Cue in the background. At the first due time, sushi becomes **NOW**. At the second, water takes over and unfinished sushi contributes **1 missed**.
5. Tap **1 missed** to show sushi in that same card. Tap **Back** to return to the current reminder. Repeated badge taps cycle missed tasks. Complete sushi with its circle; its badge contribution disappears. A newer due task takes priority over missed review.
6. Leave water incomplete for one minute: it becomes missed too. The resting card shows the next upcoming task, or collapses to the mark and missed badge when nothing is upcoming. Open Cue and confirm both tasks and their completion states are in the list.
7. Check that no local notification/banner/sound was scheduled. Do not judge this by the input sheet: entering text still uses Shortcuts' own UI.

## Bounds and data handling

`POST /v1/live-activity` uses the existing demo bearer token plus a randomly generated installation owner secret stored in Keychain. The server stores only its hash, the ActivityKit token, revision, review selection and at most 128 open reminders' IDs, titles and times. It does not receive notes, completed reminders, audio or Apple credentials from the app. Every mutation replaces the queue; monotonically increasing revisions reject stale requests. Ownership is checked before changing an existing session. Stopped sessions retain only a bounded owner/revision tombstone so late requests cannot revive them.

Schedules expire within the activity's eight-hour session. A cleanup alarm removes stored data at expiry; a delayed alarm can delay actual deletion. There are no app-level logs of reminder contents or push tokens. D1 stores only global admission counters. Sync is globally limited to 60 requests/minute and 2,000/UTC day separately from AI quotas; it makes no OpenAI call. APNs attempts have a ten-second timeout, no redirect forwarding, persisted, shared ES256 authorization and six bounded transient retries; invalid/ended tokens stop the schedule. Connectivity, throttling, failed sync and system dismissal can prevent timely delivery. The private-demo bearer token is extractable from the app; public distribution still needs real user authentication.

## Validation

`npm run cloud:check -- --push-transport` additionally probes Apple with deliberately invalid provider/device tokens, without a real key, deliverable notification or AI request. An expected HTTP 403/InvalidProviderToken confirms transport reaches APNs; it does not prove your signing key or device delivery. The authenticated probe consumes only activity-sync quota.

```bash
npm run test:activity
npm run test:worker
npm run test:worker:runtime
npm run test:companion
```

The runtime test uses actual workerd/D1/Durable Object alarms and generated test-only Apple keys with intercepted outbound pushes. It verifies successive updates without contacting Apple or OpenAI. Device delivery, Lock Screen rendering and signing remain separate checks.
