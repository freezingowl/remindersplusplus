import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Reminder } from "../types";

type ReminderCardProps = {
  reminder: Reminder;
  onPress: () => void;
  onLongPress: () => void;
};

function formatDueDate(dueAt?: string): string | undefined {
  if (!dueAt) {
    return undefined;
  }

  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === today.toDateString()) {
    return `Today · ${time}`;
  }

  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow · ${time}`;
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReminderCard({ reminder, onPress, onLongPress }: ReminderCardProps) {
  const dueLabel = formatDueDate(reminder.dueAt);
  const isDone = reminder.completed;

  return (
    <Pressable
      accessibilityHint="Tap to mark complete. Long press to delete."
      accessibilityLabel={`${reminder.title}${isDone ? ", completed" : ""}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isDone }}
      delayLongPress={450}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, isDone && styles.cardDone, pressed && styles.cardPressed]}
    >
      <View style={styles.textColumn}>
        <View style={styles.metaRow}>
          {reminder.source === "voice" ? (
            <View style={[styles.chip, isDone && styles.chipDone]}>
              <Ionicons color={isDone ? "#6B7780" : "#53727C"} name="mic" size={12} />
              <Text style={[styles.chipText, isDone && styles.chipTextDone]}>Voice</Text>
            </View>
          ) : null}
          {dueLabel ? (
            <View style={[styles.due, isDone && styles.dueDone]}>
              <Ionicons color={isDone ? "#758089" : "#606673"} name="calendar-outline" size={13} />
              <Text style={[styles.dueText, isDone && styles.dueTextDone]}>{dueLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={3} style={[styles.title, isDone && styles.titleDone]}>
          {reminder.title}
        </Text>
        {reminder.note ? (
          <Text numberOfLines={2} style={[styles.note, isDone && styles.noteDone]}>
            {reminder.note}
          </Text>
        ) : null}
      </View>

      <View style={[styles.check, isDone && styles.checkDone]}>
        {isDone ? <Ionicons color="#FFFFFF" name="checkmark" size={18} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 21,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    minHeight: 118,
    paddingHorizontal: 18,
    paddingVertical: 17,
    shadowColor: "#747A91",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
  },
  cardDone: {
    backgroundColor: "rgba(233, 245, 239, 0.84)",
    borderColor: "rgba(220, 238, 228, 0.98)",
  },
  cardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.986 }],
  },
  textColumn: {
    flex: 1,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    alignItems: "center",
    backgroundColor: "rgba(226, 239, 239, 0.86)",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipDone: {
    backgroundColor: "rgba(220, 236, 227, 0.96)",
  },
  chipText: {
    color: "#46636B",
    fontSize: 11,
    fontWeight: "700",
  },
  chipTextDone: {
    color: "#557060",
  },
  due: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  dueDone: {
    opacity: 0.96,
  },
  dueText: {
    color: "#606673",
    fontSize: 12,
    fontWeight: "600",
  },
  dueTextDone: {
    color: "#68736D",
  },
  title: {
    color: "#292B34",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  titleDone: {
    color: "#65736A",
    textDecorationLine: "line-through",
  },
  note: {
    color: "#777C89",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 5,
  },
  noteDone: {
    color: "#849087",
  },
  check: {
    alignItems: "center",
    borderColor: "#A8ADB8",
    borderRadius: 999,
    borderWidth: 2.4,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  checkDone: {
    backgroundColor: "#5C9D78",
    borderColor: "#5C9D78",
  },
});
