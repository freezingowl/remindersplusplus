# AI usage record

Use Codex during the hackathon and briefly document its actual contribution here. Add a row after each meaningful task or milestone. Keep summaries concise and omit secrets, private data, and full chat transcripts.

## Event build log

| Date and time with timezone | Tool / model, if known | Task | Assistance and affected files | Human review / corrections | Validation and result |
| --- | --- | --- | --- | --- | --- |
| 2026-10-10T23:30:56+05:30 | Codex | Set up a wired iPhone development build and ngrok tunnel workflow | Installed Expo dev client and local ngrok support; added native app identifiers, custom-development commands, and exact USB/tunnel instructions. Affected package files, `app.json`, and setup documentation. | Pending participant review; no participant corrections recorded yet. | Command help, Expo config, typecheck, and lint passed. The native install needs the connected iPhone; a live public tunnel remains to be tested from the developer's network. |
| 2026-10-10T23:18:46+05:30 | Codex | Repair Expo launch commands after simulator/device startup errors | Added explicit local simulator and LAN device scripts, ignored Expo local state, and clarified launch instructions in `package.json`, `.gitignore`, and `README.md`. | Pending participant review; no participant corrections recorded yet. | Expo CLI help confirmed the chosen host options; script passthrough and typecheck/lint run after the changes. |
| 2026-10-10T23:10:43+05:30 | Codex | Build the Cue Expo reminder app from the supplied screenshot and requirements | Created the Expo app, card UI, natural-language composer, microphone-to-transcription flow, OpenAI integration, local reminders/notifications, secure key storage, setup files, and documentation. Affected `App.tsx`, `src/`, app configuration, package files, and project docs. | Pending participant review; no participant corrections recorded yet. | `npm run typecheck`, `npm run lint`, and iOS Expo export all passed. |

## Template preparation

On 10 October 2026, Codex prepared this documentation template from the organizer's supplied rules and checked the linked Luma page for the event name and dates. This covered `README.md`, `RULES.md`, `AGENTS.md`, `CHANGELOG.md`, `AI_USAGE.md`, `SUBMISSION.md`, `.gitignore`, and the pull request checklist. Agent validation covered local links, event consistency, required documents, and diff whitespace; organizer review is pending.

This preparation is separate from participant project implementation and participant AI usage during the event.
