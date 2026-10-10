import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

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
        <Text style={styles.prompt}>Say it naturally — Cue figures out the rest.</Text>
      )}

      <View style={[styles.bar, isRecording && styles.barRecording]}>
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
      </View>

      <Text style={styles.example}>Try: “Remind me to call Mum tomorrow at 8.”</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F4F3F7",
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  prompt: {
    color: "#74737C",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 9,
    paddingHorizontal: 4,
  },
  listeningPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFE5E0",
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
    backgroundColor: "#FFFFFF",
    borderColor: "#E7E5EB",
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    padding: 6,
    shadowColor: "#2C2940",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  barRecording: {
    borderColor: "#FFB3A9",
  },
  micButton: {
    alignItems: "center",
    height: 46,
    justifyContent: "center",
    width: 45,
  },
  input: {
    color: "#1F1F26",
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
    backgroundColor: "#19191D",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    marginLeft: 6,
    width: 42,
  },
  submitButtonDisabled: {
    backgroundColor: "#C5C4CA",
  },
  buttonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  example: {
    color: "#92919A",
    fontSize: 11,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
