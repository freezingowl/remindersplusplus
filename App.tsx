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
import { LiquidSurface } from "./src/components/LiquidSurface";
import { ReminderCard } from "./src/components/ReminderCard";
import { SettingsSheet } from "./src/components/SettingsSheet";
import {
  captureWithCompanion,
  companionStatus,
  configureCompanionCloud,
  hasCompanion,
  observeCompanion,
  nativeCloudConfiguration,
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
  parseReminderWithCloud,
  transcribeReminderAudio,
} from "./src/lib/reminderParser";
import {
  clearLegacyAIKey,
  loadReminders,
  saveReminders,
} from "./src/lib/storage";
import { cloudConfig, cloudConfigured, cloudConfigurationError, applyNativeCloudConfiguration } from "./src/lib/cloud";
import type { Reminder, ReminderSource } from "./src/types";

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
  const [isReady, setIsReady] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCompanionActive, setIsCompanionActive] = useState(false);
  const [isCompanionBusy, setIsCompanionBusy] = useState(false);
  const [companionPushStatus, setCompanionPushStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const voiceFinishing = useRef(false);
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
    toastTimer.current = setTimeout(() => setToast(""), message.includes("\n") ? 8000 : 3600);
  }

  useEffect(() => {
    async function hydrate(): Promise<void> {
      try {
        const [storedReminders] = await Promise.all([loadReminders(), clearLegacyAIKey()]);
        await configureCompanionCloud(cloudConfigured ? cloudConfig.url : "", cloudConfigured ? cloudConfig.token : "");
        const nativeConfig = await nativeCloudConfiguration();
        if (nativeConfig) applyNativeCloudConfiguration(nativeConfig);
        await refreshCompanion();
        setReminders(storedReminders);
        if (hasCompanion) {
          const status = await companionStatus();
          setIsCompanionActive(status.active);
          setCompanionPushStatus(status.pushStatus ?? "");
        }
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
        const status = await companionStatus();
        setIsCompanionActive(status.active);
        setCompanionPushStatus(status.pushStatus ?? "");
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
    setIsSettingsOpen(true);
    if (hasCompanion) void companionStatus().then((status) => {
      setIsCompanionActive(status.active);
      setCompanionPushStatus(status.pushStatus ?? "");
    }).catch(() => {});
  }

  async function toggleCompanion(enabled: boolean): Promise<void> {
    setIsCompanionBusy(true);
    try {
      const status = await setCompanionEnabled(enabled);
      setIsCompanionActive(status.active);
      setCompanionPushStatus(status.pushStatus ?? "");
    } catch (error) {
      Alert.alert("Couldn’t change the companion", error instanceof Error ? error.message : "Open iPhone Settings and allow Live Activities for Cue.");
    } finally {
      setIsCompanionBusy(false);
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
        setReminders(saved.reminders);
        setInput("");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(saved.reply);
      } catch (error) {
        Alert.alert("Couldn’t complete request", error instanceof Error ? error.message : "Please try again.");
      } finally {
        setIsCreating(false);
      }
      return;
    }
    try {
      const parsed = await parseReminderWithCloud(text);
      const reminder: Reminder = {
        id: createId(), title: parsed.title, note: parsed.note, dueAt: parsed.dueAt,
        completed: false, createdAt: new Date().toISOString(), source,
      };
      try { reminder.notificationId = await scheduleReminderNotification(reminder); }
      catch { /* Saving still works when the OS declines notifications. */ }
      setReminders((current) => [reminder, ...current]);
      setInput("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(reminder.notificationId ? "Reminder saved and scheduled."
        : reminder.dueAt ? "Reminder saved. Enable notifications for an alert." : "Reminder saved. No time set.");
    } catch (error) {
      Alert.alert("Couldn’t add reminder", error instanceof Error ? error.message : "Please try again.");
    } finally { setIsCreating(false); }
  }

  async function startVoiceCapture(): Promise<void> {
    if (!cloudConfigured) {
      Alert.alert("Cloud AI unavailable", cloudConfigurationError());
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
    if (voiceFinishing.current) return;
    voiceFinishing.current = true;
    setIsTranscribing(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) {
        throw new Error("No audio was captured.");
      }

      showToast(hasCompanion ? "Understanding your request…" : "Turning your voice into a reminder…");
      const transcript = await transcribeReminderAudio(uri);
      await createReminder(transcript, "voice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Couldn’t understand that", message);
    } finally {
      voiceFinishing.current = false;
      setIsTranscribing(false);
    }
  }

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 60_000) {
      const timer = setTimeout(() => void finishVoiceCapture(), 0);
      return () => clearTimeout(timer);
    }
    // Only recording progress triggers the cap, not changes to UI callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording, recorderState.durationMillis]);

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
        <View pointerEvents="none" style={styles.topGlow} />
        <View pointerEvents="none" style={styles.trailingGlow} />
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>CUE</Text>
            <Text style={styles.brand}>Today</Text>
            <Text style={styles.subtitle}>
              {openCount === 0 ? "Your day is clear." : `${openCount} reminder${openCount === 1 ? "" : "s"} to keep in mind.`}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            hitSlop={10}
            onPress={openSettings}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsPressed]}
          >
            <LiquidSurface isInteractive style={styles.settingsGlass}>
              <Ionicons color="#30313A" name="settings-outline" size={22} />
              <View style={[styles.aiIndicator, cloudConfigured ? styles.aiReady : styles.aiOff]} />
            </LiquidSurface>
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
          <LiquidSurface pointerEvents="none" style={styles.toast} tintColor="rgba(48, 49, 58, 0.86)">
            <Ionicons color="#FFFFFF" name="checkmark-circle" size={17} />
            <Text style={styles.toastText}>{toast}</Text>
          </LiquidSurface>
        ) : null}

        <Composer
          assistantAvailable={hasCompanion}
          isProcessing={isProcessing || !isReady}
          isRecording={recorderState.isRecording}
          onChangeText={setInput}
          onSubmit={() => void createReminder(input, "text")}
          onVoicePress={() => void handleVoicePress()}
          value={input}
        />
      </KeyboardAvoidingView>

      <SettingsSheet
        cloudConfigured={cloudConfigured}
        onClose={() => setIsSettingsOpen(false)}
        companionAvailable={hasCompanion}
        companionActive={isCompanionActive}
        companionBusy={isCompanionBusy}
        companionPushStatus={companionPushStatus}
        onToggleCompanion={(enabled) => void toggleCompanion(enabled)}
        visible={isSettingsOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F5F6FA",
    flex: 1,
  },
  root: {
    flex: 1,
    overflow: "hidden",
  },
  topGlow: {
    backgroundColor: "#E7E8FF",
    borderRadius: 170,
    height: 340,
    left: -145,
    opacity: 0.66,
    position: "absolute",
    top: -205,
    width: 340,
  },
  trailingGlow: {
    backgroundColor: "#E5F3EE",
    borderRadius: 140,
    height: 280,
    opacity: 0.72,
    position: "absolute",
    right: -170,
    top: 178,
    width: 280,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 19,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  kicker: {
    color: "#6D6F80",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  brand: {
    color: "#22242D",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.9,
    lineHeight: 40,
    marginTop: 5,
  },
  subtitle: {
    color: "#676A78",
    fontSize: 15,
    fontWeight: "500",
    marginTop: 3,
  },
  settingsButton: {
    alignItems: "center",
    height: 46,
    justifyContent: "center",
    marginTop: 5,
    width: 46,
  },
  settingsGlass: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.88)",
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    shadowColor: "#555B73",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.11,
    shadowRadius: 12,
    width: 46,
  },
  settingsPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  aiIndicator: {
    borderColor: "rgba(255, 255, 255, 0.96)",
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
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  cards: {
    gap: 10,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 330,
    paddingHorizontal: 34,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  emptyTitle: {
    color: "#2A2C36",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginTop: 15,
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
    borderRadius: 999,
    bottom: 10,
    flexDirection: "row",
    gap: 7,
    maxWidth: "88%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
    shadowColor: "#252734",
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
