# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

## 2026-10-11T01:31:48+05:30 — Add the minimal native Lock Screen companion

- Changed: Added tracked Swift ActivityKit/WidgetKit/App Intents sources, a React Native bridge, a shared native reminder store, Keychain access for Shortcuts, and an idempotent Expo extension plugin. Added a settings session switch and Back Tap instructions, migrated existing reminders once, and connected in-app/Shortcut completion and deletion to the same store. Added native-project synchronization and selection/prebuild tests.
- Why: Match the supplied simple Lock Screen references: a tiny face mark, prominent single reminder, brief processing/added acknowledgement, and restoration of the due/upcoming card after capture. Use the OS's default translucent surface and collapse the empty card.
- Validation: Typecheck/lint, two companion checks including seven compiled Swift selection scenarios, and four existing path regression checks passed. Unsigned Debug iPhone and Simulator builds passed; verified widget embedding, Live Activities support, matching bundle versions, and extracted App Intents metadata. Corrected missing extension dependency initialization, version mismatch, one icon name, and a lint issue during verification.
- Limitations: Simulator UI control was not approved; rendered glass, exact stale-date transition, real AI calls, background Shortcuts, Back Tap, signed install, and physical-device behavior remain unverified. iOS limits sessions to eight active hours; no automatic renewal or APNs backend exists. Only the earliest future candidate is preloaded for the due display; local notifications deliver actual alerts. Custom iPhone builds require iOS 17+. Existing native signing and unrelated untracked files were preserved.

## 2026-10-11T00:28:26+05:30 — Fix iOS build scripts for space-containing project paths

- Changed: Added `patches/expo-constants+57.0.21.patch`, based on Expo PR #48747, to quote the Constants script invocation and `PROJECT_DIR` lookup. Refreshed the existing Pods project. Added the idempotent `plugins/withIosBuildPathQuotes.cjs` config plugin in `app.json` and quoted the existing Cue RN bundle-phase invocation. Added `tests/ios-build-paths.test.cjs`, the `test:ios:paths` command, and troubleshooting/validation documentation.
- Why: Nested shell parsing split the `Codex hackathon` path at its space, causing the reported Constants error. The complete build check then exposed the same quoting bug in the RN bundle phase; both are now corrected without moving the workspace or resetting the native project.
- Validation: All four path/plugin regression tests, postinstall, typecheck, lint, shell/Ruby syntax, Expo prebuild config validation, and reverse Constants patch applicability passed. Pods refreshed successfully. The complete Debug iPhone app compiled and linked with Xcode 26.3 and `CODE_SIGNING_ALLOWED=NO`; verified the resulting arm64 executable and embedded Cue Constants manifest.
- Limitations: Code signing was disabled only for verification, not in project configuration. Signed installation, runtime behavior, and the ngrok tunnel still need testing. Dependency warnings remain non-fatal. The participant's untracked native project and signing settings were preserved; its only direct app-project edit was the quoted RN script command. Permanent tracked fixes are the dependency patch and config plugin.

## 2026-10-11T00:16:11+05:30 — Backport ExpoModulesJSI Swift 6.2 compiler fix

- Changed: Added `patch-package` and a fail-on-error `postinstall` hook to the package files; saved `patches/expo-modules-jsi+57.1.1.patch`, adapted from Expo's merged PR #51040, with retained static scheduler factories and an immutable sendable wrapper for synchronous host callbacks. Documented the workaround and SDK 57's official Xcode 26.4+ requirement in `README.md`.
- Why: The installed Xcode 26.3/Swift 6.2.4 rejects retained annotations on the RuntimeScheduler constructors; the installed 57.1.1 package also contains the related pointer-capture compiler incompatibility. The fix is not yet published in the SDK 57 package range checked on npm.
- Validation: `npm run typecheck`, `npm run lint`, `npm run postinstall`, and reverse patch applicability passed. The package's `build-xcframework.sh`, using this project's Pods and `PLATFORM_NAME=iphoneos`, successfully compiled the patched arm64 iOS framework with Xcode 26.3. Remaining output contained non-fatal JSI umbrella-header/linker warnings.
- Limitations: Only the affected framework was compiled; a full signed app build, USB installation, runtime behavior, and ngrok tunnel remain unverified. SDK 57 officially requires Xcode 26.4+. Existing untracked `ios/` files and signing settings were preserved. Revisit this temporary patch after an SDK-compatible upstream release.

## 2026-10-10T23:30:56+05:30 — Add wired development-build and tunnel workflow

- Changed: Added `expo-dev-client`, the project-local `@expo/ngrok` helper, device bundle identifiers, a development scheme, and scripts for building a wired iPhone development build and starting it through an explicit tunnel. Reworked the setup documentation around that workflow.
- Why: Enable installation of Cue as a native development build on a USB-connected iPhone and make the requested tunnel command target that app rather than Expo Go.
- Validation: Checked current Expo development-build and tunneling guidance; `npm run typecheck`, `npm run lint`, Expo config validation, and the new command help passed. A live public tunnel remains to be tested from the developer's network.
- Limitations: The first iOS install still requires Xcode, an unlocked/trusted iPhone in Developer Mode, and development signing. Tunnel availability also depends on ngrok and network egress.

## 2026-10-10T23:18:46+05:30 — Add reliable simulator and device launch scripts

- Changed: Added explicit localhost simulator scripts and LAN physical-device scripts in `package.json`; added `.expo/` to `.gitignore`; documented the correct simulator, device, and optional tunnel commands in `README.md`.
- Why: The missing `ios:device` script prevented the requested command from running, and a simulator should not depend on an ngrok tunnel.
- Validation: Verified the Expo CLI supports the selected `--localhost` and `--lan` host modes; checked the new scripts with their `--help` passthrough after editing.
- Limitations: A physical iPhone still needs Expo Go and access to the Mac on the same local network. A simulator needs Xcode and an installed iOS Simulator runtime.

## 2026-10-10T23:10:43+05:30 — Build Cue Expo reminder app

- Changed: Created the Expo/TypeScript project and the Cue card UI in `App.tsx`, `src/components/`, and `src/lib/`; added microphone capture, OpenAI parsing/transcription, local storage, secure key storage, and local notification scheduling. Added the Expo configuration, package setup, sanitized environment example, and runnable project documentation.
- Why: Deliver a simple, voice-capable reminder app whose card layout and composer reflect the supplied visual reference.
- Validation: `npm run typecheck` passed; `npm run lint` passed with no warnings or errors; `npx expo export --platform ios --output-dir /private/tmp/cue-ios-export` passed and generated an iOS JavaScript bundle.
- Limitations: The direct OpenAI key flow is for local hackathon development only; a production build needs a backend proxy. Device-level microphone and notification behavior still need physical-device confirmation.

## Template setup — 10 October 2026

- Changed: Added the event README, rules, agent guide, change log, AI usage record, submission checklist, Git ignore rules, and pull request checklist.
- Why: Give participants a consistent starting point for event rules, basic coding patterns, documented changes, and regular commits.
- Validation: Checked local Markdown links, event detail consistency, required documents, and diff whitespace before publishing.
- Limitations: Documentation scaffolding only; no participant project, application, or working demo is included. GitHub publication and template status are verified separately after creation.
