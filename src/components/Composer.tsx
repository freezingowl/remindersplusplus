import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { LiquidSurface } from "./LiquidSurface";

type ComposerProps = {
  value: string;
  isRecording: boolean;
  isProcessing: boolean;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onVoicePress: () => void;
};

export function Composer({
  value,
  isRecording,
  isProcessing,
  onChangeText,
  onSubmit,
  onVoicePress,
}: ComposerProps) {
  const hasText = value.trim().length > 0;

  return (
    <View style={styles.container}>
      {isRecording ? (
        <View style={styles.listeningPill}>
          <View style={styles.recordingDot} />
          <Text style={styles.listeningText}>Listening — tap the mic when you&apos;re done</Text>
        </View>
      ) : (
        <Text style={styles.prompt}>Add a reminder</Text>
      )}

      <LiquidSurface
        isInteractive
        style={[styles.bar, isRecording && styles.barRecording]}
        tintColor={isRecording ? "rgba(255, 107, 91, 0.18)" : undefined}
      >
        <Pressable
          accessibilityLabel={isRecording ? "Stop recording" : "Record a reminder"}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onVoicePress}
          style={({ pressed }) => [styles.micButton, pressed && styles.buttonPressed]}
        >
          <Ionicons
            color={isRecording ? "#FF4B3A" : "#5D5C66"}
            name={isRecording ? "stop" : "mic-outline"}
            size={22}
          />
        </Pressable>

        <TextInput
          accessibilityLabel="New reminder"
          blurOnSubmit={false}
          editable={!isProcessing && !isRecording}
          multiline
          onChangeText={onChangeText}
          onSubmitEditing={hasText ? onSubmit : undefined}
          placeholder="What do you need to remember?"
          placeholderTextColor="#9B9AA3"
          returnKeyType="done"
          style={styles.input}
          value={value}
        />

        <Pressable
          accessibilityLabel="Add reminder"
          accessibilityRole="button"
          disabled={!hasText || isProcessing || isRecording}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.submitButton,
            (!hasText || isProcessing || isRecording) && styles.submitButtonDisabled,
            pressed && hasText && !isProcessing && styles.buttonPressed,
          ]}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons color="#FFFFFF" name="arrow-up" size={23} />
          )}
        </Pressable>
      </LiquidSurface>

      <Text style={styles.example}>Try “Call Mum tomorrow at 8.”</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 7,
  },
  prompt: {
    color: "#5D6070",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    paddingHorizontal: 5,
  },
  listeningPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 233, 229, 0.88)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    marginBottom: 9,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  recordingDot: {
    backgroundColor: "#FF4B3A",
    borderRadius: 5,
    height: 8,
    width: 8,
  },
  listeningText: {
    color: "#C93427",
    fontSize: 12,
    fontWeight: "700",
  },
  bar: {
    alignItems: "flex-end",
    borderColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 56,
    padding: 6,
    shadowColor: "#565C73",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  barRecording: {
    borderColor: "rgba(255, 156, 145, 0.9)",
  },
  micButton: {
    alignItems: "center",
    height: 46,
    justifyContent: "center",
    width: 45,
  },
  input: {
    color: "#252730",
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 100,
    minHeight: 42,
    paddingBottom: 10,
    paddingTop: 10,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#FA5C50",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginLeft: 6,
    width: 42,
  },
  submitButtonDisabled: {
    backgroundColor: "#C4C7D0",
  },
  buttonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  example: {
    color: "#858897",
    fontSize: 11,
    marginTop: 8,
    paddingHorizontal: 5,
  },
});
