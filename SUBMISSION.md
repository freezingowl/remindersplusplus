# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** Cue
- **Short description:** Cue is a voice-friendly personal reminder app that turns natural language into calm, actionable reminder cards and local notifications.
- **Code repository URL:** To be added by the participant before submission.
- **Final submitted implementation commit SHA:** Pending final participant commit.
- **Working demo URL or local demo steps:** The participant's [Worker](https://floral-frost-2cd1.ajaytcr007.workers.dev/health) is deployed and text AI verified. Follow [TESTING.md](TESTING.md) from step 3: sync native settings, install a standalone Release app and verify in-app capture before Back Tap. Fresh deployments also need steps 1–2.
- **Demo access requirements:** A configured Cloudflare Worker/D1 database with its OpenAI secret, plus the Worker URL and separate Cue access token in the app environment. Use a custom iOS 17+ build for Live Activities/Shortcuts; Expo Go supports the ordinary UI. Do not include secrets in the submission.

## Participants

Participate solo or in a team of up to 4. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| To be added | To be added | Participant to confirm before submission |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 24.3+ recommended, npm, and Expo Go or a simulator/device.
- **Install command:** `npm install`
- **Required environment variable names:** `EXPO_PUBLIC_CUE_WORKER_URL` and `EXPO_PUBLIC_CUE_CLIENT_TOKEN` in Cue; `OPENAI_API_KEY` and `CUE_CLIENT_TOKEN` as Worker secrets, with D1 binding `CUE_DB`. See `.env.example` and the Worker guide.
- **Start command:** `npm run ios:sync:companion`, then `npm run ios:build:standalone` for a wired iPhone Release install; no Metro/tunnel is needed. Use `npm run ios:simulator` for Expo Go on the simulator.
- **Demo walkthrough:** Add a natural-language typed reminder, complete it by tapping its card, then demonstrate spoken capture and the configured Back Tap Shortcut/Live Activity.
- **Checks performed and results:** Sixteen offline Worker scenarios, one actual Workers runtime/D1 test and lint passed. Live readiness/text parsing and a provider-reported usage receipt verified; the receipt showed 378 input/30 output tokens. Read-only inspection of the participant's installed iPhone confirmed three timed Back Tap saves, matching the counter increase from seven to ten. Earlier typecheck, companion/path tests and unsigned Release compilation passed. See [TESTING.md](TESTING.md).
- **Known limitations or incomplete features:** No editing, recurrence, sync, user sign-in or APNs update scheduler. The deployed backend uses a private-demo token/global limits. The latest incomplete device reminder had no notification scheduled; notification permission/scheduling and delivered alerts need checking. Rendered Live Activity transitions, locked-phone input and live voice remain unverified; iOS limits activities to eight active hours. The agent did not install the phone app or verify its signed installation process.
- **Libraries, APIs, and public datasets used:** Expo Audio, Notifications, SecureStore, AsyncStorage, and Cloudflare Workers/D1, and OpenAI Responses (GPT-6 Luna) / Audio APIs; links and usage are listed in [README.md](README.md).
- **AI usage record:** [AI_USAGE.md](AI_USAGE.md)
- **Development change log:** [CHANGELOG.md](CHANGELOG.md)

## Submission checklist

- [ ] The project implementation started from scratch at the event.
- [ ] I participated solo or with no more than 4 team members in total.
- [ ] Codex was used during development and its usage is documented.
- [ ] The code repository URL, short description, and working demo are provided.
- [ ] README setup and demo instructions match the submitted code.
- [ ] Actual checks and known limitations are documented.
- [ ] Meaningful changes are documented and committed throughout development.
- [ ] The final implementation is committed and pushed, and its SHA is recorded above.
- [ ] No credentials or private data are included in the repository or demo instructions.
- [ ] The organizers' announced submission method and timing have been followed.

Event reference: [DevDay Exchange Community: Kochi on Luma](https://luma.com/z10nz8gp). The event wraps up by **10:00 AM IST on 11 October 2026**.
