import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { Reminder } from "../types";

const REMINDERS_KEY = "@cue/reminders";
const API_KEY_STORAGE_KEY = "@cue/openai-api-key";

function isReminder(value: unknown): value is Reminder {
  if (!value || typeof value !== "object") {
    return false;
  }

  const reminder = value as Partial<Reminder>;
  return (
    typeof reminder.id === "string" &&
    typeof reminder.title === "string" &&
    typeof reminder.completed === "boolean" &&
    typeof reminder.createdAt === "string"
  );
}

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const stored = await AsyncStorage.getItem(REMINDERS_KEY);
    if (!stored) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isReminder) : [];
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

export async function loadApiKey(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(API_KEY_STORAGE_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveApiKey(apiKey: string): Promise<void> {
  if (apiKey) {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey);
    return;
  }

  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
}
