import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CalendarAnswer } from "../lib/companion";

export function CalendarAnswerSheet({ answer, onClose }: { answer: CalendarAnswer | null; onClose: () => void }) {
  return <Modal animationType="slide" presentationStyle="pageSheet" visible={answer !== null} onRequestClose={onClose}>
    <SafeAreaView style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.brand}>cue · Apple Calendar</Text>
        <Pressable accessibilityLabel="Close Calendar answer" accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Ionicons name="close" color="#333541" size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>{answer?.dateLabel}</Text>
        <Text style={styles.title}>{answer?.title}</Text>
        <Text style={styles.footer}>{answer?.footer}</Text>
        {answer?.rows.map((row, index) => <View key={index} style={[styles.row, row.kind === "free" && styles.freeRow]} accessibilityLabel={`${row.time}, ${row.title}`}>
          <View style={[styles.mark, row.kind === "free" ? styles.freeMark : row.kind === "info" ? styles.infoMark : styles.eventMark]} />
          <View style={styles.rowBody}>
            <Text style={styles.time}>{row.time}{row.kind === "info" ? " · Informational" : row.kind === "busy" ? " · Busy" : ""}</Text>
            <Text style={styles.eventTitle}>{row.title}</Text>
          </View>
          {row.kind === "free" ? <Ionicons name="checkmark-circle-outline" color="#267357" size={24} /> : null}
        </View>)}
        <Text style={styles.note}>Based on your synced Calendar when you asked. Ask again to refresh after changing an event.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: "#F5F6FA" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 12 },
  brand: { color: "#676B79", fontSize: 13, fontWeight: "600" },
  close: { padding: 10, backgroundColor: "#E9EBF1", borderRadius: 24 },
  content: { padding: 24, paddingBottom: 44, gap: 12 },
  date: { color: "#676B79", fontSize: 15 },
  title: { color: "#232632", fontSize: 30, fontWeight: "700", letterSpacing: -0.8 },
  footer: { color: "#555B69", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, backgroundColor: "#FFFFFF", borderRadius: 20 },
  freeRow: { backgroundColor: "#E8F4EE" },
  mark: { width: 4, height: 36, borderRadius: 2 },
  freeMark: { backgroundColor: "#378265" },
  infoMark: { backgroundColor: "#A4A9B5" },
  eventMark: { backgroundColor: "#7776C9" },
  rowBody: { flex: 1, gap: 5 },
  time: { color: "#626878", fontSize: 13, fontWeight: "500" },
  eventTitle: { color: "#232632", fontSize: 18, fontWeight: "600", lineHeight: 24 },
  note: { color: "#757A87", fontSize: 13, lineHeight: 20, marginTop: 10 },
});
