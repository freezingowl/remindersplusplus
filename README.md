# Cue

Cue is a calm, card-based personal reminder app for iOS and Android. Write a thought naturally — or speak it — and Cue turns it into a reminder card, understands an optional date and time with OpenAI, and schedules a local notification when it has one.

Built from scratch for the DevDay Exchange Community Hackathon: Kochi, 10–11 October 2026.

## What it does

- Captures typed reminders in a focused, card-first interface inspired by the supplied reference.
- Records speech from the in-app microphone and sends it to OpenAI transcription.
- Uses structured OpenAI output to turn natural language such as “Call Mum tomorrow at 8” into a title, detail, and due time.
- Saves reminders on the device so the list survives a restart.
- Schedules local notifications for future due times when notification permission is granted.
- Lets people mark cards complete or long-press a card to remove it.
- Stores an optional OpenAI key in secure device storage through the settings sheet.
- Adds a minimal native Lock Screen companion and a Shortcuts action in custom iPhone builds: tiny face mark, processing/added feedback, and one due or upcoming reminder.

## Run the app

### Prerequisites

- Node.js 24.3 or newer is recommended by the installed React Native version. The project bundled successfully with Node 24.2.0, but npm reports an engine warning on that version.
- Expo Go or an iOS/Android simulator/device. A physical device is best for trying microphone recording and notifications; Xcode is required to compile a custom iOS development build.
- [Expo SDK 57 officially requires Xcode 26.4 or newer](https://docs.expo.dev/versions/latest/). This project includes a temporary compatibility patch for the specific ExpoModulesJSI compiler errors on Xcode 26.3; that framework compiled successfully on 26.3, but a complete signed app build on that toolchain is not yet verified.
- An OpenAI API key only if you want natural-language parsing and voice capture.
- iOS 17 or newer for the custom Cue app and its interactive Live Activity. Expo Go and Android retain the ordinary reminder UI and do not include the companion.

### Install a development build on a wired iPhone

This is the actual app binary installed on your device, not Expo Go. Connect the iPhone by USB, unlock it, tap **Trust** if asked, and enable **Developer Mode** in iPhone Settings → Privacy & Security. You also need Xcode installed and signed in with an Apple ID for development signing.

```bash
npm install
npm run ios:build:device
```

Choose the wired iPhone when Expo asks. The first build can take a few minutes because it generates the native iOS project, installs pods, signs the app for development, and installs Cue. You only need to rebuild when native dependencies or `app.json` changes.

For an existing `ios/` checkout, run `npm run ios:sync:companion` before rebuilding. This copies the tracked Swift sources into the native project, adds the extension, and preserves the app's development team. For a fresh checkout, the registered config plugin does this during prebuild. Use `ios/Cue.xcworkspace` in Xcode and ensure **CueCompanion** has an appropriate development provisioning profile as well as **Cue**. A JavaScript reload cannot install this extension.

Then start the development server through a tunnel:

```bash
npm run start:dev:tunnel
```

Open the installed **Cue** development app on the iPhone, or scan the development-build QR code it prints. This project includes both `expo-dev-client` and the local `@expo/ngrok` helper, so this command targets your installed development build and uses a tunnel rather than Expo Go.

For regular iteration after the first install, use the same `npm run start:dev:tunnel` command. TypeScript-only UI changes do not need another native build.

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
npm run start:dev:tunnel
npm run android
```

## Add an OpenAI key

Open the gear button in the top-right of Cue and paste your key into **AI settings**. It is saved with Expo Secure Store on that device.

For local development only, you can instead copy `.env.example` to `.env` and set `EXPO_PUBLIC_OPENAI_API_KEY`. Do not commit the `.env` file.

> The direct device-to-OpenAI route exists to make this hackathon prototype easy to demo. It is not safe for a public production app because a client-side key can be extracted. Put OpenAI calls behind an authenticated server-side proxy before shipping.

Without an API key, typed reminders still save normally; Cue simply keeps the user’s words as the title and does not infer a date.

## Demo flow

1. Open Cue and type: `Remind me to call Mum tomorrow at 8`.
2. Tap the up-arrow. With a key configured, Cue creates a card with a parsed time and asks for notification permission when it schedules it.
3. Tap a card to complete it; it becomes a warm red completion card and cancels its pending notification.
4. Add a key, tap the microphone, speak a reminder, then tap the mic again. Cue transcribes it and adds the resulting card automatically.
5. Long-press a card to remove it.

## Lock Screen companion and Back Tap

1. Rebuild and install the custom iPhone app. Launch it once, save your AI key in Settings, and turn on **Lock Screen companion**. Allow Live Activities and notifications when prompted.
2. In Apple's **Shortcuts** app, create a shortcut with **Ask for Input**, using input type **Text**. Add **Cue → Add Cue reminder** and pass the provided input into its **Reminder** parameter. Save it as “Add to Cue.”
3. In iPhone **Settings → Accessibility → Touch → Back Tap**, assign that shortcut to Double Tap or Triple Tap. Start testing with the phone unlocked; the input sheet and authentication behavior while locked need physical-device verification.
4. Back Tap and enter a clear sentence such as `Remind me to call Mum tomorrow at 8 PM`. The native action sends it to OpenAI, saves its title and optional timezone-aware due date into Cue's store, and schedules a local notification if permitted.

The card uses the system's default translucent Lock Screen background, allowing iOS to choose its native appearance. It does not put an opaque colored panel over that surface or assume the app-only `glassEffect` modifier works inside a widget. Actual Liquid Glass appearance depends on the OS and needs device review.

With nothing waiting, the card collapses to the small face and “cue” mark. During capture, the main text reads **Adding reminder…**; successful persistence briefly shows **Added: [task]** with its time, then restores the previous incomplete reminder. A due reminder takes priority over upcoming tasks. Errors show a short message and restore the card. The small mark changes with the state, with brief transitions rather than a continuously animated mascot. Tap the completion circle to finish the displayed task and reveal the next one. Opening Cue again also synchronizes Shortcut-created tasks into the app list.

Timing has two separate mechanisms. The OS schedules the actual notification. The Live Activity preloads the earliest upcoming task and sets its `staleDate` to that deadline; when WidgetKit marks that snapshot stale, the view can display that preloaded task as **NOW**. This is a narrow visual transition, not app execution or a general queue scheduler. Further ranking/data updates occur when Cue, its Shortcut, or a completion action runs. Exact transition timing still needs runtime verification. A backend with ActivityKit push updates is needed for arbitrary unattended changes to the same card; background refresh does not guarantee exact-time execution.

An active Live Activity lasts **at most eight hours**, and people can dismiss it. Ended content can remain on the Lock Screen for up to four additional hours. Updating the same activity does not renew that limit. Start a new session from Settings or a later Shortcut invocation after it ends. There is no automatic 24/7 renewal.

The Shortcut needs a saved AI key and network access; this implementation calls OpenAI directly from the native app, and does not include an offline AI model or backend. Ambiguous or missing times remain **No time set** rather than being invented; a parsed time in the past is rejected. Alerts denied by iOS do not prevent saving, and the acknowledgement reports when alerts are unavailable. Completing or deleting a reminder cancels its pending/delivered notification.

## Architecture and integrations

The app deliberately stays small:

- `App.tsx` coordinates UI state, recording, parsing, persistence, and card actions.
- `src/components/` contains the composer, reminder card, and settings sheet.
- `src/lib/reminderParser.ts` calls OpenAI’s Chat Completions API with a strict JSON schema and its transcription endpoint.
- `src/lib/storage.ts` uses AsyncStorage in Expo Go/Android and migrates its existing reminders once into the native store in custom iPhone builds. Native mutations are authoritative, so a stale UI snapshot cannot overwrite a Shortcut capture.
- `src/lib/companion.ts` connects the app to the native service and observes shared reminder changes. Native reminder JSON lives in the app's Application Support directory; the Live Activity only receives a small display snapshot.
- `native/companion/` contains the Swift actor, secure native key storage, ActivityKit attributes, SwiftUI widget, and App Intents. Native Shortcuts run without requiring the React Native screen to be open. Both app and Shortcut mutation paths use this service in a custom iPhone build.
- `plugins/withCueCompanion.cjs` adds the app source membership, embedded widget target, and minimum iOS version during prebuild. `scripts/syncCompanion.cjs` applies it to an existing project without regenerating it.
- `src/lib/notifications.ts` schedules notifications in Expo Go/Android; the native service uses UserNotifications in custom iPhone builds. The AI key is mirrored from Secure Store to a native Keychain item so an App Intent can use it without the JS runtime.

Libraries and services:

- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) for microphone capture.
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for local notifications.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) and AsyncStorage for on-device storage.
- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) structured output for reminder extraction and [OpenAI Audio](https://platform.openai.com/docs/api-reference/audio) transcription for voice input.
- [ActivityKit](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities), [Live Activity design guidance](https://developer.apple.com/design/human-interface-guidelines/live-activities), [WidgetKit animations](https://developer.apple.com/documentation/widgetkit/animating-data-updates-in-widgets-and-live-activities), and [LiveActivityIntent](https://developer.apple.com/documentation/appintents/liveactivityintent) for the native companion. Back Tap and text input follow Apple's [Shortcut setup](https://support.apple.com/en-ie/guide/shortcuts/apd897693606/ios) and [Ask for Input](https://support.apple.com/guide/shortcuts/use-the-ask-for-input-action-apd68b5c9161/ios) documentation.

Companion checks: `npm run test:companion` compiles/runs seven Swift selection scenarios and checks plugin idempotence, app signing preservation, source membership, extension embedding/dependency, and version inheritance. It requires Xcode command-line tools. These tests do not exercise OpenAI or physical Back Tap.

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

Simulator UI access was not approved for this chat. No rendered Liquid Glass, automatic deadline transition, background Shortcut execution, Back Tap, real OpenAI response, signed install, or physical-device behavior was verified. No credentials were used for these checks.

## Known limitations

- The prototype does not yet offer editing, recurring reminders, categories, sync, or sign-in.
- Local notification behavior depends on the device’s permission and operating-system scheduling policy.
- Voice transcription needs network access and a valid OpenAI key.
- The app uses direct API requests only for the hackathon demo; production needs a backend proxy.
- Live Activity lifetime, refresh timing, and locked-screen interactions remain controlled by iOS. No persistent daemon, automatic expiry renewal, or remote APNs update scheduler is implemented.

## Hackathon material

- [Event rules](RULES.md)
- [Agent and project workflow](AGENTS.md)
- [Development change log](CHANGELOG.md)
- [Codex usage record](AI_USAGE.md)
- [Submission checklist](SUBMISSION.md)
