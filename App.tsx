import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Composer } from "./src/components/Composer";
import { ReminderCard } from "./src/components/ReminderCard";
import { SettingsSheet } from "./src/components/SettingsSheet";
import {
  captureWithCompanion,
  companionStatus,
  configureCompanionAI,
  hasCompanion,
  observeCompanion,
  refreshCompanion,
  removeWithCompanion,
  setCompanionEnabled,
  toggleWithCompanion,
} from "./src/lib/companion";
import {
  cancelReminderNotification,
  scheduleReminderNotification,
} from "./src/lib/notifications";
import {
  fallbackReminder,
  parseReminderWithOpenAi,
  transcribeReminderAudio,
} from "./src/lib/reminderParser";
import {
  loadApiKey,
  loadReminders,
  saveApiKey,
  saveReminders,
} from "./src/lib/storage";
import type { ParsedReminder, Reminder, ReminderSource } from "./src/types";

const developmentApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() ?? "";

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function reminderSort(a: Reminder, b: Reminder): number {
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }

  const aDueAt = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bDueAt = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  return aDueAt - bDueAt || b.createdAt.localeCompare(a.createdAt);
}

export default function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCompanionActive, setIsCompanionActive] = useState(false);
  const [isCompanionBusy, setIsCompanionBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isProcessing = isCreating || isTranscribing;
  const orderedReminders = useMemo(
    () => [...reminders].sort(reminderSort),
    [reminders],
  );
  const openCount = reminders.filter((reminder) => !reminder.completed).length;

  function showToast(message: string): void {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }

  useEffect(() => {
    async function hydrate(): Promise<void> {
      try {
        const [storedReminders, savedKey] = await Promise.all([loadReminders(), loadApiKey()]);
        const key = savedKey || developmentApiKey;
        await configureCompanionAI(key);
        await refreshCompanion();
        setReminders(storedReminders);
        setApiKey(key);
        if (hasCompanion) setIsCompanionActive((await companionStatus()).active);
        setIsReady(true);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Couldn’t load your reminders. Reopen Cue to try again.");
      }
    }

    void hydrate();
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || !hasCompanion) return;
    async function sync(): Promise<void> {
      try {
        setReminders(await loadReminders());
        setIsCompanionActive((await companionStatus()).active);
      } catch (error) {
        Alert.alert("Couldn’t refresh Cue", error instanceof Error ? error.message : "Please reopen Cue.");
      }
    }
    const unsubscribe = observeCompanion(() => void sync());
    void sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshCompanion().then(sync).catch(() => void sync());
    });
    return () => { unsubscribe(); subscription.remove(); };
  }, [isReady]);

  useEffect(() => {
    if (isReady) {
      void saveReminders(reminders).catch(() => Alert.alert("Couldn’t save reminders", "Please try again."));
    }
  }, [isReady, reminders]);

  function openSettings(): void {
    setApiKeyDraft(apiKey);
    setIsSettingsOpen(true);
    if (hasCompanion) void companionStatus().then((status) => setIsCompanionActive(status.active)).catch(() => {});
  }

  async function toggleCompanion(enabled: boolean): Promise<void> {
    setIsCompanionBusy(true);
    try {
      const status = await setCompanionEnabled(enabled);
      setIsCompanionActive(status.active);
    } catch (error) {
      Alert.alert("Couldn’t change the companion", error instanceof Error ? error.message : "Open iPhone Settings and allow Live Activities for Cue.");
    } finally {
      setIsCompanionBusy(false);
    }
  }

  async function saveSettings(): Promise<void> {
    const nextKey = apiKeyDraft.trim();
    try {
      await saveApiKey(nextKey);
      setApiKey(nextKey);
      setIsSettingsOpen(false);
      showToast(nextKey ? "AI is ready for natural language and voice." : "AI key removed.");
    } catch {
      Alert.alert("Couldn’t save your key", "Try again or use the development environment variable.");
    }
  }

  async function createReminder(rawText: string, source: ReminderSource): Promise<void> {
    const text = rawText.trim();
    if (!text || isCreating || !isReady) {
      return;
    }

    setIsCreating(true);
    if (hasCompanion) {
      try {
        const saved = await captureWithCompanion(text, source);
        setReminders(saved);
        setInput("");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const added = saved[0];
        showToast(added?.notificationId ? "Reminder saved and scheduled." : added?.dueAt ? "Reminder saved. Enable notifications for an alert." : apiKey ? "Reminder saved. No time set." : "Saved your words. Add an AI key to understand times.");
      } catch (error) {
        Alert.alert("Couldn’t add reminder", error instanceof Error ? error.message : "Please try again.");
      } finally {
        setIsCreating(false);
      }
      return;
    }
    let parsed: ParsedReminder;
    let usedFallback = false;

    try {
      parsed = apiKey
        ? await parseReminderWithOpenAi(text, apiKey)
        : fallbackReminder(text);
    } catch {
      parsed = fallbackReminder(text);
      usedFallback = true;
    }

    const reminder: Reminder = {
      id: createId(),
      title: parsed.title,
      note: parsed.note,
      dueAt: parsed.dueAt,
      completed: false,
      createdAt: new Date().toISOString(),
      source,
    };

    try {
      reminder.notificationId = await scheduleReminderNotification(reminder);
    } catch {
      // Adding the reminder must not fail if OS notifications are unavailable.
    }

    setReminders((current) => [reminder, ...current]);
    setInput("");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(
      usedFallback
        ? "Saved your words. AI parsing wasn’t available."
        : reminder.notificationId
          ? "Reminder saved and scheduled."
          : reminder.dueAt ? "Reminder saved. Enable notifications for an alert."
          : "Reminder saved.",
    );
    setIsCreating(false);
  }

  async function startVoiceCapture(): Promise<void> {
    if (!apiKey) {
      showToast("Add an OpenAI key in settings to turn speech into reminders.");
      openSettings();
      return;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Microphone access needed",
          "Allow microphone access in device settings to add spoken reminders.",
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      showToast("Listening… tap the mic when you’re done.");
    } catch {
      Alert.alert("Couldn’t start recording", "Please try the microphone again.");
    }
  }

  async function finishVoiceCapture(): Promise<void> {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) {
        throw new Error("No audio was captured.");
      }

      setIsTranscribing(true);
      showToast("Turning your voice into a reminder…");
      const transcript = await transcribeReminderAudio(uri, apiKey);
      await createReminder(transcript, "voice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Couldn’t understand that", message);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleVoicePress(): Promise<void> {
    if (isProcessing) {
      return;
    }

    if (recorderState.isRecording) {
      await finishVoiceCapture();
      return;
    }

    await startVoiceCapture();
  }

  async function toggleReminder(reminder: Reminder): Promise<void> {
    const completed = !reminder.completed;
    if (hasCompanion) {
      try {
        setReminders(await toggleWithCompanion(reminder.id, completed));
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        Alert.alert("Couldn’t update reminder", error instanceof Error ? error.message : "Please try again.");
      }
      return;
    }
    let notificationId = reminder.notificationId;

    if (completed) {
      await cancelReminderNotification(notificationId);
      notificationId = undefined;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      try {
        notificationId = await scheduleReminderNotification(reminder);
      } catch {
        // Keep the task usable if the OS declines scheduling.
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setReminders((current) =>
      current.map((item) =>
        item.id === reminder.id ? { ...item, completed, notificationId } : item,
      ),
    );
  }

  function confirmDelete(reminder: Reminder): void {
    Alert.alert("Remove this reminder?", `“${reminder.title}” will be deleted.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          if (hasCompanion) {
            void removeWithCompanion(reminder.id).then(setReminders).catch((error) => {
              Alert.alert("Couldn’t remove reminder", error instanceof Error ? error.message : "Please try again.");
            });
            return;
          }
          void cancelReminderNotification(reminder.notificationId);
          setReminders((current) => current.filter((item) => item.id !== reminder.id));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>YOUR REMINDERS</Text>
            <Text style={styles.brand}>Cue</Text>
            <Text style={styles.subtitle}>
              {openCount === 0 ? "Nothing waiting on you." : `${openCount} thing${openCount === 1 ? "" : "s"} to remember.`}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Open AI settings"
            accessibilityRole="button"
            hitSlop={10}
            onPress={openSettings}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsPressed]}
          >
            <Ionicons color="#202026" name="settings-outline" size={25} />
            <View style={[styles.aiIndicator, apiKey ? styles.aiReady : styles.aiOff]} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isReady ? (
            orderedReminders.length > 0 ? (
              <View style={styles.cards}>
                {orderedReminders.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    onLongPress={() => confirmDelete(reminder)}
                    onPress={() => void toggleReminder(reminder)}
                    reminder={reminder}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons color="#FF4B3A" name="sparkles" size={26} />
                </View>
                <Text style={styles.emptyTitle}>Make room in your head.</Text>
                <Text style={styles.emptyText}>
                  Type a quick thought or use the microphone to capture a spoken reminder.
                </Text>
              </View>
            )
          ) : (
            <View style={styles.loading}>
              {loadError ? <Text style={styles.emptyText}>{loadError}</Text> : <ActivityIndicator color="#FF4B3A" />}
            </View>
          )}
        </ScrollView>

        {toast ? (
          <View pointerEvents="none" style={styles.toast}>
            <Ionicons color="#FFFFFF" name="checkmark-circle" size={17} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}

        <Composer
          isProcessing={isProcessing || !isReady}
          isRecording={recorderState.isRecording}
          onChangeText={setInput}
          onSubmit={() => void createReminder(input, "text")}
          onVoicePress={() => void handleVoicePress()}
          value={input}
        />
      </KeyboardAvoidingView>

      <SettingsSheet
        apiKey={apiKeyDraft}
        onChangeApiKey={setApiKeyDraft}
        onClose={() => setIsSettingsOpen(false)}
        onSave={() => void saveSettings()}
        companionAvailable={hasCompanion}
        companionActive={isCompanionActive}
        companionBusy={isCompanionBusy}
        onToggleCompanion={(enabled) => void toggleCompanion(enabled)}
        visible={isSettingsOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F4F3F7",
    flex: 1,
  },
  root: {
    flex: 1,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 22,
    paddingHorizontal: 25,
    paddingTop: 22,
  },
  kicker: {
    color: "#87858F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  brand: {
    color: "#17171D",
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -2.3,
    lineHeight: 53,
    marginTop: 2,
  },
  subtitle: {
    color: "#71707A",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  settingsButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#EBE9EE",
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    marginTop: 3,
    shadowColor: "#343141",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 17,
    width: 50,
  },
  settingsPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  aiIndicator: {
    borderColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 2,
    bottom: 2,
    height: 11,
    position: "absolute",
    right: 1,
    width: 11,
  },
  aiReady: {
    backgroundColor: "#38B176",
  },
  aiOff: {
    backgroundColor: "#BBB9C1",
  },
  content: {
    flexGrow: 1,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  cards: {
    gap: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
    paddingHorizontal: 37,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "#FFE9E5",
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  emptyTitle: {
    color: "#26252C",
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 17,
  },
  emptyText: {
    color: "#77757F",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 300,
  },
  toast: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#27262C",
    borderRadius: 999,
    bottom: 8,
    flexDirection: "row",
    gap: 7,
    maxWidth: "88%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  toastText: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
  },
});
