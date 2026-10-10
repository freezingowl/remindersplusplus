import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { Reminder } from "../types";
import { hasCompanion, nativeReminders, seedNativeReminders } from "./companion";

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
  if (hasCompanion) {
    const native = await nativeReminders();
    if (native !== null) return native;
  }
  const legacy = await loadLegacyReminders();
  return hasCompanion ? seedNativeReminders(legacy) : legacy;
}

async function loadLegacyReminders(): Promise<Reminder[]> {
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
  // Native actions and Shortcuts share one store. Never overwrite it with a UI snapshot.
  if (hasCompanion) return;
  await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

// Delete personal OpenAI keys saved by earlier builds; cloud requests never read them.
export async function clearLegacyAIKey(): Promise<void> {
  if (Platform.OS !== "web" && await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  }
}
