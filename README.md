# Cue

Cue is a calm, card-based personal reminder app for iOS and Android. Write a thought naturally — or speak it — and Cue turns it into a reminder card and understands an optional date and time with OpenAI. The custom iPhone app uses its Live Activity alone; Expo Go and Android retain local notification alerts.

Built from scratch for the DevDay Exchange Community Hackathon: Kochi, 10–11 October 2026.

## What it does

- Captures typed reminders in a focused, card-first interface inspired by the supplied reference.
- Records up to about 60 seconds from the in-app microphone and sends it through the cloud Worker for transcription.
- Uses structured OpenAI output to turn natural language such as “Call Mum tomorrow at 8 PM” into a title, detail, and due time.
- Saves reminders on the device so the list survives a restart.
- Shows timed reminders on the custom iPhone Live Activity without duplicate notification alerts; Expo Go/Android schedule local alerts when permitted.
- Lets people mark cards complete or long-press a card to remove it.
- Routes all AI calls through a rate-limited Cloudflare Worker; the OpenAI key stays in Cloudflare Secrets.
- Adds a minimal native Lock Screen companion and a quiet Shortcuts action in custom iPhone builds: tiny face mark, processing/added feedback, one due/upcoming reminder and a tappable missed badge.
- Includes a Worker/APNs deadline scheduler for the same activity; Apple signing-key setup and a new native build are required. See [worker/APNS.md](worker/APNS.md).
- In custom iPhone builds, understands questions, reminders, Calendar additions and moving a single event through the same typed, spoken or Back Tap request. Calendar answers appear on the Live Activity for about eight seconds, then the next reminder or Calendar event returns.

## Apple Calendar and Ask Cue

After installing the new native build, open **Settings → Connect Apple Calendar** and grant **full access**. [Apple EventKit](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) requires this permission to read existing events; write-only access cannot answer availability questions. Cue reads all calendars synced to the device and creates new events in the writable default Calendar. Disconnecting in Cue stops reads/writes; revoke the system permission in iPhone Settings if desired.

Examples through the composer, microphone or **Cue → Ask Cue** in Shortcuts:

- “Remind me to make sushi in two minutes” saves a normal Cue reminder.
- “Add a Calendar event for lunch tomorrow at 1 PM for 30 minutes” writes the event.
- “What events are coming up day after tomorrow?” reads that local day's events.
- “When am I free two days from now?” reports gaps between 9 AM and 6 PM by default, or uses the hours you specify.
- “Move my lunch event tomorrow to 2 PM tomorrow” moves one matching occurrence. Include the original date/time if there are multiple matches.

The original **Add Cue reminder** Shortcut remains available and accepts the same requests after the native update. Back Tap assignment remains in iPhone Settings; use **Ask for Input** or **Dictate Text → Ask Cue**, passing the input into **Request**. Calendar permission is requested in the app first, never during a background Shortcut. Apple's input/authentication UI still applies.

The AI interprets one request into a validated action. Calendar contents remain on the iPhone: EventKit reads the requested window and native interval arithmetic calculates free time, including overlaps and personal busy all-day events. Events explicitly marked free and declined invitations do not block availability. All-day birthdays and subscribed all-day dates with unsupported availability are informational, not busy appointments; explicitly busy subscribed events and timed subscriptions still reserve time. This uses [EventKit availability](https://developer.apple.com/documentation/eventkit/ekevent/availability) and [subscription metadata](https://developer.apple.com/documentation/eventkit/ekcalendar/type?language=objc), not event-title guesses. Informational dates remain in the agenda but no longer dominate the next-event card.

Answers themselves are now the large main text, not a generic “Cue” or “Calendar” heading above a small reply. General questions show one simple answer, such as **The capital of India is New Delhi.** Calendar questions use the same format: **Hackathon, 9–10 AM tomorrow.** or **Free after 10 AM tomorrow.** Additional appointments/free slots get a short remaining count; the local date and checked availability hours are small context, not the answer. No event table is shown on the Live Activity. Informational holidays remain available in the complete agenda but do not crowd out appointments or block free time.

Tap a Calendar answer while it is showing to optionally open the full scrollable answer in Cue. Typed/spoken questions show a brief confirmation without automatically opening that sheet. Full results remain stored only on the phone until another Calendar question replaces them or Calendar is disconnected; the sheet labels them as a snapshot. Apple's [Live Activity guidance](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities) limits the height and payload; lengthy replies are limited to three main-text lines and may be truncated.

The cloud receives your request, not the Calendar query results. With push scheduling, a bounded queue also includes upcoming event titles/start/end times; it expires with the companion session. The same Activity shows a brief response and restores the next item. Due reminders retain priority; Calendar events stay current until their end and do not become missed tasks.

Limits: one action/request, query windows up to 31 days/500 events, explicit event start time, one-hour default duration when omitted, and additions up to one year ahead. Vague dates ask for clarification without creating anything. Moving an event with guests directs you to Calendar to review invitations. No event deletion, invitation management, new recurring-series creation, or conversational follow-up memory is implemented. Full Calendar answers work in the rebuilt native iPhone app; Expo Go/Android retain reminders. External Calendar edits refresh while Cue runs or when it next opens/handles a request; a suspended phone app cannot stream EventKit changes to the server. APNs setup remains required for unattended multi-step transitions and Apple limits each Activity to eight active hours.

Deploy the updated Worker, then sync/build as described below. `npm run cloud:check:assistant` makes six synthetic paid AI calls to verify routing/times without touching a phone or Calendar. Physical permission, EventKit writes and the rendered eight-second answer still require device validation; an unsigned build does not establish those results.

Branch status (11 October 2026, 07:09 IST): the participant approved deployment, and the updated Worker is live with `assistant:true`. All six synthetic AI routing checks passed, plus the reported “What's for tomorrow?” question correctly selected the 12 October local Calendar day in Asia/Kolkata. These checks verify request interpretation, not the phone's actual events or rendered answer. Automated checks and the unsigned Release app/widget build pass; the three Apple push secrets are still missing. Actual EventKit writes and the brief answer/restoration still need device testing.

The simplified main-answer UI is native and requires another sync/build/install; a JavaScript reload or Worker deployment will not update the installed widget or its free-time rules. The existing 20 compiled Calendar answer scenarios and 12 new simple-answer scenarios passed. Twelve renders of the actual SwiftUI component at 320/350/390-point widths fit within 160 points (97–143 points), including general, agenda, free-time and long replies. These are component renders, not screenshots of a running phone. The unsigned Release app/widget compiled; device rendering and card-to-sheet navigation remain participant checks. The prior version was safely pushed as `258ec79` on `feat/calendar-assistant` before this simplification; `main` is unchanged.

## Run the app

For a phone test without Metro or a tunnel, follow [TESTING.md](TESTING.md): verify the Worker, sync native configuration, install a standalone Release build, then test in-app capture before Back Tap. This is the recommended path for checking the reported two-minute sushi reminder failure.

### Prerequisites

- Node.js 24.3 or newer is recommended by the installed React Native version. The project bundled successfully with Node 24.2.0, but npm reports an engine warning on that version.
- Expo Go or an iOS/Android simulator/device. A physical device is best for trying microphone recording and notifications; Xcode is required to compile a custom iOS development build.
- [Expo SDK 57 officially requires Xcode 26.4 or newer](https://docs.expo.dev/versions/latest/). This project includes a temporary compatibility patch for the specific ExpoModulesJSI compiler errors on Xcode 26.3; that framework compiled successfully on 26.3, but a complete signed app build on that toolchain is not yet verified.
- A deployed Cloudflare Worker with its D1 quota database and OpenAI secret, plus the Worker URL/Cue access token in the app environment (see setup below).
- iOS 17 or newer for the custom Cue app and its interactive Live Activity. Expo Go and Android retain the ordinary reminder UI and do not include the companion.

### Install a development build on a wired iPhone

This is the actual app binary installed on your device, not Expo Go. Connect the iPhone by USB, unlock it, tap **Trust** if asked, and enable **Developer Mode** in iPhone Settings → Privacy & Security. You also need Xcode installed and signed in with an Apple ID for development signing.

```bash
npm install
npm run ios:build:device
```

Choose the wired iPhone when Expo asks. The first build can take a few minutes because it generates the native iOS project, installs pods, signs the app for development, and installs Cue. Rebuild when native sources, dependencies, `app.json`, or the Worker URL/Cue access token change.

For an existing `ios/` checkout, run `npm run ios:sync:companion` before rebuilding. This copies the tracked Swift sources into the native project, adds the extension, and preserves the app's development team. For a fresh checkout, the registered config plugin does this during prebuild. Use `ios/Cue.xcworkspace` in Xcode and ensure **CueCompanion** has an appropriate development provisioning profile as well as **Cue**. A JavaScript reload cannot install this extension.

Then start the development server through a tunnel:

```bash
npm run start:dev:tunnel
```

Open the installed **Cue** development app on the iPhone, or scan the development-build QR code it prints. This project includes both `expo-dev-client` and the local `@expo/ngrok` helper, so this command targets your installed development build and uses a tunnel rather than Expo Go.

For regular iteration after the first install, use the same `npm run start:dev:tunnel` command. TypeScript-only UI changes do not need another native build. If you pull this visual refresh into an already-installed development app, rebuild it once because it adds Expo's native glass module; later JavaScript-only UI changes still reload normally.

### Liquid Glass interface

Cue follows Apple's [Materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials): native Liquid Glass is reserved for the primary capture surface and small action controls, while reminder rows stay in the calmer content layer. On iOS 26 or later, the app uses Expo's native [GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/) implementation when the runtime API is available. iOS versions without the API, accessibility-adjusted appearances, Android, web, and preexisting development builds use the same layout with an opaque, legible material fallback.

#### ExpoModulesJSI compiler workaround

If Xcode reports that `RuntimeScheduler` cannot use `SWIFT_RETURNS_RETAINED`, the installed `expo-modules-jsi@57.1.1` contains a known Swift 6.2 compatibility bug. `patches/expo-modules-jsi+57.1.1.patch` backports [Expo's merged fix #51040](https://github.com/expo/expo/pull/51040), including its related host-callback concurrency fix. It preserves ownership annotations by moving construction to static factories, rather than disabling compiler checks.

`npm install` automatically applies the patch with `patch-package`; `npm run postinstall` reapplies it to an existing install. Keep the patch in version control. After applying it, stop any failed build and retry **Product → Build** in `ios/Cue.xcworkspace` or `npm run ios:build:device`. The framework build phase detects changed source files automatically; do not regenerate or delete the native project just for this error, as that can overwrite signing changes.

This is a narrow workaround, not full support for SDK 57 on older Xcode. Once an SDK-compatible package release includes the upstream fix, remove this patch and revalidate the native build; do not independently jump `expo-modules-jsi` to another SDK's major version. Provisioning-profile errors and ngrok connection failures are separate from this compiler error.

#### Build scripts and paths containing spaces

The installed Expo Constants podspec and the generated React Native bundle phase have quoting bugs when a directory name contains a space, such as `Codex hackathon`. The Constants patch in `patches/expo-constants+57.0.21.patch` follows [Expo's upstream path-quoting fix #48747](https://github.com/expo/expo/pull/48747); it quotes both the script invocation and the `PROJECT_DIR` lookup. `plugins/withIosBuildPathQuotes.cjs`, registered in `app.json`, quotes the RN script invocation during future prebuilds. The same small correction has already been applied to the existing Cue project without changing signing settings.

The patches apply automatically on npm installs. For an existing native project, refresh Pods after reinstalling or applying a podspec patch:

```bash
cd ios
pod install --no-repo-update
cd ..
npm run ios:build:device
```

Do not rename the workspace or use `expo prebuild --clean` just for this error. `npm run test:ios:paths` runs four regression checks for space-containing paths and the config plugin; these tests require CocoaPods. The Dev Launcher dependency-analysis warning is non-blocking and does not need to be fixed to install the app.

If ngrok reports that the tunnel cannot connect, stop any older Expo servers with `Ctrl+C`, run `npm install` once to ensure the local tunnel helper is present, and retry `npm run start:dev:tunnel`. A restrictive VPN, firewall, or public Wi-Fi can block ngrok; in that case use `npm run start:dev` while the phone and Mac share the same Wi-Fi.

### Simulator and Expo Go alternatives

`npm run ios:simulator` explicitly uses `localhost`, so it never waits for an ngrok tunnel. It starts the iOS simulator with Expo Go. For an Android emulator, use `npm run android`.

For Expo Go on a physical iPhone, put the Mac and phone on the same Wi-Fi network, then run `npm run ios:go:device` and scan its QR code. This uses your LAN—not ngrok.

Useful commands:

```bash
npm run typecheck
npm run lint
npm run ios
npm run ios:simulator
npm run ios:device
npm run ios:build:device
npm run ios:build:standalone
npm run cloud:check
npm run start:dev:tunnel
npm run android
```

## Configure cloud AI

Follow [worker/README.md](worker/README.md) to deploy the standalone [Worker JavaScript](worker/worker.mjs), initialize [the D1 quota table](worker/schema.sql), and add `OPENAI_API_KEY` and `CUE_CLIENT_TOKEN` as Cloudflare **Secrets**. No OpenAI key belongs in Cue, its environment, or the Shortcut.

Copy `.env.example` to `.env` if needed and set `EXPO_PUBLIC_CUE_WORKER_URL` to the Worker's HTTPS origin and `EXPO_PUBLIC_CUE_CLIENT_TOKEN` to the separate Cue token. Remove the obsolete `EXPO_PUBLIC_OPENAI_API_KEY` setting. Run `npm run cloud:check` to verify the deployed token and D1 table; `npm run cloud:check -- --parse` then tests the exact sushi sentence through OpenAI once. Run `npm run ios:sync:companion` and rebuild/install whenever the cloud environment changes. Native sync/prebuild embeds these two Cue settings in the app, so Shortcuts no longer depend on JavaScript saving them on first launch. A standalone Release build bundles the screen and needs no Metro or tunnel. Existing reminders are preserved, and old device-stored OpenAI keys are removed.

AI capture is cloud-only. Missing configuration, offline/network failures, and rate limits show an error instead of silently saving unparsed text. The demo uses `gpt-6-luna` with reasoning disabled for focused, low-cost extraction; voice uses `gpt-4o-mini-transcribe`. For elapsed durations such as “in two minutes,” AI extracts the duration and the Worker calculates the deadline from the request's server timestamp. Calendar times use the supplied local clock/time zone. Limits are global: 10 text requests/minute and 500/UTC day, plus 2 voice requests/minute and 50/UTC day. See the Worker guide for the security scope, tests and tuning. The app access token is shipped to the client and is suitable for a private demo; public distribution needs real user authentication.

The participant’s local checkout is now connected to [the deployed Worker](https://floral-frost-2cd1.ajaytcr007.workers.dev/health). Wrangler created `cue-ai-limits` in APAC, initialized its quota table and bound it as **CUE_DB**; the Worker’s Cue access token matches the ignored local `.env`, and the existing OpenAI secret was preserved. On 11 October 2026 at 04:58 IST, authenticated readiness and live AI parsing passed: the exact sushi prompt returned **Make sushi**, due two minutes ahead, in **2.524 seconds**. Written-out duration, explicit local clock time and ambiguous-time checks also passed. These requests create no reminder on the phone.

For a new installation, follow [TESTING.md](TESTING.md). A prior signed CLI attempt failed at widget signing (`errSecInternalComponent`); resolve signing in Xcode for both targets if necessary. The participant subsequently installed Cue, and a read-only iPhone audit confirmed three timed Back Tap saves. The newer Live Activity-only/missed/push changes require another native rebuild and [APNs setup](worker/APNS.md); they are not yet verified on that installed phone. No installation or Metro/ngrok server was started by the agent during this update.

`npm run cloud:check -- --parse` now also reports the real OpenAI model, request/response IDs, organization identifier and token counts in an `ai` receipt. One live verification returned 378 input tokens, zero cached input tokens and 30 output tokens (408 total) in 2.815 seconds. At the listed standard input/output rates, that is approximately $0.0000528 before any other billing adjustments, so a two-decimal spend display may look unchanged. Check the [Usage dashboard](https://platform.openai.com/usage) for the account/project owning the Worker's OpenAI key, using a date range covering 10–11 October. The participant's three saved captures occurred at 23:44–23:48 UTC on 10 October (05:14–05:18 IST on 11 October). Exact historical token counts were not retained; quota counters include failed attempts and are not a billing ledger.

## Demo flow

1. Open Cue and type: `Remind me to call Mum tomorrow at 8 PM`.
2. Tap the up-arrow. With the cloud configured, Cue creates a card with a parsed time; the custom iPhone app acknowledges it on the Live Activity without requesting notification permission.
3. Tap a card to complete it; it becomes a warm red completion card and cancels its pending notification.
4. Tap the microphone, speak a reminder, then tap the mic again. Cue transcribes it and adds the resulting card automatically.
5. Long-press a card to remove it.

## Lock Screen companion and Back Tap

1. Complete [TESTING.md](TESTING.md) through the in-app capture check: verify the Worker, sync the cloud environment and install the custom iPhone app. The first in-app capture starts **Lock Screen companion** automatically; you can also start it from Settings. Allow Live Activities in iPhone Settings. An explicit off setting is respected for in-app captures. Configure [Apple push updates](worker/APNS.md) for unattended deadline changes.
2. In Apple's **Shortcuts** app, create a shortcut with **Ask for Input**, using input type **Text**. Add **Cue → Add Cue reminder** and pass the provided input into its **Reminder** parameter. Save it as “Add to Cue.”
3. In iPhone **Settings → Accessibility → Touch → Back Tap**, assign that shortcut to Double Tap or Triple Tap. Start testing with the phone unlocked; the input sheet and authentication behavior while locked need physical-device verification.
4. Back Tap and enter a clear sentence such as `Remind me to call Mum tomorrow at 8 PM`. The native action sends it to the Worker, saves its title and optional timezone-aware due date into Cue's store and updates the card. It returns silently after saving, without the extra success dialog/Done button. Remove any separate Show Result/Show Alert action in your Shortcut; iOS still controls input, authentication, progress and error UI.

The card uses the system's default translucent Lock Screen background, allowing iOS to choose its native appearance. It does not put an opaque colored panel over that surface or assume the app-only `glassEffect` modifier works inside a widget. Actual Liquid Glass appearance depends on the OS and needs device review.

With nothing upcoming, the card collapses to the small face and “cue” mark, retaining a missed badge when needed. Capture shows **Thinking…**, then briefly **Added: [task]** and its time, then restores the current due or earliest upcoming task/event. Questions show an eight-second answer instead. The latest newly due reminder takes priority. An unfinished reminder becomes missed when a newer due task replaces it or after its one-minute NOW window. Tap **1 missed** to review it on the same card, tap again to cycle missed tasks, or tap **Back** to resume. Completion removes it from the missed count. A newer deadline interrupts missed review. Opening Cue synchronizes all Shortcut-created tasks and completion states into the existing list; nothing is deleted when missed.

While Cue is active, a foreground deadline task refreshes the card. When it is suspended, the Worker schedules Durable Object alarms and sends ActivityKit push updates at due times and missed transitions. These update the existing activity with no alert/sound payload. Native registration tracks token changes, replaces the open queue after mutations and uses increasing revisions to reject late writes. The snapshot also preloads one next transition via `staleDate` as a limited fallback; it is not a general scheduler. [Apple explicitly does not guarantee Background Refresh execution at a requested date](https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate). APNs connectivity/budgets also prevent hard real-time guarantees. Follow [worker/APNS.md](worker/APNS.md) to configure Apple credentials and verify real delivery; fake-key runtime tests do not establish device delivery.

An active Live Activity lasts **at most eight hours**, and people can dismiss it. Ended content can remain on the Lock Screen for up to four additional hours. Updating the same activity does not renew that limit. Start a new session from Settings or a later capture after it ends (provided the companion is enabled). There is no automatic 24/7 renewal.

The Shortcut needs cloud settings in its installed native build and network access. Ambiguous or missing times remain **No time set**; a parsed time in the past is rejected. The iPhone upgrade cancels legacy alerts associated with saved Cue reminders without deleting those reminders. No new local notifications are scheduled in the custom iPhone app. The APNs queue stores only open titles/IDs/times and its activity token for a bounded session; it is not account/device reminder sync. Apple keys stay in Worker Secrets. The generated `ios/` project is ignored because it embeds the separate demo access token and local signing; reproduce it from the tracked plugin and Swift sources.

## Architecture and integrations

The app deliberately stays small:

- `App.tsx` coordinates UI state, recording, parsing, persistence, and card actions.
- `src/components/` contains the composer, reminder card, and settings sheet.
- `src/lib/cloud.ts` validates cloud configuration and makes bounded-time Worker requests; `src/lib/reminderParser.ts` handles the parsing and transcription contracts.
- `worker/worker.mjs` calls OpenAI Responses with a strict JSON schema and the transcription endpoint, authenticates the demo client token, bounds inputs and atomically enforces global quotas using D1.
- `src/lib/storage.ts` uses AsyncStorage in Expo Go/Android and migrates its existing reminders once into the native store in custom iPhone builds. Native mutations are authoritative, so a stale UI snapshot cannot overwrite a Shortcut capture.
- `src/lib/companion.ts` connects the app to the native service and observes shared reminder changes. Native reminder JSON lives in the app's Application Support directory; the Live Activity only receives a small display snapshot.
- `native/companion/` contains the Swift actor, native cloud configuration lookup, ActivityKit attributes, SwiftUI widget, and App Intents. Native Shortcuts read the installed app's cloud settings without requiring the React Native screen to be open. Both app and Shortcut mutation paths use this service in a custom iPhone build; success receipts name the saved task and time.
- `plugins/withCueCompanion.cjs` adds the app source membership, embedded widget target, and minimum iOS version during prebuild. `scripts/syncCompanion.cjs` applies it to an existing project without regenerating it.
- `src/lib/notifications.ts` schedules Expo Go/Android alerts. The native iPhone service cancels legacy Cue alerts, registers ActivityKit tokens/queues and otherwise uses the Live Activity alone. Native settings also hydrate JavaScript so text/voice and Shortcuts use the same Worker. Only the separate, extractable Cue demo token is embedded; OpenAI/APNs private keys stay in Cloudflare.

Libraries and services:

- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) for microphone capture.
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for local notifications.
- [Expo GlassEffect](https://docs.expo.dev/versions/latest/sdk/glass-effect/) for native iOS Liquid Glass on selected in-app controls.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) for removing legacy personal keys, and AsyncStorage for on-device reminders.
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) for [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) extraction, and [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text) for voice input, called exclusively from [Cloudflare Workers](https://developers.cloudflare.com/workers/) with [D1](https://developers.cloudflare.com/d1/) quotas.
- [ActivityKit](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities), [Live Activity design guidance](https://developer.apple.com/design/human-interface-guidelines/live-activities), [WidgetKit animations](https://developer.apple.com/documentation/widgetkit/animating-data-updates-in-widgets-and-live-activities), and [LiveActivityIntent](https://developer.apple.com/documentation/appintents/liveactivityintent) for the native companion. Back Tap and text input follow Apple's [Shortcut setup](https://support.apple.com/en-ie/guide/shortcuts/apd897693606/ios) and [Ask for Input](https://support.apple.com/guide/shortcuts/use-the-ask-for-input-action-apd68b5c9161/ios) documentation.

Companion checks: `npm run test:companion` compiles/runs seven Swift selection scenarios plus six configuration cases, and checks plugin idempotence, app signing preservation, source membership, extension embedding/dependency, version inheritance, and native cloud embedding validation. It requires Xcode command-line tools. These tests do not exercise OpenAI or physical Back Tap. `npm run test:worker` runs sixteen offline backend scenarios using actual SQLite quota statements and mocked OpenAI responses. `npm run test:worker:runtime` additionally exercises the real Workers runtime and D1 with fake credentials and mocked outbound requests; its temporary local runtime closes on completion.

## Validation performed

On 10 October 2026:

- `npm run typecheck` passed.
- `npm run lint` passed with no warnings or errors.
- `npx expo export --platform ios --output-dir /private/tmp/cue-ios-export` passed and produced an iOS JavaScript bundle.

On 11 October 2026, after backporting the ExpoModulesJSI fix:

- `npm run typecheck`, `npm run lint`, and `npm run postinstall` passed.
- `git apply --check --reverse patches/expo-modules-jsi+57.1.1.patch` confirmed the installed sources match the patch.
- The ExpoModulesJSI build script compiled the `iphoneos`/arm64 framework successfully with Xcode 26.3 (Swift 6.2.4). This verifies the affected framework, not the complete signed app, device installation, or tunnel.

After correcting the build-script quoting on 11 October 2026:

- `npm run test:ios:paths` passed all four checks; postinstall, typecheck, lint, shell/Ruby syntax, and Expo prebuild config validation passed.
- `pod install --no-repo-update` refreshed the Constants build phase while leaving Cue's project and entitlements unchanged. Only the RN bundle script invocation was subsequently quoted in the existing Cue project.
- A complete Debug iPhone build passed with Xcode 26.3 using `xcodebuild -workspace ios/Cue.xcworkspace -scheme Cue -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' -quiet CODE_SIGNING_ALLOWED=NO build`. The resulting app contains an arm64 executable and the expected embedded Constants manifest. This is an unsigned compile/link check, not a signed install or runtime test; non-fatal dependency warnings remain.

After implementing the native companion on 11 October 2026, TypeScript/ESLint checks, both companion checks (including seven compiled Swift selection scenarios), and the four existing iOS path regression tests passed. Unsigned Debug builds compiled and linked the app and embedded widget for iPhone and Simulator. The Simulator bundle has `NSSupportsLiveActivities`, matching app/extension versions, and extracted App Intents metadata.

After moving AI calls to Cloudflare on 11 October 2026, all ten offline Worker scenarios, TypeScript/ESLint checks, both companion checks, and the four path tests passed. The complete unsigned Debug iPhone app/widget compiled successfully after synchronizing the native cloud bridge. Deployment/live AI were still pending at that checkpoint; subsequent verification is recorded below.

After fixing the native configuration failure on 11 October 2026, all twelve Worker tests, three companion tests (including seven selection/six configuration cases), four iOS path checks, typecheck and lint passed. The complete unsigned Release iPhone app/widget build passed. Its nonempty `main.jsbundle`, matching native Worker origin/token, Live Activities support, embedded extension and App Intents metadata were verified without exposing tokens. Live preflight stopped at incomplete Worker setup before making a paid call. See [TESTING.md](TESTING.md) for the gated end-to-end procedure.

After the HIG visual refresh on 11 October 2026, `npm run typecheck`, `npm run lint`, and the iOS JavaScript export passed. CocoaPods installed `ExpoGlassEffect (57.0.4)`, and its unsigned arm64 iPhone target compiled with the installed Xcode toolchain. CoreSimulator was unavailable in this environment, so the new rendered interface still needs a physical iOS 26 device review; the safe material fallback covers unavailable native APIs.

After configuring and deploying the Worker at 04:58 IST on 11 October 2026, fifteen offline backend tests, one real Workers runtime regression test and lint passed. The live authenticated readiness check and four real AI cases passed: numeric and written-out two-minute delays, a local 05:09 AM calendar time, and an ambiguous meeting left untimed. Measured request latency was 1.579–2.615 seconds in these four samples; this is not a latency guarantee. Initial deployment checks exposed an unsupported runtime redirect option and incorrect model timezone arithmetic, both corrected and covered by regression tests. The OpenAI key remains solely in Cloudflare Secrets.

A subsequent physical-device audit on 11 October 2026 confirmed three participant-triggered Back Tap saves in Cue's reminder file, corresponding to the live quota counter increasing from seven to ten. Two reminders were complete; the latest incomplete timed reminder had no notification identifier. The agent used a read-only CoreDevice file transfer and did not launch/install Cue. A fresh live API check with the new allowlisted usage receipt reported GPT-6 Luna, provider request/response identifiers and 378 input/30 output tokens. Sixteen backend tests, the real Workers runtime test and lint passed; no app rebuild is needed for this additive backend metadata.

The latest Live Activity-only update passed 18 Worker scenarios, five scheduler/ES256 tests, two real workerd/D1/alarm tests, three companion tests including 17 Swift selection/date cases and six configuration cases, four path tests, typecheck/lint and unsigned Release iPhone app/widget builds. Worker alarms produced two successive silent updates with one missed task under intercepted test APNs. Real Apple keys/device delivery and rendered dialog/badge behavior remain pending. Simulator UI was not used; no phone install, Metro or ngrok server was started.

## Known limitations

- The prototype does not yet offer reminder editing, recurring reminder creation, categories, Cue account/device sync, or sign-in. Apple Calendar supports creating events and moving one unambiguous occurrence.
- Expo Go/Android local alerts depend on device permission and operating-system scheduling policy; the custom iPhone build uses Live Activity only.
- Adding typed/spoken reminders needs network access and a configured Worker; viewing/completing existing reminders remains local.
- The private demo uses a shared Cue access token and global quotas. Public distribution needs real user authentication/per-user limits; the shared token is extractable from the client. No reminder cloud sync exists.
- Live Activity lifetime, push delivery and locked-screen interactions remain controlled by iOS. The APNs scheduler needs Apple credentials, supports 128 open tasks/session and has not been verified on the phone yet. There is no persistent daemon or automatic expiry renewal.

## Hackathon material

- [Event rules](RULES.md)
- [Agent and project workflow](AGENTS.md)
- [Development change log](CHANGELOG.md)
- [Codex usage record](AI_USAGE.md)
- [Submission checklist](SUBMISSION.md)
