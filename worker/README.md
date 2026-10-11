# Cue cloud AI

Cue's app and native iOS Shortcut call this Worker. Only the Worker calls OpenAI; the full reminder store remains on the phone. Optional [ActivityKit push scheduling](APNS.md) stores a compact, bounded session queue in Cloudflare Durable Objects so the same card can change while Cue is suspended. This deployment is intended for a private hackathon demo.

The participant's existing [floral-frost-2cd1 deployment](https://floral-frost-2cd1.ajaytcr007.workers.dev/health) has verified text AI. `CUE_DB` is a **D1 database binding** for APAC database `cue-ai-limits`, not a string variable. The OpenAI secret and matching Cue token are preserved. Readiness and four live text cases passed, including sushi in 2.524 seconds; a read-only iPhone audit confirmed three Back Tap saves. The newer custom iPhone flow is Live Activity only. Its unattended queue updates need Apple keys and a rebuilt app; follow [APNS.md](APNS.md) and [TESTING.md](../TESTING.md).

## Deploy by copy/paste in Cloudflare

For the requested unattended Live Activity changes, also configure the Durable Object and Apple secrets described in [APNS.md](APNS.md). Wrangler is the recommended deployment path for that binding/migration. Text AI alone still uses the settings below.

1. In **Workers & Pages**, create a Worker named `cue-ai`. Open **Edit code**, replace the starter JavaScript with **all of [worker.mjs](worker.mjs)**, and deploy. This is a standalone ES module: no build, imports, or npm dependencies are required.
2. Create a **D1 SQL database** named `cue-ai-limits`. Open its **Console** and execute [schema.sql](schema.sql). The script creates the table without deleting existing counters.
3. On the Worker, open **Bindings → Add binding → D1 database**. Set **Variable name** to exactly `CUE_DB` and select `cue-ai-limits`.
4. Open **Settings → Variables and Secrets → Add**, choosing **Secret** for each:
   - `OPENAI_API_KEY`: your OpenAI API key. Keep it here only; do not paste it into JavaScript or the app.
   - `CUE_CLIENT_TOKEN`: a separate random access token, 32–256 characters using letters, digits, `_` or `-`. Generate one locally with `openssl rand -hex 32`. Keep the generated value for the app configuration below. This is an app access token, not your OpenAI key.
5. Deploy the saved code/binding/secrets. Keep the Worker's HTTPS URL, for example `https://cue-ai.YOUR-SUBDOMAIN.workers.dev`.
6. Visit `https://YOUR-WORKER.workers.dev/health`. Expect `{"ok":true}`. On failure, the updated Worker names missing/invalid bindings or secrets without returning their values. This checks presence only; the authenticated check below verifies the token and D1 table without calling OpenAI.

Cloudflare's official [D1 setup](https://developers.cloudflare.com/d1/get-started/) and [Secrets instructions](https://developers.cloudflare.com/workers/configuration/secrets/) cover these dashboard steps.

## Point Cue at the Worker

In the app project, copy `.env.example` to `.env` if it does not exist. Preserve any unrelated local settings. Set:

```dotenv
EXPO_PUBLIC_CUE_WORKER_URL=https://cue-ai.YOUR-SUBDOMAIN.workers.dev
EXPO_PUBLIC_CUE_CLIENT_TOKEN=THE_SAME_RANDOM_CUE_CLIENT_TOKEN
```

Use only the HTTPS origin: no path, query, or fragment. Remove the obsolete `EXPO_PUBLIC_OPENAI_API_KEY` setting. Never put `OPENAI_API_KEY` in the app's environment. Both `EXPO_PUBLIC_` values above are included in the app bundle, so the access token can be extracted by someone with the app. It blocks anonymous use of the endpoint for this private demo; it does **not** establish a user's identity. Public distribution needs real user authentication/device verification and per-user quotas. The global quotas below still constrain paid calls if this demo token is copied.

Follow [the ordered testing guide](../TESTING.md) before testing on the phone. From the app directory, check the deployment first:

```bash
npm run cloud:check
npm run cloud:check -- --parse
```

The first command checks authentication and reads the D1 quota table without consuming AI quota. The second makes one paid request with **“Remind me to make sushi in 2 minutes”**, validates that its due time is about two minutes ahead, and reports latency plus an `ai` usage receipt. The receipt returns only allowlisted provider metadata: model, request/response IDs, organization identifier and token counts. Missing metadata is `null`; neither counts nor success are fabricated. One live receipt reported GPT-6 Luna with 378 input/30 output tokens (408 total) in 2.815 seconds. Receipts are returned only to authenticated callers and are not retained in D1 or logs. The command creates no reminder on the phone. Resolve any failure before continuing.

Read billing in the [OpenAI Usage dashboard](https://platform.openai.com/usage) for the account/project owning the Worker's `OPENAI_API_KEY`. Select a date range covering 10–11 October for this demo: the participant's three Back Tap saves were at 23:44–23:48 UTC on 10 October. A rough standard input/output-rate estimate for the measured 408-token request is $0.0000528, not an invoice; account credits, service tiers and other billing adjustments may differ. The original three calls' token counts were not stored, so a quota counter cannot reconstruct their exact spend. Do not change the model or make repeated calls just to produce a visible spend total.

For a standalone iPhone test:

```bash
npm run ios:sync:companion
npm run ios:build:standalone
```

Native sync/prebuild embeds the Worker origin and separate Cue access token in the app's Info.plist. Shortcuts can read them without JavaScript having launched first; the OpenAI key is never embedded. Re-run native sync and rebuild/install whenever either value changes. Opening an older binary or reloading JavaScript cannot add these native settings.

The Release command bundles the React Native screen and needs no Metro server or tunnel. Open the installed app to check its cloud connection, allow Live Activities, and connect Calendar before your first Calendar Shortcut test. A Debug development build still needs Metro for its React Native screen. Previously saved personal OpenAI keys are deleted during setup and never used by this code.

## Add the Back Tap Shortcut

Custom iPhone builds now use authenticated **POST /v1/assistant** for reminders, event creation/moving, Calendar questions and short answers. The legacy `/v1/reminders/parse` endpoint remains compatible with existing installed apps and Expo Go/Android. Both routes share the existing atomic `parse` quota (10/minute, 500/UTC day). The model returns a validated action; EventKit executes Calendar operations on the phone. No Calendar contents or query results are sent to OpenAI. A brief-answer hold prevents scheduled pushes from overwriting the response before it restores. Run `npm run cloud:check:assistant` for six synthetic routing tests; these consume six AI requests and perform no phone/Calendar writes.

For the new action use **Ask for Input** or **Dictate Text → Cue → Ask Cue**, passing the input into **Request**, and connect Calendar in Cue Settings before assigning the Shortcut to Back Tap. Existing **Add Cue reminder** actions route through the same assistant in the new native build.

On the iPhone:

1. In **Shortcuts**, create a shortcut named **Add to Cue**.
2. Add **Ask for Input**, using **Text**. Use a prompt such as “What should Cue remember?”
3. Add **Cue → Add Cue reminder**. Set **Reminder** to the **Provided Input** from the first action.
4. Run it from Shortcuts once while unlocked. Then select it in **Settings → Accessibility → Touch → Back Tap → Double Tap** or **Triple Tap**.

No HTTP action or secret is needed inside the Shortcut. The native Cue action calls the configured Worker, executes the request, shows processing/answer/saved feedback in its Live Activity, and restores the next event or reminder. The custom iPhone flow schedules no local alerts. Allow Live Activities. The first in-app capture starts a session automatically; an explicit off setting in Cue is respected for in-app captures. The Shortcut explicitly starts/enables its companion session. Input/authentication while locked is controlled by iOS and requires device testing. An activity still lasts at most eight active hours; unattended updates need [APNS.md](APNS.md), and there is no perpetual renewal.

## Model and limits

The compatible legacy reminder parser uses [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) through the Responses API with `reasoning.effort: "none"`, low verbosity, strict structured output, and a 512-token output cap. Ask Cue uses the same model with `reasoning.effort: "low"`, strict output and a 2,048-token cap so it can apply the scheduling defaults below. GPT-6 Luna supports both efforts; OpenAI recommends low effort for extraction, routing and classification. The documented standard text price when selected was $0.10 per million input tokens and $0.50 per million output tokens. Four successful live text samples took 1.579–2.615 seconds; no instant-response guarantee is made. Voice uses [gpt-4o-mini-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe), then the same text parser; live transcription remains untested.

Ask Cue never returns a clarification question for a recognizable supported request. A bare 1–7 o’clock time means PM, 8–11 AM, and 12 noon; an omitted date becomes the next local occurrence; “schedule a meeting” becomes a one-hour Meeting at the next whole local hour. Event titles default to “Calendar event” when missing. An untimed reminder remains untimed. Explicit date/time/duration always wins, and a clearly past explicit time is rejected rather than silently changed. When moving multiple matching events, the phone selects an exact title first and otherwise the next occurrence, then reports what moved. Unsupported or failed actions state that nothing changed rather than ask a question.

The internal AI schema extracts an elapsed duration as a nullable `delay` object (amount plus seconds/minutes/hours). The Worker calculates its deadline from the server timestamp at admission, independent of model timezone arithmetic or response latency. Explicit calendar times instead use `dueAt`, with the device's local clock/time zone supplied in the prompt. Conflicting time fields, invalid durations, delays outside one second–366 days, and deadlines already passed by completion are rejected. The response retains `{reminder:{title,note,dueAt}}` and adds an `ai` metadata object; existing app/Shortcut decoders ignore the extra field and need no rebuild.

| Endpoint | Global requests/minute | Global requests/UTC day |
| --- | ---: | ---: |
| `POST /v1/reminders/parse` | 10 | 500 |
| `POST /v1/audio/transcribe` | 2 | 50 |

These are **global limits across everyone using this Worker**, not per-device limits. Edit `LIMITS` near the top of `worker.mjs` to change them. Fixed minute windows can allow a burst across a minute boundary. The daily window resets at midnight UTC (05:30 IST). One atomic D1 SQL write checks both windows before allowing a paid request; concurrency, new isolates and deployments do not reset the counters. If D1 or the schema is unavailable, AI calls are blocked. Quotas are consumed before contacting OpenAI, including failed/timeout upstream attempts; requests rejected by validation/authentication/rate limits consume no paid-call quota. Do not drop/reset the table on deployments.

There are also input caps (2,000 characters, 16 KB JSON, 2 MB audio), a 20-second upstream timeout, a 25-second app timeout, and no automatic paid retries. Cue stops in-app voice recording around 60 seconds. Upload size is enforced on the server, but an audio byte cap does not establish audio duration for arbitrary clients. These are request ceilings, not a guaranteed dollar spending cap. OpenAI usage and billing remain separate.

AI requests do not store text/audio in D1 or logs. The optional APNs scheduler separately retains open titles/IDs/times and the activity push token in its private Durable Object until session expiry; [APNS.md](APNS.md) details bounds, cleanup and ownership. D1 stores quota counters only. OpenAI Responses uses `store: false`, subject to account-level data-retention policies.

## Test the deployment

- Start with the readiness check and sushi parser test above, then follow [TESTING.md](../TESTING.md) for installation, permission checks, in-app capture and Back Tap in that order. **Check cloud connection** in Cue Settings uses authenticated `GET /v1/status`; it checks configuration/token/schema, not OpenAI key validity or model access.
- In Cue, submit **“Remind me to drink water in two minutes.”** Check the time. For custom iPhone builds, follow [APNS.md](APNS.md) to check the same Live Activity at the deadline; no local alert is scheduled. Expo Go/Android retain local notifications.
- Run **Ask Cue** while unlocked with another clear task/time. Check **Thinking… → Added… → next event/reminder** on the Live Activity. Reopen Cue and check the new reminder is in the list.
- Try one microphone reminder. Check transcription and the resulting date/time. This uses one voice request and one text request.
- Check **“Meeting at 6”**: it should create a one-hour Meeting at the next local 6 PM, without a clarification. Check **“Schedule a meeting”**: it should create a one-hour Meeting at the next whole local hour. Check **“Remind me about the meeting”**: it should save an untimed reminder without a clarification. Review the resulting time, including AM/PM and timezone boundaries.
- Disconnect the network and try adding a reminder. Cue must show an error and retain your typed input; it must not fabricate a successful untimed reminder.
- After ten admitted text requests in a single minute, the next should return HTTP 429 with `Retry-After`. Failed upstream attempts also count. Testing this against the deployed Worker incurs real API usage; the offline tests below verify limits without paid calls.

Run the repository's offline tests:

```bash
npm run test:worker
npm run test:worker:runtime
npm run typecheck
npm run lint
npm run test:companion
npm run test:ios:paths
```

The sixteen Worker tests use Node 24's experimental built-in SQLite to execute the actual quota SQL; OpenAI HTTP responses are mocked. They verify simultaneous requests across separate handler instances, minute/daily resets, fail-closed storage, validation, bounded uploads, output/date/refusal checks, elapsed deadlines across timezone/date boundaries, allowlisted usage receipts without raw headers/credentials, sanitized errors, timeouts, audio routing, explicit CORS, connection diagnostics and the preflight stopping before paid calls when not ready. A separate Miniflare test runs the actual Workers request implementation and D1 against fake credentials/mocked outbound responses, checking successful capture and rejection of redirects without credential forwarding. Its temporary local runtime is disposed after the test. Neither offline suite substitutes for the live parser/device checks.

Troubleshooting: `not_configured` means a binding/secret is absent or the Cue token is malformed; `unauthorized` means app/Worker Cue tokens differ; `quota_unavailable` usually means the D1 binding or schema needs fixing; `ai_configuration` means OpenAI rejected the key or model access; `rate_limit`/`daily_limit` requires waiting until the applicable window resets. `/health` can return true even when the table or upstream key is invalid.

Browser requests are denied by default. Only for web testing, set the Worker plaintext variable `ALLOWED_ORIGIN` to the exact browser origin (for example `http://localhost:8081`). Wildcards and multiple origins are not accepted; native iPhone/Android clients need no CORS configuration.

## Optional Wrangler deployment

The dashboard steps above require no CLI. This checkout's [wrangler.jsonc](wrangler.jsonc) already targets the participant's existing Worker/account and created D1 database. From the app root, future source deployments use the installed Wrangler:

```bash
npx wrangler deploy --config worker/wrangler.jsonc
```

For a different account/deployment, replace `name`, `account_id` and the D1 `database_id` with your own identifiers; create the database first. Keep `compatibility_date` at a supported UTC date rather than a future local date. Then run from `worker/`:

```bash
npx wrangler d1 execute cue-ai-limits --remote --file=schema.sql
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put CUE_CLIENT_TOKEN
npx wrangler deploy
```

Secrets are entered into Wrangler's prompts. Never place their values in `wrangler.jsonc` or commit `.dev.vars`.
