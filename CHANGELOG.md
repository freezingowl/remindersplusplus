# Change log

Record each meaningful project change during the event, newest first. Update this file in the same commit as the change. Use a real timestamp with timezone, for example `YYYY-MM-DDTHH:MM:SS+05:30`.

## Event build log

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
