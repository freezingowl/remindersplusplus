import type { ParsedReminder } from "../types";
import { cloudRequest } from "./cloud";

export async function parseReminderWithCloud(rawText: string): Promise<ParsedReminder> {
  const payload = await cloudRequest("/v1/reminders/parse", JSON.stringify({
    text: rawText,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })) as { reminder?: { title?: unknown; note?: unknown; dueAt?: unknown } };
  const reminder = payload.reminder;
  if (!reminder || typeof reminder.title !== "string" || !reminder.title.trim() || reminder.title.length > 120
    || typeof reminder.note !== "string" || reminder.note.length > 240 || typeof reminder.dueAt !== "string" || reminder.dueAt.length > 80
    || (reminder.dueAt && (!/(?:Z|[+-]\d{2}:\d{2})$/.test(reminder.dueAt) || !Number.isFinite(Date.parse(reminder.dueAt)) || Date.parse(reminder.dueAt) <= Date.now()))) {
    throw new Error("Cloud AI returned an invalid reminder. Please try again.");
  }
  return { title: reminder.title, note: reminder.note, dueAt: reminder.dueAt || undefined };
}

export async function transcribeReminderAudio(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: "cue-reminder.m4a",
    type: "audio/m4a",
  } as unknown as Blob);
  const payload = await cloudRequest("/v1/audio/transcribe", formData) as { text?: unknown };
  if (typeof payload.text !== "string" || !payload.text.trim()) {
    throw new Error("I couldn’t hear a reminder in that recording.");
  }
  return payload.text;
}
