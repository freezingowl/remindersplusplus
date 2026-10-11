import Foundation

struct CueAnswerRow: Codable, Hashable, Sendable {
    var time: String
    var title: String
    var kind: String
}

struct CueCalendarAnswer: Codable, Hashable, Sendable {
    var title: String
    var dateLabel: String
    var rows: [CueAnswerRow]
    var footer: String

    var previewRows: [CueAnswerRow] { Array(rows.prefix(3)) }
    var previewFooter: String {
        guard rows.count > 3 else { return footer }
        let scope = footer.hasPrefix("Checked ") ? String(footer.split(separator: "·")[0]).trimmingCharacters(in: .whitespaces) + " · " : ""
        return scope + "+\(rows.count - 3) more · Tap to view"
    }
    var text: String {
        ([title + " · " + dateLabel] + rows.map { "\($0.time) — \($0.title)" } + [footer])
            .filter { !$0.isEmpty }.joined(separator: "\n")
    }
}

enum CueEventAvailability: Sendable { case free, busy, unsupported }

struct CueCalendarEntry: Sendable {
    var title: String
    var start: Date
    var end: Date
    var allDay: Bool
    var subscribed: Bool
    var birthday: Bool
    var availability: CueEventAvailability
    var declined: Bool

    // Unknown availability is not the same as explicitly busy. Subscribed
    // all-day dates/birthdays are informational; personal all-day events and
    // subscribed events explicitly marked busy still reserve time.
    var informational: Bool { allDay && (birthday || (subscribed && availability == .unsupported)) }
    var blocksTime: Bool { !declined && !informational && availability != .free }
}

enum CueCalendarAnswers {
    static func make(entries: [CueCalendarEntry], window: CueTimeRange, availability: Bool,
                     searchTitle: String = "", now: Date = Date(), calendar: Calendar = .current,
                     locale: Locale = .current) -> CueCalendarAnswer {
        func format(_ date: Date, template: String) -> String {
            let formatter = DateFormatter()
            formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.locale = locale
            formatter.setLocalizedDateFormatFromTemplate(template)
            return formatter.string(from: date)
        }
        func time(_ date: Date) -> String {
            format(date, template: calendar.component(.minute, from: date) == 0 ? "j" : "jm")
        }
        let sameDay = calendar.isDate(window.start, inSameDayAs: window.end.addingTimeInterval(-1))
        func interval(_ start: Date, _ end: Date) -> String {
            if sameDay && start == calendar.startOfDay(for: start)
                && end == calendar.date(byAdding: .day, value: 1, to: start) { return "All day" }
            let formatter = DateIntervalFormatter()
            formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.locale = locale
            let wholeHours = calendar.component(.minute, from: start) == 0 && calendar.component(.minute, from: end) == 0
            let sameDate = sameDay && calendar.isDate(start, inSameDayAs: window.start)
                && calendar.isDate(start, inSameDayAs: end.addingTimeInterval(-1))
            formatter.dateTemplate = sameDate ? (wholeHours ? "j" : "jm") : "MMM d jm"
            return formatter.string(from: start, to: end)
        }
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
        let day = sameDay && calendar.isDate(window.start, inSameDayAs: tomorrow) ? "Tomorrow"
            : sameDay && calendar.isDate(window.start, inSameDayAs: now) ? "Today" : "Your schedule"
        let dateLabel = sameDay ? format(window.start, template: "EEE MMM d")
            : format(window.start, template: "MMM d") + "–" + format(window.end.addingTimeInterval(-1), template: "MMM d")
        let visible = entries.filter { !$0.declined && $0.end > window.start && $0.start < window.end }
        if availability {
            let busy = visible.filter(\.blocksTime).sorted { $0.start < $1.start }
            let free = CueAvailability.free(in: window, busy: busy.map { .init(start: $0.start, end: $0.end) })
            let title: String
            if free.isEmpty { title = "No free time" }
            else if busy.isEmpty { title = day == "Your schedule" ? "You're free" : "You're free \(day.lowercased())" }
            else if sameDay && free.count == 1 && free[0].end == window.end { title = "Free after \(time(free[0].start))" }
            else if sameDay && free.count == 1 && free[0].start == window.start { title = "Free until \(time(free[0].end))" }
            else { title = "You have free time" }
            let rows = free.map { CueAnswerRow(time: interval($0.start, $0.end), title: "Free", kind: "free") }
                + busy.map { CueAnswerRow(time: $0.allDay ? "All day" : interval(max($0.start, window.start), min($0.end, window.end)),
                    title: String($0.title.prefix(120)), kind: "busy") }
            let informational = visible.filter(\.informational).count
            let note = informational > 0 ? " · \(informational) dates aren't busy" : ""
            return .init(title: title, dateLabel: dateLabel, rows: rows,
                         footer: "Checked \(interval(window.start, window.end))\(note)")
        }
        let matched = searchTitle.isEmpty ? visible : visible.filter {
            $0.title.range(of: searchTitle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
        // Show actual appointments before holiday/birthday dates, not hidden
        // behind midnight entries. The full answer retains every result.
        let ordered = matched.sorted {
            if $0.informational != $1.informational { return !$0.informational }
            return $0.start < $1.start
        }
        let rows = ordered.map { entry in
            CueAnswerRow(time: entry.allDay ? (sameDay ? "All day" : format(entry.start, template: "MMM d") + " · All day")
                : interval(entry.start, entry.end), title: String(entry.title.prefix(120)),
                kind: entry.informational ? "info" : "event")
        }
        return .init(title: day, dateLabel: dateLabel, rows: rows,
            footer: rows.isEmpty ? (searchTitle.isEmpty ? "No events in this date range" : "No matching events") : "\(rows.count) \(rows.count == 1 ? "event" : "events") · Tap for full agenda")
    }
}
