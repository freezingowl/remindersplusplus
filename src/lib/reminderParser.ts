import type { ParsedReminder } from "../types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

type OpenAiError = {
  error?: {
    message?: string;
  };
};

type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
};

function stripReminderPreamble(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:please\s+)?(?:can you\s+)?remind me to\s+/i, "")
    .replace(/^\s*(?:add|create)\s+(?:a\s+)?reminder(?:\s+to)?\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "")
    .trim();
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function toLocalDateTime(value: Date): string {
  const offset = -value.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offset);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const minutes = String(absoluteOffset % 60).padStart(2, "0");

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:00${sign}${hours}:${minutes}`;
}

async function getErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as OpenAiError | null;
  return payload?.error?.message ?? `OpenAI request failed (${response.status}).`;
}

export function fallbackReminder(rawText: string): ParsedReminder {
  const title = stripReminderPreamble(rawText);
  return {
    title: title || "Untitled reminder",
    note: "",
  };
}

export async function parseReminderWithOpenAi(
  rawText: string,
  apiKey: string,
): Promise<ParsedReminder> {
  const now = new Date();
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "Extract exactly one personal reminder from the user's words.",
            `The current local date and time is ${toLocalDateTime(now)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
            "Resolve relative dates using that timestamp. Never invent a date or a time.",
            "Write a short actionable title, an optional concise note, and dueAt as an ISO 8601 datetime with an offset. Use an empty dueAt string when the user did not clearly name a time.",
          ].join(" "),
        },
        { role: "user", content: rawText },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cue_reminder",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              note: { type: "string" },
              dueAt: { type: "string" },
            },
            required: ["title", "note", "dueAt"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const completion = (await response.json()) as ChatCompletionResponse;
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty reminder.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned an unreadable reminder.");
  }

  const reminder = parsed as Partial<ParsedReminder>;
  const title = normalizeText(reminder.title, 120) || fallbackReminder(rawText).title;
  const note = normalizeText(reminder.note, 240);
  const candidateDueAt = normalizeText(reminder.dueAt, 80);
  const dueAt = candidateDueAt && !Number.isNaN(new Date(candidateDueAt).getTime())
    ? candidateDueAt
    : undefined;

  return { title, note, dueAt };
}

export async function transcribeReminderAudio(
  uri: string,
  apiKey: string,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: "cue-reminder.m4a",
    type: "audio/m4a",
  } as unknown as Blob);
  formData.append("model", "gpt-4o-mini-transcribe");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    "This is a short spoken personal reminder. Preserve names, dates, and times accurately.",
  );

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const payload = (await response.json()) as { text?: unknown };
  const text = normalizeText(payload.text, 600);
  if (!text) {
    throw new Error("I couldn't hear a reminder in that recording.");
  }

  return text;
}
