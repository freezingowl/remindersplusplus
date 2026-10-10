# Test Cue from cloud setup to Back Tap

The screenshot's **“Cloud AI isn’t configured”** error occurred in the native Shortcut before any AI request. The new build embeds the Cue Worker origin/access token, so the Shortcut no longer relies on JavaScript opening once to save them. An older installed binary does not gain this fix from a JavaScript reload: rebuild and install it.

There is a second blocker: the last live `/health` check returned HTTP 503 with `{"ok":false}`. Finish the server setup below before testing reminders. That response does not identify which setting is missing in the older deployed Worker.

## 1. Finish the Worker

- Replace the deployed JavaScript with the current [worker/worker.mjs](worker/worker.mjs) and deploy it. This version adds diagnostics; the AI model and quota limits remain the same.
- Create/select the D1 database, execute [worker/schema.sql](worker/schema.sql) in its Console, and bind it to the Worker with the exact name **CUE_DB**.
- Add **OPENAI_API_KEY** as a Cloudflare Secret using your OpenAI key.
- Add **CUE_CLIENT_TOKEN** as a Cloudflare Secret. Its value must exactly match **EXPO_PUBLIC_CUE_CLIENT_TOKEN** from the local `.env` in this app folder. Do not paste the OpenAI key into this field. The token has already been generated locally; preserve it rather than generating a different one.
- Deploy the saved bindings/secrets. Open `https://floral-frost-2cd1.ajaytcr007.workers.dev/health`. Expect `{"ok":true}`. The updated Worker lists missing/invalid setting names when not ready; it never returns secret values.

## 2. Verify the backend before using the phone

From the app directory:

```bash
npm run cloud:check
```

Expect `"connected": true`. This checks the Cue access token and actual D1 schema without an OpenAI call or quota consumption. It does not prove the OpenAI key/model works. If it fails, fix the reported server setting before continuing.

Then run the user's exact sentence once through OpenAI:

```bash
npm run cloud:check -- --parse
```

This sends **“Remind me to make sushi in 2 minutes”** once, only after the readiness check passes. Expect a title such as **Make sushi** and `dueAt` about two minutes ahead. It reports latency. This incurs one text API request but creates no reminder/notification on the phone. An error here means the phone cannot successfully create this reminder either; address that error first.

## 3. Install a standalone Cue app

Check that local `.env` contains the Worker origin and matching Cue token, then run:

```bash
npm run ios:sync:companion
npm run ios:build:standalone
```

Choose your connected iPhone. This **Release** build bundles the JavaScript screen and native cloud configuration, so it does not need Metro or a tunnel. Do not run `start:dev:tunnel` for this test.

If you install using Xcode instead: open `ios/Cue.xcworkspace`, select the **Cue** scheme and your iPhone, choose **Product → Scheme → Edit Scheme → Run → Build Configuration → Release**, then Run. Use the appropriate development team/automatic signing for both **Cue** and **CueCompanion**, and complete any macOS signing permission prompt. An unsigned compile check cannot install the app. The earlier CLI attempt hit `errSecInternalComponent` while signing the widget; resolve signing in Xcode if that recurs.

For debugging with a Debug development build instead, its React Native screen requires a running Metro server. Native Shortcut configuration is now embedded in that build too, but the standalone Release route above avoids the development-server dependency for this test.

## 4. Check the app and permissions

1. Search your iPhone for and open **Cue** after the installation finishes.
2. Open the gear/settings sheet and tap **Check cloud connection**. Expect **Connected: access token and quota database verified**. This is a setup check, not an AI completion.
3. Allow Cue notifications when prompted. Allow Live Activities for Cue in iPhone Settings. If notification permission was denied earlier, enable it in Settings; the OS does not show the initial permission prompt again.
4. Complete the old **Remind me / No time set** card if it is just a test task. Otherwise leave it: new captures deliberately restore the previous due/upcoming card, so a successful new reminder may be saved without replacing that older displayed task.

## 5. First test inside Cue

Type exactly:

> Remind me to make sushi in 2 minutes

Submit once. Expect:

- A **Make sushi** reminder in Cue with a future due time about two minutes from submission.
- The Live Activity shows **Adding reminder…**, then **Added: Make sushi** with the time, then the due/upcoming reminder. In-app captures respect an explicitly disabled companion; enable it in Settings if needed.
- No **Cloud AI isn’t configured** error and no newly saved untimed placeholder.

Lock the phone and wait about two minutes. A local notification should alert you if permitted. The Live Activity's preloaded next task can change to **NOW** when iOS marks its snapshot stale; precise WidgetKit timing still requires device observation. The local notification is the alert mechanism. If you see an acknowledgement that alerts are off, fix notification permission and create a fresh timed test.

## 6. Test the Shortcut, then Back Tap

In Apple's Shortcuts app:

1. Create a shortcut named **Add to Cue**.
2. Add **Ask for Input**, with type **Text** and a prompt such as “What should Cue remember?”
3. Add **Cue → Add Cue reminder**. Tap its **Reminder** field and select the **Provided Input** variable from Ask for Input. Pass the variable, not a fixed literal sentence.
4. Run the shortcut in Shortcuts while the phone is unlocked. Enter the sushi sentence. Expect a success receipt naming the task and its time, a new card in Cue, and the Live Activity acknowledgement. Failures show their error rather than reporting success.
5. Only after that works, choose **Add to Cue** under **Settings → Accessibility → Touch → Back Tap → Double Tap** or **Triple Tap**.
6. Trigger Back Tap while unlocked and repeat with a fresh timed reminder. Locked-phone text input/authentication is controlled by iOS; verify it separately after the unlocked flow works.

Do not complete the new reminder before its deadline if you want to test the alert: completion cancels it. Multiple test captures create separate reminders/alerts.

## Read the result correctly

| Result | Meaning / next step |
| --- | --- |
| No cloud settings in this Cue build | Re-run native sync and rebuild/install; opening an older binary alone cannot embed the configuration. |
| `not_configured`, or health `ok:false` | Worker binding or secrets are missing/invalid. The updated health response names them. |
| Access token mismatch / HTTP 401 | Copy the local Cue token into Cloudflare's `CUE_CLIENT_TOKEN` Secret and deploy. |
| `quota_unavailable` | Create the SQL table in the database bound as `CUE_DB`. |
| `ai_configuration` | Check the OpenAI key and model access in the Worker. |
| HTTP 429 | Wait for the request window to reset. Global limits apply across all callers. |
| Added task with due time, but no alert | Check Cue notification permission; create a fresh test. |
| Older reminder returns after Added | Expected when another task was already displayed; inspect the saved task in Cue or complete that older test card. |

Each activity can remain active for up to eight hours, and can be dismissed. Updating it does not reset that lifetime; later enabled captures can start a new session. Reminders/notifications persist independently. This is not an always-running process.

Automated verification uses mocked OpenAI responses and unsigned compilation. No physical-device success is claimed until you complete the steps above.
