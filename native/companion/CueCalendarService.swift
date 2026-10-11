import EventKit
import Foundation
import CryptoKit

struct CueAssistantPlan: Decodable, Sendable {
    var action: String
    var title: String
    var note: String
    var dueAt: String
    var startAt: String
    var endAt: String
    var allDay: Bool
    var searchTitle: String
    var rangeStart: String
    var rangeEnd: String
    var queryKind: String
    var reply: String
}

struct CueAssistantReply: Sendable {
    var title: String
    var detail: String
    var text: String { detail.isEmpty ? title : "\(title)\n\(detail)" }
}

// Owned and used exclusively by CueCompanionService's actor. Calendar contents
// stay on the phone: the model selects a range, then this tool reads/answers it.
final class CueCalendarService {
    private let store = EKEventStore()
    private let enabledKey = "cue.calendar.enabled"
    var connected: Bool {
        UserDefaults.standard.bool(forKey: enabledKey) && EKEventStore.authorizationStatus(for: .event) == .fullAccess
    }

    func status() -> [String: Any] {
        ["connected": connected, "authorization": String(describing: EKEventStore.authorizationStatus(for: .event))]
    }

    func connect() async throws {
        guard try await store.requestFullAccessToEvents() else {
            throw CueCompanionError.message("Allow full Calendar access for Cue in iPhone Settings to read your events and find free time.")
        }
        store.reset()
        UserDefaults.standard.set(true, forKey: enabledKey)
    }

    func disconnect() { UserDefaults.standard.set(false, forKey: enabledKey) }
    func refresh() { store.reset() }

    private func requireAccess() throws {
        guard connected else {
            throw CueCompanionError.message("Open Cue → Settings → Connect Apple Calendar and allow full access. Reminders still work without Calendar.")
        }
    }

    private func events(start: Date, end: Date) throws -> [EKEvent] {
        try requireAccess()
        guard end > start, end.timeIntervalSince(start) <= 31 * 86400 else {
            throw CueCompanionError.message("Ask about a Calendar window of up to 31 days.")
        }
        let matches = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil))
            .filter { $0.status != .canceled && $0.endDate > start && $0.startDate < end }
            .sorted { $0.startDate < $1.startDate }
        guard matches.count <= 500 else {
            throw CueCompanionError.message("That Calendar window contains too many events. Ask about a shorter date range.")
        }
        return matches
    }

    func upcoming(now: Date) throws -> [CueReminder] {
        guard connected else { return [] }
        // Include events spanning midnight, then discard events that have ended.
        let start = Calendar.current.startOfDay(for: now)
        let end = Calendar.current.date(byAdding: .day, value: 30, to: start)!
        return try events(start: start, end: end).filter { $0.endDate > now }.prefix(128).map { event in
            let key = "\(event.eventIdentifier ?? event.calendarItemIdentifier)|\(event.startDate.timeIntervalSince1970)"
            let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
            return CueReminder(id: "cal_\(digest)", title: String((event.title ?? "Calendar event").prefix(120)),
                note: "", dueAt: CueDates.string(event.startDate), completed: false,
                createdAt: CueDates.string(now), source: "calendar", endAt: CueDates.string(event.endDate))
        }
    }

    func query(_ plan: CueAssistantPlan) throws -> CueAssistantReply {
        guard let start = CueDates.parse(plan.rangeStart), let end = CueDates.parse(plan.rangeEnd) else {
            throw CueCompanionError.message("Include a clear date for your Calendar question.")
        }
        let matches = try events(start: start, end: end)
        let header = "Calendar · \(dayLabel(start))"
        if plan.queryKind == "availability" {
            let busy = matches.filter { event in
                event.availability != .free && !(event.attendees ?? []).contains { $0.isCurrentUser && $0.participantStatus == .declined }
            }.map { CueTimeRange(start: $0.startDate, end: $0.endDate) }
            let free = CueAvailability.free(in: .init(start: start, end: end), busy: busy)
            let multipleDays = !Calendar.current.isDate(start, inSameDayAs: end.addingTimeInterval(-1))
            func label(_ date: Date) -> String { multipleDays ? shortLabel(date) : timeLabel(date) }
            let window = "\(label(start))–\(label(end))"
            let detail = free.isEmpty ? "Busy throughout \(window)." : "Free: " + free.prefix(4).map {
                "\(label($0.start))–\(label($0.end))"
            }.joined(separator: "; ") + (free.count > 4 ? "; +\(free.count - 4) more gaps." : ".")
            return .init(title: header, detail: String((detail + " Based on Calendar, \(window).").prefix(400)))
        }
        let filtered = plan.searchTitle.isEmpty ? matches : matches.filter {
            ($0.title ?? "").range(of: plan.searchTitle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
        let detail = filtered.isEmpty ? "No \(plan.searchTitle.isEmpty ? "events" : "matching events") in this date range." :
            filtered.prefix(3).map { event in
                "\(event.isAllDay ? dayLabel(event.startDate) + " all day" : shortLabel(event.startDate)): \(String((event.title ?? "Calendar event").prefix(70)))"
            }.joined(separator: " · ") + (filtered.count > 3 ? " · +\(filtered.count - 3) more events." : "")
        return .init(title: header, detail: String(detail.prefix(400)))
    }

    func save(_ plan: CueAssistantPlan) throws -> CueAssistantReply {
        try requireAccess()
        guard let start = CueDates.parse(plan.startAt) else {
            throw CueCompanionError.message("Include an exact event date and time.")
        }
        let event: EKEvent
        let creating = plan.action == "create_event"
        if creating {
            guard !plan.title.isEmpty, plan.title.count <= 120, let calendar = store.defaultCalendarForNewEvents,
                  calendar.allowsContentModifications else {
                throw CueCompanionError.message("Choose a writable default Calendar in iPhone Settings first.")
            }
            event = EKEvent(eventStore: store)
            event.calendar = calendar
            event.title = plan.title
            event.notes = plan.note
        } else {
            guard plan.action == "update_event", !plan.searchTitle.isEmpty,
                  let rangeStart = CueDates.parse(plan.rangeStart), let rangeEnd = CueDates.parse(plan.rangeEnd) else {
                throw CueCompanionError.message("Name the event and its original date to move it.")
            }
            let matches = try events(start: rangeStart, end: rangeEnd).filter {
                ($0.title ?? "").range(of: plan.searchTitle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
            }
            guard matches.count == 1, let match = matches.first else {
                return .init(title: "Which event?", detail: matches.isEmpty
                    ? "No matching event. Include its name and original date."
                    : "Found \(matches.count) matches. Include the event’s original date and time.")
            }
            guard match.calendar.allowsContentModifications else {
                throw CueCompanionError.message("That Calendar is read-only. Choose an event in a writable Calendar.")
            }
            guard (match.attendees ?? []).isEmpty else {
                throw CueCompanionError.message("Open Calendar to move an event with guests so you can review its invitations.")
            }
            event = match
        }
        let duration = creating ? 3600 : event.endDate.timeIntervalSince(event.startDate)
        let end = CueDates.parse(plan.endAt) ?? (plan.allDay
            ? Calendar.current.date(byAdding: .day, value: 1, to: start)!
            : start.addingTimeInterval(max(duration, 60)))
        guard end > start, end.timeIntervalSince(start) <= 31 * 86400,
              start > Date() || (plan.allDay && Calendar.current.isDateInToday(start)) else {
            throw CueCompanionError.message("Choose a future event with an end after its start.")
        }
        if creating && plan.allDay && (Calendar.current.startOfDay(for: start) != start || Calendar.current.startOfDay(for: end) != end) {
            throw CueCompanionError.message("All-day events must start and end at local midnight.")
        }
        if creating, let duplicate = try events(start: start, end: end).first(where: {
            $0.title == plan.title && $0.startDate == start && $0.endDate == end && $0.calendar.calendarIdentifier == event.calendar.calendarIdentifier
        }) {
            return .init(title: "Already in Calendar", detail: "\(duplicate.title ?? plan.title) · \(CueDates.label(start))")
        }
        event.startDate = start
        event.endDate = end
        // When moving an occurrence, preserve its original all-day status.
        if creating { event.isAllDay = plan.allDay }
        event.timeZone = TimeZone.current
        try store.save(event, span: .thisEvent, commit: true)
        return .init(title: creating ? "Added to Calendar" : "Moved in Calendar",
            detail: "\(event.title ?? plan.title) · \(CueDates.label(start))\(creating && plan.endAt.isEmpty && !plan.allDay ? " · 1 hour" : "")")
    }

    private func dayLabel(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.dateFormat = "EEE, d MMM"; return formatter.string(from: date)
    }
    private func timeLabel(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.dateStyle = .none; formatter.timeStyle = .short; return formatter.string(from: date)
    }
    private func shortLabel(_ date: Date) -> String { "\(dayLabel(date)) \(timeLabel(date))" }
}
