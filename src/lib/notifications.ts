import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import type { Reminder } from "../types";

let hasConfiguredNotifications = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function configureNotifications(): Promise<void> {
  if (hasConfiguredNotifications) {
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 160, 220],
      lightColor: "#FF4B3A",
    });
  }

  hasConfiguredNotifications = true;
}

async function getNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleReminderNotification(
  reminder: Pick<Reminder, "title" | "note" | "dueAt">,
): Promise<string | undefined> {
  if (!reminder.dueAt) {
    return undefined;
  }

  const date = new Date(reminder.dueAt);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return undefined;
  }

  if (!(await getNotificationPermission())) {
    return undefined;
  }

  await configureNotifications();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Cue",
      body: reminder.title,
      subtitle: reminder.note || undefined,
      sound: "default",
      data: { type: "reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: Platform.OS === "android" ? "reminders" : undefined,
    },
  });
}

export async function cancelReminderNotification(
  notificationId?: string,
): Promise<void> {
  if (!notificationId) {
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // The system can remove expired notifications before this call.
  }
}
