# Cue cloud AI

Cue's app and native iOS Shortcut call this Worker. Only the Worker calls OpenAI; reminders and notification schedules remain on the phone. This deployment is intended for a private hackathon demo.

The participant's existing [floral-frost-2cd1 deployment](https://floral-frost-2cd1.ajaytcr007.workers.dev/health) is configured and verified as of 11 October 2026, 04:58 IST. `CUE_DB` is a **D1 database binding**, pointing to the APAC database `cue-ai-limits`; it is not a string environment variable. The existing OpenAI secret is retained and the Cue token matches the ignored local `.env`. Readiness and four live text cases passed, including the exact sushi prompt in 2.524 seconds. Phone installation and testing are the next steps in [TESTING.md](../TESTING.md).

## Deploy by copy/paste in Cloudflare

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

The first command checks authentication and reads the D1 quota table without consuming AI quota. The second makes one paid request with **“Remind me to make sushi in 2 minutes”**, validates that its due time is about two minutes ahead, and reports latency. It creates no reminder on the phone. Resolve any failure before continuing.

For a standalone iPhone test:

```bash
npm run ios:sync:companion
npm run ios:build:standalone
```

Native sync/prebuild embeds the Worker origin and separate Cue access token in the app's Info.plist. Shortcuts can read them without JavaScript having launched first; the OpenAI key is never embedded. Re-run native sync and rebuild/install whenever either value changes. Opening an older binary or reloading JavaScript cannot add these native settings.

The Release command bundles the React Native screen and needs no Metro server or tunnel. Open the installed app to check its cloud connection and allow notifications before your first Shortcut test. A Debug development build still needs Metro for its React Native screen. Previously saved personal OpenAI keys are deleted during setup and never used by this code.

## Add the Back Tap Shortcut

On the iPhone:

1. In **Shortcuts**, create a shortcut named **Add to Cue**.
2. Add **Ask for Input**, using **Text**. Use a prompt such as “What should Cue remember?”
3. Add **Cue → Add Cue reminder**. Set **Reminder** to the **Provided Input** from the first action.
4. Run it from Shortcuts once while unlocked. Then select it in **Settings → Accessibility → Touch → Back Tap → Double Tap** or **Triple Tap**.

No HTTP action or secret is needed inside the Shortcut. The native Cue action calls the configured Worker, saves the reminder, schedules a local alert when permitted, shows processing/saved feedback in its Live Activity, and restores the due/upcoming reminder afterwards. Allow Cue notifications and Live Activities. The first in-app capture starts a session automatically; an explicit off setting in Cue is respected for in-app captures. The Shortcut explicitly starts/enables its companion session. Input/authentication while locked is controlled by iOS and requires device testing. An activity still lasts at most eight active hours; this backend does not add APNs scheduling or perpetual renewal.

## Model and limits

Text parsing uses [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) through the Responses API with `reasoning.effort: "none"`, low verbosity, strict structured output, and a 512-token output cap. The documented standard text price when selected was $0.10 per million input tokens and $0.50 per million output tokens. Four successful live text samples took 1.579–2.615 seconds; no instant-response guarantee is made. Voice uses [gpt-4o-mini-transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe), then the same text parser; live transcription remains untested.

The internal AI schema extracts an elapsed duration as a nullable `delay` object (amount plus seconds/minutes/hours). The Worker calculates its deadline from the server timestamp at admission, independent of model timezone arithmetic or response latency. Explicit calendar times instead use `dueAt`, with the device's local clock/time zone supplied in the prompt. Conflicting time fields, invalid durations, delays outside one second–366 days, and deadlines already passed by completion are rejected. The app/Shortcut response contract remains `{reminder:{title,note,dueAt}}`.

| Endpoint | Global requests/minute | Global requests/UTC day |
| --- | ---: | ---: |
| `POST /v1/reminders/parse` | 10 | 500 |
| `POST /v1/audio/transcribe` | 2 | 50 |

These are **global limits across everyone using this Worker**, not per-device limits. Edit `LIMITS` near the top of `worker.mjs` to change them. Fixed minute windows can allow a burst across a minute boundary. The daily window resets at midnight UTC (05:30 IST). One atomic D1 SQL write checks both windows before allowing a paid request; concurrency, new isolates and deployments do not reset the counters. If D1 or the schema is unavailable, AI calls are blocked. Quotas are consumed before contacting OpenAI, including failed/timeout upstream attempts; requests rejected by validation/authentication/rate limits consume no paid-call quota. Do not drop/reset the table on deployments.

There are also input caps (2,000 characters, 16 KB JSON, 2 MB audio), a 20-second upstream timeout, a 25-second app timeout, and no automatic paid retries. Cue stops in-app voice recording around 60 seconds. Upload size is enforced on the server, but an audio byte cap does not establish audio duration for arbitrary clients. These are request ceilings, not a guaranteed dollar spending cap. OpenAI usage and billing remain separate.

No reminder text, audio, raw IP addresses, API keys or tokens are stored in D1 or logged by this code. The Worker sends text/audio to OpenAI for processing. Responses requests set `store: false`; that does not override OpenAI's account-level data-retention policies.

## Test the deployment

- Start with the readiness check and sushi parser test above, then follow [TESTING.md](../TESTING.md) for installation, permission checks, in-app capture and Back Tap in that order. **Check cloud connection** in Cue Settings uses authenticated `GET /v1/status`; it checks configuration/token/schema, not OpenAI key validity or model access.
- In Cue, submit **“Remind me to drink water in two minutes.”** Check the card's time and allow notifications. Lock the phone and wait for the local notification.
- Run **Add to Cue** while unlocked with another clear task/time. Check **Adding reminder… → Added… → original due/upcoming task** on the Live Activity. Reopen Cue and check the new reminder is in the list.
- Try one microphone reminder. Check transcription and the resulting date/time. This uses one voice request and one text request.
- Check ambiguous input such as **“Remind me about the meeting today.”** It should remain **No time set** rather than inventing an hour. AI extraction is probabilistic: review parsed times, including AM/PM and timezone boundaries.
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

The fifteen Worker tests use Node 24's experimental built-in SQLite to execute the actual quota SQL; OpenAI HTTP responses are mocked. They verify simultaneous requests across separate handler instances, minute/daily resets, fail-closed storage, validation, bounded uploads, output/date/refusal checks, elapsed deadlines across timezone/date boundaries, sanitized errors, timeouts, audio routing, explicit CORS, connection diagnostics and the preflight stopping before paid calls when not ready. A separate Miniflare test runs the actual Workers request implementation and D1 against fake credentials/mocked outbound responses, checking successful capture and rejection of redirects without credential forwarding. Its temporary local runtime is disposed after the test. Neither offline suite substitutes for the live parser/device checks.

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
