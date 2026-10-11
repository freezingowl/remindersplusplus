import Foundation

struct CueReminder: Codable, Sendable {
    var id: String
    var title: String
    var note: String
    var dueAt: String?
    var completed: Bool
    var createdAt: String
    var source: String
    var notificationId: String?
    var endAt: String?

    var dueDate: Date? { dueAt.flatMap(CueDates.parse) }
    var endDate: Date? { endAt.flatMap(CueDates.parse) }
}

enum CueDates {
    static func parse(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    static func string(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    static func label(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.doesRelativeDateFormatting = true
        return formatter.string(from: date)
    }
}

enum CueSelection {
    static let dueWindow: TimeInterval = 60

    // The newest due task takes over; older unfinished tasks remain in the store.
    static func reminder(_ reminders: [CueReminder], now: Date) -> CueReminder? {
        let open = reminders.filter { !$0.completed }
        let due = open.filter { $0.source != "calendar" && ($0.dueDate ?? .distantFuture) <= now && ($0.dueDate ?? .distantPast).addingTimeInterval(dueWindow) > now }
        if let latest = due.sorted(by: { earlier($1, $0) }).first { return latest }
        if let active = open.filter({ $0.source == "calendar" && ($0.dueDate ?? .distantFuture) <= now && ($0.endDate ?? .distantPast) > now }).sorted(by: earlier).first { return active }
        return open.filter { $0.dueDate.map { $0 > now } ?? true }.sorted(by: earlier).first
    }

    static func missed(_ reminders: [CueReminder], now: Date) -> [CueReminder] {
        let current = reminder(reminders, now: now)
        return reminders.filter {
            guard !$0.completed, $0.source != "calendar", let date = $0.dueDate, date <= now else { return false }
            // Give the current task one minute as NOW. An earlier due task is
            // missed as soon as a newer one takes over, even within that minute.
            return $0.id != current?.id || date.addingTimeInterval(dueWindow) <= now
        }.sorted(by: earlier)
    }

    static func nextChange(_ reminders: [CueReminder], now: Date) -> Date? {
        var dates = reminders.filter { !$0.completed }.compactMap(\.dueDate).filter { $0 > now }
        dates += reminders.filter { !$0.completed && $0.source == "calendar" }.compactMap(\.endDate).filter { $0 > now }
        if let selected = reminder(reminders, now: now), selected.source != "calendar", let current = selected.dueDate {
            let missedAt = current.addingTimeInterval(dueWindow)
            if missedAt > now { dates.append(missedAt) }
        }
        return dates.min()
    }

    static func nextDue(_ reminders: [CueReminder], now: Date) -> CueReminder? {
        reminders.filter { !$0.completed && ($0.dueDate ?? .distantPast) > now }
            .sorted(by: earlier).first
    }

    private static func earlier(_ a: CueReminder, _ b: CueReminder) -> Bool {
        let aDate = a.dueDate ?? .distantFuture
        let bDate = b.dueDate ?? .distantFuture
        if aDate != bDate { return aDate < bDate }
        let aCreated = CueDates.parse(a.createdAt) ?? .distantPast
        let bCreated = CueDates.parse(b.createdAt) ?? .distantPast
        return aCreated == bCreated ? a.id < b.id : aCreated < bCreated
    }
}

enum CueCompanionError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let message): return message }
    }
}

struct CueCloudSettings: Sendable {
    let origin: String
    let token: String

    init?(origin: String, token: String) {
        let origin = origin.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URLComponents(string: origin), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              (url.path.isEmpty || url.path == "/"),
              token.range(of: "^[A-Za-z0-9_-]{32,256}$", options: .regularExpression) != nil else { return nil }
        self.origin = origin.hasSuffix("/") ? String(origin.dropLast()) : origin
        self.token = token
    }

}

struct CueCaptureResult: Sendable {
    let remindersJSON: String
    let reply: String
}

struct CueTimeRange: Equatable, Sendable {
    let start: Date
    let end: Date
}

enum CueAvailability {
    static func free(in window: CueTimeRange, busy: [CueTimeRange]) -> [CueTimeRange] {
        guard window.end > window.start else { return [] }
        let clipped = busy.map { CueTimeRange(start: max($0.start, window.start), end: min($0.end, window.end)) }
            .filter { $0.end > $0.start }.sorted { $0.start < $1.start }
        var cursor = window.start
        var result: [CueTimeRange] = []
        for interval in clipped {
            if interval.start > cursor { result.append(.init(start: cursor, end: interval.start)) }
            cursor = max(cursor, interval.end)
        }
        if cursor < window.end { result.append(.init(start: cursor, end: window.end)) }
        return result
    }
}
