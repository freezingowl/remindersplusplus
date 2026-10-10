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
              <Ionicons color={isDone ? "#FEE2DE" : "#F05243"} name="mic" size={11} />
              <Text style={[styles.chipText, isDone && styles.chipTextDone]}>Voice</Text>
            </View>
          ) : null}
          {dueLabel ? (
            <View style={[styles.due, isDone && styles.dueDone]}>
              <Ionicons color={isDone ? "#FFE4DE" : "#75737E"} name="calendar-outline" size={13} />
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
        {isDone ? <Ionicons color="#FF4B3A" name="checkmark" size={21} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    flexDirection: "row",
    gap: 20,
    minHeight: 152,
    paddingHorizontal: 24,
    paddingVertical: 22,
    shadowColor: "#272438",
    shadowOffset: { width: 0, height: 11 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
  },
  cardDone: {
    backgroundColor: "#FF4B3A",
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
    gap: 7,
    marginBottom: 11,
  },
  chip: {
    alignItems: "center",
    backgroundColor: "#FFF0EE",
    borderRadius: 99,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipDone: {
    backgroundColor: "#D93D30",
  },
  chipText: {
    color: "#D94739",
    fontSize: 11,
    fontWeight: "800",
  },
  chipTextDone: {
    color: "#FEE2DE",
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
    color: "#75737E",
    fontSize: 12,
    fontWeight: "700",
  },
  dueTextDone: {
    color: "#FFE4DE",
  },
  title: {
    color: "#202027",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.55,
    lineHeight: 30,
  },
  titleDone: {
    color: "#FFFFFF",
  },
  note: {
    color: "#77757F",
    fontSize: 14,
    lineHeight: 19,
    marginTop: 8,
  },
  noteDone: {
    color: "#FFE7E3",
  },
  check: {
    alignItems: "center",
    borderColor: "#A5A3AB",
    borderRadius: 999,
    borderWidth: 2.4,
    height: 45,
    justifyContent: "center",
    width: 45,
  },
  checkDone: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
});
