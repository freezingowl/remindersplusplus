import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

type SettingsSheetProps = {
  visible: boolean;
  cloudConfigured: boolean;
  onClose: () => void;
  companionAvailable: boolean;
  companionActive: boolean;
  companionBusy: boolean;
  onToggleCompanion: (enabled: boolean) => void;
};

export function SettingsSheet({
  visible,
  cloudConfigured,
  onClose,
  companionAvailable,
  companionActive,
  companionBusy,
  onToggleCompanion,
}: SettingsSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable onPress={onClose} style={styles.backdrop} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheet} style={styles.sheetScroll}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>CUE COMPANION</Text>
              <Text style={styles.title}>Settings</Text>
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

          {companionAvailable ? (
            <View style={styles.companion}>
              <View style={styles.companionRow}>
                <Text style={styles.companionTitle}>Lock Screen companion</Text>
                <Switch accessibilityLabel="Lock Screen companion" disabled={companionBusy} onValueChange={onToggleCompanion} value={companionActive} />
              </View>
              <Text style={styles.securityText}>One quiet card for this session, up to 8 hours.</Text>
              <Pressable accessibilityRole="button" onPress={() => Alert.alert(
                "Add Cue to Back Tap",
                "Open the configured Cue app once first. In Shortcuts, create a shortcut with Ask for Input (Text), then Cue → Add Cue reminder. Pass the input into Reminder. In iPhone Settings → Accessibility → Touch → Back Tap, choose that shortcut for Double Tap or Triple Tap. Try it while unlocked first.",
                [{ text: "Close", style: "cancel" }, { text: "Open Shortcuts", onPress: () => { void Linking.openURL("shortcuts://").catch(() => Alert.alert("Open Shortcuts", "Open the Shortcuts app on your iPhone.")); } }],
              )} style={styles.shortcutButton}>
                <Text style={styles.shortcutText}>Set up Back Tap</Text>
                <Ionicons color="#686670" name="arrow-up-right-box" size={15} />
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.description}>
            {cloudConfigured ? "Cloud AI is ready for typed and spoken reminders." : "Cloud AI hasn’t been configured in this build yet."}
          </Text>
          <Text style={styles.securityText}>An internet connection is needed to add reminders.</Text>
        </ScrollView>
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
  sheetScroll: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 32, borderTopRightRadius: 32, flexGrow: 0, maxHeight: "90%" },
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
  securityText: {
    color: "#74717C",
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  companion: { borderTopColor: "#E6E4EA", borderTopWidth: 1, marginTop: 22, paddingTop: 12 },
  companionRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  companionTitle: { color: "#24232A", fontSize: 15, fontWeight: "600" },
  shortcutButton: { alignItems: "center", flexDirection: "row", gap: 5, paddingTop: 12, paddingBottom: 3 },
  shortcutText: { color: "#686670", fontSize: 13, fontWeight: "600" },
});
