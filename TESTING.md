# Test Cue from cloud setup to Back Tap

## Calendar assistant branch

The `feat/calendar-assistant` build adds **Ask Cue** while preserving the existing reminder Shortcut. Deploy the current Worker, sync/build/install Cue, then enable **Settings → Connect Apple Calendar → Full access**. The permission is a phone step; Mac compilation cannot grant it.

Test these unlocked first through Cue, then through Back Tap:

1. “Remind me to make sushi in two minutes”: one Cue card, unchanged elapsed deadline and missed behavior.
2. “Add a Calendar event called Cue calendar test tomorrow at 2 PM for 30 minutes”: inspect Apple Calendar for one correctly timed event. Repeat once: the duplicate guard should report it already exists.
3. “What events are coming up day after tomorrow?”: compare the brief Activity answer with Apple Calendar. Confirm no Cue reminder was added by the question.
4. “When am I free two days from now?”: compare gaps against overlapping and busy all-day events; unspecified hours mean 9 AM–6 PM. Deny/revoke permission and verify it requests access rather than claiming the day is free.
5. “Move my Cue calendar test event tomorrow to 4 PM tomorrow”: inspect the moved occurrence. Try two matching events and confirm it asks which one without moving either.
6. Watch the answer for about eight seconds and confirm the next event/reminder returns. While an event is in progress, the card has no reminder completion circle and the event leaves the timeline at its end. Reopen Cue after editing events elsewhere to refresh the saved push snapshot.

After installing the simple-answer update, reproduce the reported case: a 9–10 AM Hackathon and two subscribed all-day holiday dates tomorrow. **“What's for tomorrow?”** should show **Hackathon, 9–10 AM tomorrow.** as the large main text, with no default event table. **“Am I free tomorrow?”** should show **Free after 10 AM tomorrow.** in that same large font, with only a small **Checked 9 AM–6 PM** scope note. A personal all-day busy event must still block availability. Subscribed dates without availability and birthdays are informational; explicitly busy subscribed events still block. Do not create test events in the real Calendar unless the participant approves those writes.

Ask a basic general question, such as **“What is the capital of India?”**: the actual reply must be the large main text, not a big “Cue” title and a small subtitle. Verify a longer reply stays within three main-text lines, and that the next reminder/event returns after about eight seconds.

Tap a Calendar answer while it is visible: Cue should optionally open its complete scrollable answer, retaining all events and holiday dates. Several appointments get a short remaining count on the card; multiple gaps show up to two intervals and a remaining count. In-app Calendar questions now show a brief confirmation without automatically opening a details sheet. The saved full answer is not continuously updating; ask again after editing Calendar. Disconnect Calendar and verify it is cleared. A native rebuild is required; the already-deployed Worker does not need another deployment.

`npm run cloud:check:assistant` verifies six synthetic AI request plans without reading/writing your phone Calendar. It is a paid backend check, not proof of EventKit/device behavior. Questions use fresh local Calendar data at execution. Unattended transitions require the separate APNs configuration in [worker/APNS.md](worker/APNS.md), which still needs Apple keys. Existing native Activity snapshots decode across this upgrade; restarting the companion after installation gives it the new event queue.

Verified at 06:54 IST: 22 Worker tests, seven scheduler tests, two real runtime tests, three companion checks (including 12 new Calendar/free-time scenarios), four path checks, typecheck/lint, native packaging and unsigned Release app/widget compilation passed. At 07:09 IST, after explicit participant approval, the current Worker was deployed and authenticated readiness reported `assistant:true`. The 22 Worker and seven scheduler tests passed again; all six live AI routing cases passed, plus “What's for tomorrow?” selected the full 12 October local day in Asia/Kolkata. Seven synthetic AI calls were made without accessing or modifying any phone Calendar. Retry that question on the phone and compare the answer with Apple Calendar; actual event contents and eight-second rendering remain device checks.

At 07:24 IST, typecheck/lint, the 22 Worker/seven scheduler/four path/three companion checks and the unsigned Release app/widget build passed for the UI/free-time fix. Companion tests add 20 answer scenarios, including the reported holiday/Hackathon case, personal all-day busy time, subscriptions, declined/free events, full-result retention, date labeling and bounded Unicode payload. `tests/swift/answer-preview.swift` renders the actual answer component with synthetic data; six renders at 320/350/390-point widths fit below 160 points (agenda 155, free-time answer 134). This does not prove system translucency, physical navigation or EventKit metadata on the phone. No new paid AI calls, real Calendar access/writes or phone installation were performed for this fix.

At 07:35 IST, those same checks and the unsigned Release app/widget build passed for the simpler main-answer UI, including 12 additional compiled scenarios for concise summaries, a middle free interval, legacy saved-answer decoding and general-answer promotion. Twelve synthetic component renders passed at 320/350/390-point widths (97–143 points); general, agenda, free-time and long-reply previews were visually inspected. App executable, nonempty bundled JavaScript and embedded widget were verified. The first new exact-text test needed normalization of Apple's localized thin spaces, not a production date change. No Worker deployment, paid AI call, phone Calendar operation or app installation/launch was performed.

The screenshot's **“Cloud AI isn’t configured”** error occurred in the native Shortcut before any AI request. The new build embeds the Cue Worker origin/access token, so the Shortcut no longer relies on JavaScript opening once to save them. An older installed binary does not gain this fix from a JavaScript reload: rebuild and install it.

**This local checkout's server setup is complete as of 11 October 2026, 04:58 IST.** The deployed Worker has the D1 binding/schema and matching Cue token; authenticated readiness passed. The exact sushi sentence returned **Make sushi** with a deadline two minutes ahead in **2.524 seconds**. Written-out duration, explicit local time and ambiguous input also passed. Start at **step 3** to install and test on your phone. Steps 1–2 remain here for a fresh deployment or troubleshooting. Backend checks do not create reminders on the phone.

A later read-only audit confirmed all three participant Back Tap reminders were saved with times. The current update follows the participant's **Live Activity only** preference: it removes the Shortcut success dialog and new iPhone local alerts, adds missed review and a Worker/APNs scheduler. **These native changes require rebuilding/installing Cue.** The existing AI backend works independently; unattended queue switching additionally requires [Apple push setup](worker/APNS.md).

## 1. Configure a fresh Worker if needed

- Replace the deployed JavaScript with the current [worker/worker.mjs](worker/worker.mjs) and deploy it. This includes runtime-compatible upstream requests and server-calculated elapsed deadlines; the AI model and quota limits remain the same.
- Create/select the D1 database, execute [worker/schema.sql](worker/schema.sql) in its Console, and bind it to the Worker with the exact name **CUE_DB**.
- Add **OPENAI_API_KEY** as a Cloudflare Secret using your OpenAI key.
- Add **CUE_CLIENT_TOKEN** as a Cloudflare Secret. Its value must exactly match **EXPO_PUBLIC_CUE_CLIENT_TOKEN** from the local `.env` in this app folder. Do not paste the OpenAI key into this field. The token has already been generated locally; preserve it rather than generating a different one.
- Deploy the saved bindings/secrets. Open `https://floral-frost-2cd1.ajaytcr007.workers.dev/health`. Expect `{"ok":true}`. The updated Worker lists missing/invalid setting names when not ready; it never returns secret values.

## 2. Verify the backend before using the phone

From the app directory:

```bash
npm run cloud:check
```

Expect `"connected": true`. This checks the Cue access token and actual D1 schema without an OpenAI call or quota consumption. It also reports `liveActivity.configured` and missing APNs setting names. AI can work while push is not configured. For automatic changes while Cue is closed, finish [worker/APNS.md](worker/APNS.md) and expect that flag to be true. This does not prove the OpenAI key/model or Apple signing key works; the live tests do.

Then run the user's exact sentence once through OpenAI:

```bash
npm run cloud:check -- --parse
```

This sends **“Remind me to make sushi in 2 minutes”** once, only after the readiness check passes. Expect a title such as **Make sushi** and `dueAt` about two minutes ahead. It reports latency and an `ai` receipt with provider-reported model, request/response IDs, organization identifier and input/output token counts. Missing provider metadata is `null`, not invented. This incurs one text API request but creates no reminder/notification on the phone. An error here means the phone cannot successfully create this reminder either; address that error first. The [OpenAI Usage dashboard](https://platform.openai.com/usage) reports billing separately; check the organization/project owning the Worker key and a date range covering the actual UTC timestamps. Very small Luna requests can cost far below one cent.

## 3. Install a standalone Cue app

Check that local `.env` contains the Worker origin and matching Cue token, then run:

```bash
npm run ios:sync:companion
npm run ios:build:standalone
```

Choose your connected iPhone. This **Release** build bundles the JavaScript screen and native cloud configuration, so it does not need Metro or a tunnel. Do not run `start:dev:tunnel` for this test.

If you install using Xcode instead: open `ios/Cue.xcworkspace`, select the **Cue** scheme and your iPhone, choose **Product → Scheme → Edit Scheme → Run → Build Configuration → Release**, then Run. Use the appropriate development team/automatic signing for both **Cue** and **CueCompanion**, and complete any macOS signing permission prompt. An unsigned compile check cannot install the app. The earlier CLI attempt hit `errSecInternalComponent` while signing the widget; resolve signing in Xcode if that recurs.

For debugging with a Debug development build instead, its React Native screen requires a running Metro server. Native Shortcut configuration is now embedded in that build too, but the standalone Release route above avoids the development-server dependency for this test.

## 4. Check the app and permissions

1. Search your iPhone for and open **Cue** after the installation finishes.
2. Open the gear/settings sheet and tap **Check cloud connection**. Expect **Connected: access token and quota database verified**. This is a setup check, not an AI completion.
3. Allow Live Activities for Cue in iPhone Settings. No notification permission is required for the custom iPhone Live Activity-only flow.
4. Complete old test reminders to isolate this test; preserve any real reminders. The normal card now chooses the latest task in its one-minute due window or the earliest upcoming task. Older unfinished tasks stay in the list and missed badge.
5. Turn the companion off/on once if it came from an older installed build without push support. With Apple setup complete, Settings should show **Automatic updates scheduled with Apple push**; otherwise it reports what needs attention. A JavaScript reload cannot add push support to the installed binary.

## 5. First test inside Cue

Type exactly:

> Remind me to make sushi in 2 minutes

Submit once. Expect:

- A **Make sushi** reminder in Cue with a future due time about two minutes from submission.
- The Live Activity shows **Thinking…**, then **Added: Make sushi** with the time, then the due/upcoming reminder or Calendar event. In-app captures respect an explicitly disabled companion; enable it in Settings if needed.
- No **Cloud AI isn’t configured** error and no newly saved untimed placeholder.

Lock the phone and wait about two minutes. With APNs configured and its schedule registered, the Worker updates this same card to **NOW**, without a notification banner/sound. After one minute unfinished, the task appears in the missed badge. Foreground updates work while Cue is active; the preloaded stale snapshot supplies only one fallback transition. Without Apple push setup, do not assume all future changes happen while Cue is suspended.

## 6. Test the Shortcut, then Back Tap

In Apple's Shortcuts app:

1. Create a shortcut named **Add to Cue**.
2. Add **Ask for Input**, with type **Text** and a prompt such as “What should Cue remember?”
3. Add **Cue → Add Cue reminder**. Tap its **Reminder** field and select the **Provided Input** variable from Ask for Input. Pass the variable, not a fixed literal sentence.
4. Run it unlocked with the sushi sentence. Expect a new card in Cue and the Live Activity acknowledgement; the action now finishes silently, without the large success dialog/Done button. Remove any extra **Show Result/Show Alert** action from your Shortcut. iOS still owns the text-input, progress, authentication and error UI.
5. Only after that works, choose **Add to Cue** under **Settings → Accessibility → Touch → Back Tap → Double Tap** or **Triple Tap**.
6. Trigger Back Tap while unlocked and repeat with a fresh timed reminder. Locked-phone text input/authentication is controlled by iOS; verify it separately after the unlocked flow works.

For the requested sequence, add a fresh task **in 2 minutes**, then another **in 3 minutes**, and leave them incomplete. Each relative time starts at its own submission. Lock the phone: the first should become NOW, then the second should replace it and show **1 missed** for the first. Tap the badge to review the first on the same card; **Back** returns to the current task. Open Cue and confirm both entries exist. Complete the missed task to check that its badge contribution disappears. The full procedure and push setup are in [worker/APNS.md](worker/APNS.md).

## Read the result correctly

| Result | Meaning / next step |
| --- | --- |
| No cloud settings in this Cue build | Re-run native sync and rebuild/install; opening an older binary alone cannot embed the configuration. |
| `not_configured`, or health `ok:false` | Worker binding or secrets are missing/invalid. The updated health response names them. |
| Access token mismatch / HTTP 401 | Copy the local Cue token into Cloudflare's `CUE_CLIENT_TOKEN` Secret and deploy. |
| `quota_unavailable` | Create the SQL table in the database bound as `CUE_DB`. |
| `ai_configuration` | Check the OpenAI key and model access in the Worker. |
| HTTP 429 | Wait for the request window to reset. Global limits apply across all callers. |
| Added task with due time, but no notification | Expected in the custom iPhone build: Live Activity only. |
| Card does not switch while Cue is closed | Check APNs configuration, signing entitlement and Settings' schedule status; restart an old companion once after upgrade. |
| Earlier upcoming reminder returns after Added | Expected when it is due sooner than the new task; all saved tasks remain in Cue. |

Each activity can remain active for up to eight hours and can be dismissed. Updating does not reset that lifetime; later enabled captures can start a new session. Reminders persist independently. Apple push delivery is subject to connectivity and budgets; Background Refresh is not an exact-time alternative.

Offline checks now include 18 AI/sync Worker scenarios, five push scheduler/ES256 scenarios, two real workerd/D1/alarm tests with fake Apple/OpenAI endpoints, three companion checks (17 Swift selection/date cases plus six configuration cases), four path checks, typecheck/lint and unsigned Release app/widget compilation. Live text AI and the earlier three Back Tap saves are verified. Actual APNs delivery, rendered missed badge, removal of the result dialog on the phone, locked-phone behavior and live voice still need the rebuilt app/device test. No installation, Metro or tunnel was started during these changes.
