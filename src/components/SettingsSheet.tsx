import { useState } from "react";
import { checkCloudConnection } from "../lib/cloud";
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

import { LiquidSurface } from "./LiquidSurface";

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
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState("");
  async function checkConnection(): Promise<void> {
    setChecking(true);
    try {
      await checkCloudConnection();
      setConnection("Connected: access token and quota database verified. Try a reminder next.");
    } catch (error) {
      setConnection(error instanceof Error ? error.message : "Couldn’t connect. Please try again.");
    } finally { setChecking(false); }
  }
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
              <Text style={styles.eyebrow}>CUE</Text>
              <Text style={styles.title}>Settings</Text>
            </View>
            <Pressable
              accessibilityLabel="Close settings"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <LiquidSurface isInteractive style={styles.closeGlass}>
                <Ionicons color="#343640" name="close" size={20} />
              </LiquidSurface>
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
                "Install the latest Cue build and check its cloud connection in Settings first. In Shortcuts, create a shortcut with Ask for Input (Text), then Cue → Add Cue reminder. Pass the input into Reminder. In iPhone Settings → Accessibility → Touch → Back Tap, choose that shortcut for Double Tap or Triple Tap. Try it while unlocked first.",
                [{ text: "Close", style: "cancel" }, { text: "Open Shortcuts", onPress: () => { void Linking.openURL("shortcuts://").catch(() => Alert.alert("Open Shortcuts", "Open the Shortcuts app on your iPhone.")); } }],
              )} style={styles.shortcutButton}>
                <Text style={styles.shortcutText}>Set up Back Tap</Text>
                <Ionicons color="#686670" name="arrow-up-right-box" size={15} />
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.description}>
            {cloudConfigured ? "Cloud settings are installed. Check the connection before your first reminder." : "Cloud AI hasn’t been configured in this build yet."}
          </Text>
          <Pressable accessibilityRole="button" disabled={checking || !cloudConfigured} onPress={() => void checkConnection()} style={styles.shortcutButton}>
            <Text style={styles.shortcutText}>{checking ? "Checking connection…" : "Check cloud connection"}</Text>
          </Pressable>
          {connection ? <Text accessibilityLiveRegion="polite" style={styles.securityText}>{connection}</Text> : null}
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
    backgroundColor: "rgba(250, 250, 252, 0.98)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetScroll: { backgroundColor: "transparent", borderTopLeftRadius: 28, borderTopRightRadius: 28, flexGrow: 0, maxHeight: "90%" },
  handle: {
    alignSelf: "center",
    backgroundColor: "#C9CBD3",
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
    color: "#747786",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  title: {
    color: "#282A33",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.65,
    marginTop: 3,
  },
  closeButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  closeGlass: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  description: {
    color: "#5E626F",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 19,
  },
  securityText: {
    color: "#707581",
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  companion: { borderTopColor: "#E2E4E9", borderTopWidth: 1, marginTop: 22, paddingTop: 14 },
  companionRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  companionTitle: { color: "#2D3039", fontSize: 16, fontWeight: "600" },
  shortcutButton: { alignItems: "center", flexDirection: "row", gap: 5, paddingBottom: 3, paddingTop: 13 },
  shortcutText: { color: "#4C6579", fontSize: 13, fontWeight: "700" },
});
