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

    var dueDate: Date? { dueAt.flatMap(CueDates.parse) }
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
    // Preserve the card interrupted by capture. A due task takes precedence.
    static func reminder(_ reminders: [CueReminder], preferredID: String?, now: Date) -> CueReminder? {
        let open = reminders.filter { !$0.completed }
        let due = open.filter { ($0.dueDate ?? .distantFuture) <= now }
        if let pinned = due.first(where: { $0.id == preferredID }) { return pinned }
        if let first = due.sorted(by: earlier).first { return first }
        if let pinned = open.first(where: { $0.id == preferredID }) { return pinned }
        return open.sorted(by: earlier).first
    }

    static func nextDue(_ reminders: [CueReminder], now: Date) -> CueReminder? {
        reminders.filter { !$0.completed && ($0.dueDate ?? .distantPast) > now }
            .sorted(by: earlier).first
    }

    private static func earlier(_ a: CueReminder, _ b: CueReminder) -> Bool {
        let aDate = a.dueDate ?? .distantFuture
        let bDate = b.dueDate ?? .distantFuture
        return aDate == bDate ? a.createdAt < b.createdAt : aDate < bDate
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
    let reminder: CueReminder
    let remindersJSON: String
}
