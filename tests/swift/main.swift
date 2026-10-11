import Foundation

let now = CueDates.parse("2026-10-11T10:00:00+05:30")!
func task(_ id: String, minutes: Double?, completed: Bool = false) -> CueReminder {
    CueReminder(id: id, title: id, note: "", dueAt: minutes.map { CueDates.string(now.addingTimeInterval($0 * 60)) },
                completed: completed, createdAt: "2026-10-11T00:00:00Z", source: "text")
}
func selected(_ reminders: [CueReminder], at time: Date = now) -> String? {
    CueSelection.reminder(reminders, now: time)?.id
}
func expect(_ condition: Bool, _ message: String) {
    guard condition else { fatalError(message) }
}

expect(selected([]) == nil, "Empty sessions have no reminder")
expect(selected([task("new", minutes: 5), task("previous", minutes: 30)]) == "new", "Show the earliest upcoming task after adding it")
expect(selected([task("newDue", minutes: -0.5), task("previousDue", minutes: -5)]) == "newDue", "The newer due task replaces an older overdue one")
expect(selected([task("due", minutes: 0), task("future", minutes: 30)]) == "due", "Due tasks take priority at the deadline")
expect(selected([task("completed", minutes: -5, completed: true), task("next", minutes: 10)]) == "next", "Completing the shown task reveals the next open one")
expect(CueSelection.nextDue([task("untimed", minutes: nil), task("late", minutes: 30), task("first", minutes: 5), task("done", minutes: 1, completed: true)], now: now)?.id == "first", "Only the earliest future incomplete task is preloaded")
expect(CueDates.parse("2026-10-11T10:00:00.000+05:30") == CueDates.parse("2026-10-11T04:30:00Z"), "Fractional ISO dates and timezone offsets represent the same instant")
let pair = [task("first", minutes: 2), task("second", minutes: 3)]
expect(selected(pair, at: now.addingTimeInterval(120)) == "first", "First task is current at two minutes")
expect(selected(pair, at: now.addingTimeInterval(180)) == "second", "Second task takes over at three minutes")
expect(CueSelection.missed(pair, now: now.addingTimeInterval(180)).map(\.id) == ["first"], "The first unfinished reminder is counted as missed")
expect(CueSelection.missed([task("now", minutes: 0)], now: now).isEmpty, "A newly due task gets one minute before becoming missed")
expect(CueSelection.missed([task("now", minutes: 0)], now: now.addingTimeInterval(60)).count == 1, "An unfinished task becomes missed after a minute")
expect(CueSelection.missed([task("done", minutes: -10, completed: true), task("untimed", minutes: nil)], now: now).isEmpty, "Completed and untimed tasks are never missed")
expect(CueSelection.nextChange(pair, now: now) == now.addingTimeInterval(120), "Refresh at the earliest deadline")
expect(selected([task("missed", minutes: -5), task("future", minutes: 10)]) == "future", "Upcoming reminders remain visible after the due window")
struct PushDate: Decodable { let dueAt: Date }
let pushDate = try! JSONDecoder().decode(PushDate.self, from: Data("{\"dueAt\":813133800}".utf8))
expect(pushDate.dueAt == CueDates.parse("2026-10-08T06:30:00Z"), "APNs content-state dates use Foundation's 2001 epoch")
var later = task("later", minutes: 0)
later.createdAt = "2026-10-11T00:00:00.500Z"
expect(selected([later, task("earlier", minutes: 0)]) == "later", "Fractional creation timestamps are ranked chronologically at equal deadlines")
print("17 selection scenarios passed")

let token = "demo-client-token-at-least-32-characters"
let installed = CueCloudSettings(origin: "https://cue.example/", token: token)
expect(installed?.origin == "https://cue.example", "Bundled settings work with no saved preferences or JS hydration")
expect(installed?.token == token, "Keep the configured token paired with its origin")
expect(CueCloudSettings(origin: "", token: "") == nil, "Missing build settings are rejected")
expect(CueCloudSettings(origin: "http://cue.example", token: token) == nil, "Use HTTPS for native requests")
expect(CueCloudSettings(origin: "https://cue.example/path", token: token) == nil, "Only a Worker origin is accepted")
expect(CueCloudSettings(origin: "https://user@cue.example", token: token) == nil, "Reject credentials in the Worker URL")
print("6 cloud configuration scenarios passed")
