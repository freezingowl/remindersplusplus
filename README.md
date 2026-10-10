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

## Run the app

### Prerequisites

- Node.js 24.3 or newer is recommended by the installed React Native version. The project bundled successfully with Node 24.2.0, but npm reports an engine warning on that version.
- Expo Go or an iOS/Android simulator/device. A physical device is best for trying microphone recording and notifications; Xcode is required to compile a custom iOS development build.
- An OpenAI API key only if you want natural-language parsing and voice capture.

### Install a development build on a wired iPhone

This is the actual app binary installed on your device, not Expo Go. Connect the iPhone by USB, unlock it, tap **Trust** if asked, and enable **Developer Mode** in iPhone Settings → Privacy & Security. You also need Xcode installed and signed in with an Apple ID for development signing.

```bash
npm install
npm run ios:build:device
```

Choose the wired iPhone when Expo asks. The first build can take a few minutes because it generates the native iOS project, installs pods, signs the app for development, and installs Cue. You only need to rebuild when native dependencies or `app.json` changes.

Then start the development server through a tunnel:

```bash
npm run start:dev:tunnel
```

Open the installed **Cue** development app on the iPhone, or scan the development-build QR code it prints. This project includes both `expo-dev-client` and the local `@expo/ngrok` helper, so this command targets your installed development build and uses a tunnel rather than Expo Go.

For regular iteration after the first install, use the same `npm run start:dev:tunnel` command. TypeScript-only UI changes do not need another native build.

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

## Architecture and integrations

The app deliberately stays small:

- `App.tsx` coordinates UI state, recording, parsing, persistence, and card actions.
- `src/components/` contains the composer, reminder card, and settings sheet.
- `src/lib/reminderParser.ts` calls OpenAI’s Chat Completions API with a strict JSON schema and its transcription endpoint.
- `src/lib/storage.ts` persists reminders with AsyncStorage and keys with Secure Store.
- `src/lib/notifications.ts` owns local notification setup and scheduling.

Libraries and services:

- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) for microphone capture.
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) for local notifications.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) and AsyncStorage for on-device storage.
- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) structured output for reminder extraction and [OpenAI Audio](https://platform.openai.com/docs/api-reference/audio) transcription for voice input.

## Validation performed

On 10 October 2026:

- `npm run typecheck` passed.
- `npm run lint` passed with no warnings or errors.
- `npx expo export --platform ios --output-dir /private/tmp/cue-ios-export` passed and produced an iOS JavaScript bundle.

## Known limitations

- The prototype does not yet offer editing, recurring reminders, categories, sync, or sign-in.
- Local notification behavior depends on the device’s permission and operating-system scheduling policy.
- Voice transcription needs network access and a valid OpenAI key.
- The app uses direct API requests only for the hackathon demo; production needs a backend proxy.

## Hackathon material

- [Event rules](RULES.md)
- [Agent and project workflow](AGENTS.md)
- [Development change log](CHANGELOG.md)
- [Codex usage record](AI_USAGE.md)
- [Submission checklist](SUBMISSION.md)
