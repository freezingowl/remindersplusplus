import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type SettingsSheetProps = {
  visible: boolean;
  apiKey: string;
  onChangeApiKey: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function SettingsSheet({
  visible,
  apiKey,
  onChangeApiKey,
  onClose,
  onSave,
}: SettingsSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>PRIVATE ON THIS DEVICE</Text>
              <Text style={styles.title}>AI settings</Text>
            </View>
            <Pressable
              accessibilityLabel="Close settings"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons color="#2C2B31" name="close" size={22} />
            </Pressable>
          </View>

          <Text style={styles.description}>
            Add an OpenAI API key to understand natural language and transcribe spoken reminders.
          </Text>

          <Text style={styles.label}>OPENAI API KEY</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onChangeApiKey}
            placeholder="sk-..."
            placeholderTextColor="#AAA8B0"
            secureTextEntry
            style={styles.input}
            value={apiKey}
          />

          <View style={styles.securityNote}>
            <Ionicons color="#74717D" name="shield-checkmark-outline" size={18} />
            <Text style={styles.securityText}>
              It is stored using your device&apos;s secure storage. Use a server-side proxy before shipping a public app.
            </Text>
          </View>

          <Pressable onPress={onSave} style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}>
            <Text style={styles.saveText}>Save settings</Text>
            <Ionicons color="#FFFFFF" name="arrow-forward" size={19} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: "rgba(18, 17, 23, 0.38)",
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 36,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#D8D6DD",
    borderRadius: 4,
    height: 5,
    marginBottom: 18,
    width: 43,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#8B8993",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.15,
  },
  title: {
    color: "#201F26",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 3,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "#F2F1F5",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  description: {
    color: "#686670",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 19,
  },
  label: {
    color: "#77757E",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 24,
  },
  input: {
    backgroundColor: "#F5F4F7",
    borderColor: "#E6E4EA",
    borderRadius: 15,
    borderWidth: 1,
    color: "#24232A",
    fontSize: 16,
    height: 54,
    paddingHorizontal: 15,
  },
  securityNote: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
    marginTop: 15,
  },
  securityText: {
    color: "#74717C",
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#1C1B20",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    height: 56,
    justifyContent: "center",
    marginTop: 25,
  },
  savePressed: {
    opacity: 0.82,
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
