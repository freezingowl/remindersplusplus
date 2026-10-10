import Foundation

let now = CueDates.parse("2026-10-11T10:00:00+05:30")!
func task(_ id: String, minutes: Double?, completed: Bool = false) -> CueReminder {
    CueReminder(id: id, title: id, note: "", dueAt: minutes.map { CueDates.string(now.addingTimeInterval($0 * 60)) },
                completed: completed, createdAt: "2026-10-11T00:00:00Z", source: "text")
}
func selected(_ reminders: [CueReminder], pinned: String? = nil, at time: Date = now) -> String? {
    CueSelection.reminder(reminders, preferredID: pinned, now: time)?.id
}
func expect(_ condition: Bool, _ message: String) {
    guard condition else { fatalError(message) }
}

expect(selected([], pinned: "gone") == nil, "Empty sessions have no reminder")
expect(selected([task("new", minutes: 5), task("previous", minutes: 30)], pinned: "previous") == "previous", "Adding a future task must restore the previous upcoming card")
expect(selected([task("newDue", minutes: -1), task("previousDue", minutes: -5)], pinned: "previousDue") == "previousDue", "A due card survives capture of another task")
expect(selected([task("due", minutes: 0), task("future", minutes: 30)], pinned: "future") == "due", "Due tasks take priority at the deadline")
expect(selected([task("completed", minutes: -5, completed: true), task("next", minutes: 10)], pinned: "completed") == "next", "Completing the shown task reveals the next open one")
expect(CueSelection.nextDue([task("untimed", minutes: nil), task("late", minutes: 30), task("first", minutes: 5), task("done", minutes: 1, completed: true)], now: now)?.id == "first", "Only the earliest future incomplete task is preloaded")
expect(CueDates.parse("2026-10-11T10:00:00.000+05:30") == CueDates.parse("2026-10-11T04:30:00Z"), "Fractional ISO dates and timezone offsets represent the same instant")
print("7 selection scenarios passed")
