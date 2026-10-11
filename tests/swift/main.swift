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

func event(_ id: String, start: Double, end: Double) -> CueReminder {
    var reminder = task(id, minutes: start)
    reminder.source = "calendar"
    reminder.endAt = CueDates.string(now.addingTimeInterval(end * 60))
    return reminder
}
let calendarEvents = [event("cal_first", start: 2, end: 10), event("cal_second", start: 20, end: 40)]
expect(selected(calendarEvents) == "cal_first", "Upcoming Calendar event is visible")
expect(selected(calendarEvents, at: now.addingTimeInterval(5 * 60)) == "cal_first", "Event stays current for its full duration")
expect(selected(calendarEvents, at: now.addingTimeInterval(10 * 60)) == "cal_second", "Ended event hands off to the next event")
expect(CueSelection.missed(calendarEvents, now: now.addingTimeInterval(50 * 60)).isEmpty, "Calendar events never become missed reminders")
expect(selected(calendarEvents + [task("due", minutes: 5)], at: now.addingTimeInterval(5 * 60)) == "due", "A newly due reminder still takes priority")
expect(CueSelection.nextChange(calendarEvents, now: now.addingTimeInterval(5 * 60)) == now.addingTimeInterval(10 * 60), "Refresh when an active event ends")
func range(_ start: Double, _ end: Double) -> CueTimeRange {
    .init(start: now.addingTimeInterval(start * 60), end: now.addingTimeInterval(end * 60))
}
let window = range(0, 120)
expect(CueAvailability.free(in: window, busy: []).count == 1, "Empty Calendar is free throughout the requested window")
expect(CueAvailability.free(in: window, busy: [range(-30, 30), range(15, 50), range(50, 70), range(100, 180)]) == [range(70, 100)], "Clip, merge overlapping and touching busy intervals")
expect(CueAvailability.free(in: window, busy: [range(-1440, 1440)]).isEmpty, "All-day events block their overlapping window")
expect(CueAvailability.free(in: window, busy: [range(180, 200)]) == [window], "Events outside the range do not block free time")
expect(CueAvailability.free(in: range(0, 0), busy: []).isEmpty, "Empty range cannot create a fabricated free interval")
let legacy = try! JSONDecoder().decode(CueReminder.self, from: Data("{\"id\":\"old\",\"title\":\"Old task\",\"note\":\"\",\"completed\":false,\"createdAt\":\"2026-10-11T00:00:00Z\",\"source\":\"text\"}".utf8))
expect(legacy.endAt == nil, "Existing reminders decode without a Calendar end field")
print("12 Calendar and availability scenarios passed")

var testCalendar = Calendar(identifier: .gregorian)
testCalendar.timeZone = TimeZone(identifier: "Asia/Kolkata")!
let testLocale = Locale(identifier: "en_US")
func date(_ hour: Int) -> Date { CueDates.parse(String(format: "2026-10-12T%02d:00:00+05:30", hour))! }
func entry(_ title: String, start: Int, end: Int, allDay: Bool = false, subscribed: Bool = false,
           birthday: Bool = false, availability: CueEventAvailability = .unsupported, declined: Bool = false) -> CueCalendarEntry {
    .init(title: title, start: date(start), end: end == 24 ? date(0).addingTimeInterval(86400) : date(end),
          allDay: allDay, subscribed: subscribed, birthday: birthday, availability: availability, declined: declined)
}
let hackathon = entry("Hackathon", start: 9, end: 10)
let holiday = entry("Columbus Day", start: 0, end: 24, allDay: true, subscribed: true)
let secondHoliday = entry("Indigenous Peoples' Day", start: 0, end: 24, allDay: true, subscribed: true)
let workday = CueTimeRange(start: date(9), end: date(18))
func answer(_ entries: [CueCalendarEntry], availability: Bool = true, window: CueTimeRange = workday) -> CueCalendarAnswer {
    CueCalendarAnswers.make(entries: entries, window: window, availability: availability, now: now, calendar: testCalendar, locale: testLocale)
}
expect(!holiday.blocksTime && holiday.informational, "Subscribed all-day holidays with unsupported availability do not block time")
expect(hackathon.blocksTime, "Unsupported availability on a personal event remains busy")
let fixed = answer([holiday, secondHoliday, hackathon])
expect(fixed.title.replacingOccurrences(of: "\u{202F}", with: " ") == "Free after 10 AM", "The reported holiday + 9–10 AM Hackathon case gives a natural answer: \(fixed.title)")
expect(fixed.rows.count == 2 && fixed.rows[0].kind == "free" && fixed.rows[1].title == "Hackathon", "Free time and actual commitment are separate readable rows")
expect(fixed.footer.contains("2 dates aren't busy") && fixed.footer.contains("Checked"), "Disclose the informational exclusion and queried window")
expect(answer([entry("Away", start: 0, end: 24, allDay: true)]).title == "No free time", "Personal all-day commitments still block the whole day")
expect(entry("Conference", start: 0, end: 24, allDay: true, subscribed: true, availability: .busy).blocksTime, "Explicitly busy subscribed all-day events still block time")
expect(entry("Subscribed class", start: 9, end: 10, subscribed: true).blocksTime, "Timed subscribed events still block time")
expect(!entry("Birthday", start: 0, end: 24, allDay: true, birthday: true).blocksTime, "Birthday dates are informational")
expect(!entry("Free event", start: 9, end: 10, availability: .free).blocksTime, "Honor an explicitly free event")
expect(answer([entry("Declined", start: 9, end: 18, declined: true)]).rows.count == 1, "Declined events do not appear as busy commitments")
expect(answer([]).title == "You're free tomorrow", "An empty Calendar answers the requested day directly")
let agenda = answer([holiday, secondHoliday, hackathon], availability: false, window: .init(start: date(0), end: date(0).addingTimeInterval(86400)))
expect(agenda.rows.map(\.title).first == "Hackathon" && agenda.rows.count == 3 && agenda.rows[1].time == "All day", "Agenda prioritizes timed appointments while retaining holiday rows")
let crowded = answer((0..<8).map { entry("Event \($0)", start: 9 + $0, end: 10 + $0) }, availability: false)
expect(crowded.rows.count == 8 && crowded.headline.contains("+7 more events"), "Keep every event locally and summarize the rest without a table")
expect((try! JSONDecoder().decode(CueCalendarAnswer.self, from: JSONEncoder().encode(crowded))) == crowded, "The full local answer round-trips for a card tap")
expect(answer([hackathon, entry("Meeting", start: 14, end: 15)]).rows.filter { $0.kind == "free" }.count == 2, "Multiple free intervals remain separate rows")
expect(answer([], window: .init(start: date(0), end: date(0).addingTimeInterval(86400))).rows[0].time == "All day", "A full-day window does not display a misleading midnight-to-midnight time")
let multiDay = answer([], window: .init(start: date(9), end: date(18).addingTimeInterval(86400)))
expect(multiDay.rows[0].time.contains("Oct") && multiDay.dateLabel.contains("13"), "A multi-day answer labels dates as well as times")
let manyGaps = answer([hackathon, entry("Meeting", start: 12, end: 13), entry("Call", start: 15, end: 16)])
expect(manyGaps.conciseDetail.contains("Checked") && manyGaps.headline.contains("more slots"), "A brief answer still discloses the availability window and additional gaps")
let longAgenda = answer((0..<5).map { entry(String(repeating: "😀", count: 120), start: 9 + $0, end: 10 + $0) }, availability: false)
let snapshot: [String: Any] = ["phase": "answer", "title": longAgenda.headline, "detail": longAgenda.conciseDetail, "answerDate": longAgenda.dateLabel,
    "nextTitle": String(repeating: "😀", count: 120), "nextDetail": "12 Oct 2026 at 9 AM", "nextID": String(repeating: "a", count: 68), "nextPhase": "event", "nextTransitionAt": 813133800]
expect((try! JSONSerialization.data(withJSONObject: snapshot)).count < 4096, "Worst-case Unicode titles fit the brief ActivityKit answer payload")
print("20 Calendar answer scenarios passed")

func plain(_ text: String) -> String {
    text.replacingOccurrences(of: "\u{202F}", with: " ").replacingOccurrences(of: "\u{2009}", with: "")
}
expect(plain(fixed.headline) == "Free after 10 AM tomorrow.", "The main text answers the reported availability question directly: \(fixed.headline)")
expect(plain(fixed.conciseDetail).contains("9") && fixed.conciseDetail.contains("6"), "The small scope note only identifies the checked hours")
expect(plain(agenda.headline) == "Hackathon, 9–10 AM tomorrow.", "The main agenda is one short appointment answer, not holiday clutter: \(agenda.headline)")
expect(crowded.headline.contains("Event 0") && crowded.headline.contains("+7 more events"), "Multiple appointments get a simple remaining count")
expect(answer([], availability: false).headline == "Nothing scheduled tomorrow.", "Empty agendas have a useful main answer")
expect(answer([holiday, secondHoliday], availability: false).headline.contains("Columbus Day") && answer([holiday, secondHoliday], availability: false).headline.contains("+1 more date"), "Informational-only agendas remain visible in the short answer")
expect(answer([entry("Away", start: 0, end: 24, allDay: true)]).headline == "No free time tomorrow.", "A genuinely blocked day still gives the correct short answer")
expect(answer([], window: .init(start: date(0), end: date(0).addingTimeInterval(86400))).headline == "You're free all day tomorrow.", "Full-day freedom is stated simply")
let middleGap = answer([entry("Morning", start: 9, end: 11), entry("Afternoon", start: 13, end: 18)])
expect(plain(middleGap.headline) == "Free 11 AM–1 PM tomorrow.", "A single middle gap names its actual hours: \(middleGap.headline)")
let oldAnswer = try! JSONDecoder().decode(CueCalendarAnswer.self, from: Data("{\"title\":\"Tomorrow\",\"dateLabel\":\"Mon, Oct 12\",\"rows\":[],\"footer\":\"\"}".utf8))
expect(oldAnswer.headline == "Tomorrow" && oldAnswer.conciseDetail.isEmpty, "Previously saved full answers decode without summary fields")
expect(CueAnswerText.primary(title: "Cue", detail: "The capital of India is New Delhi.") == "The capital of India is New Delhi.", "Promote the actual answer in old generic snapshots too")
expect(CueAnswerText.primary(title: "  A short\nanswer.  ", detail: "unused") == "A short answer.", "New replies use their main text with normalized whitespace")
print("12 simple answer scenarios passed")
