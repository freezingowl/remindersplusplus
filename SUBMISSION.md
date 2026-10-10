# Project submission

Complete this file during the hackathon and use it to prepare your submission through the method announced by the organizers. Do not submit your project to the template repository.

## Project

- **Project name:** Cue
- **Short description:** Cue is a voice-friendly personal reminder app that turns natural language into calm, actionable reminder cards and local notifications.
- **Code repository URL:** To be added by the participant before submission.
- **Final submitted implementation commit SHA:** Pending final participant commit.
- **Working demo URL or local demo steps:** Run `npm install`, `npm run ios:build:device`, then `npm run start:dev:tunnel`; see the Demo flow in [README.md](README.md).
- **Demo access requirements:** Expo Go or a simulator/device. A valid OpenAI API key is required only for AI parsing and voice transcription; do not include a key in the submission.

## Participants

Participate solo or in a team of up to 4. Remove unused rows.

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| To be added | To be added | Participant to confirm before submission |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 24.3+ recommended, npm, and Expo Go or a simulator/device.
- **Install command:** `npm install`
- **Required environment variable names:** None for typed reminders. `EXPO_PUBLIC_OPENAI_API_KEY` is an optional development-only fallback; use `.env.example` without committing a real key.
- **Start command:** `npm run ios:build:device` for the first wired iPhone development-build install, then `npm run start:dev:tunnel` for subsequent sessions. Use `npm run ios:simulator` for Expo Go on the simulator.
- **Demo walkthrough:** Add a natural-language typed reminder, complete it by tapping its card, then configure an OpenAI key and demonstrate spoken capture with the microphone.
- **Checks performed and results:** Typecheck, lint, and iOS bundle export passed; exact commands are in [README.md](README.md).
- **Known limitations or incomplete features:** No editing, recurrence, sync, or production backend proxy yet. Physical-device microphone and notification testing remains for the participant.
- **Libraries, APIs, and public datasets used:** Expo Audio, Notifications, SecureStore, AsyncStorage, and OpenAI Chat Completions / Audio APIs; links and usage are listed in [README.md](README.md).
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
