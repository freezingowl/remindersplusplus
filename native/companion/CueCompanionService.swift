import ActivityKit
import Foundation
import Security
import UIKit
import UserNotifications

actor CueCompanionService {
    static let shared = CueCompanionService()
    static let changed = Notification.Name("CueRemindersChanged")
    private let enabledKey = "cue.companion.enabled"
    private let reviewingKey = "cue.companion.reviewing"
    private let reviewAnchorKey = "cue.companion.reviewAnchor"
    private var deadlineTask: Task<Void, Never>?
    private var pushObservers: [String: Task<Void, Never>] = [:]
    private var pushStatus = "Automatic updates need Apple push setup."
    private var isCapturing = false
    private var revision = 0
    private var feedbackUntil: Date?
    private let calendar = CueCalendarService()

    func calendarStatus() -> [String: Any] { calendar.status() }
    func setCalendarConnected(_ connected: Bool) async throws -> [String: Any] {
        if connected { try await calendar.connect() } else { calendar.disconnect() }
        if !isCapturing { try await restore() }
        return calendar.status()
    }
    func calendarDidChange() async {
        guard !isCapturing else { return }
        calendar.refresh()
        try? await refresh()
    }

    private func timeline() throws -> [CueReminder] {
        let reminders = try load()
        // A revoked Calendar permission must not interrupt ordinary reminders.
        return reminders + ((try? calendar.upcoming(now: Date())) ?? [])
    }

    private var storeURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Cue/reminders.json")
    }

    func load() throws -> [CueReminder] {
        guard FileManager.default.fileExists(atPath: storeURL.path) else { return [] }
        return try JSONDecoder().decode([CueReminder].self, from: Data(contentsOf: storeURL))
    }

    func loadJSON() throws -> String? {
        guard FileManager.default.fileExists(atPath: storeURL.path) else { return nil }
        try silenceLegacyAlerts()
        return try json(load())
    }

    private func silenceLegacyAlerts() throws {
        var reminders = try load()
        let ids = reminders.compactMap(\.notificationId)
        guard !ids.isEmpty else { return }
        // Cancel only alerts associated with Cue's saved reminders, preserving tasks.
        for index in reminders.indices { reminders[index].notificationId = nil }
        try write(reminders)
        for id in ids { cancel(id) }
    }

    func seed(_ input: String) throws -> String {
        if !FileManager.default.fileExists(atPath: storeURL.path) {
            try write(JSONDecoder().decode([CueReminder].self, from: Data(input.utf8)))
        }
        return try json(load())
    }

    private func json(_ reminders: [CueReminder]) throws -> String {
        String(decoding: try JSONEncoder().encode(reminders), as: UTF8.self)
    }

    private func write(_ reminders: [CueReminder]) throws {
        try FileManager.default.createDirectory(at: storeURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(reminders).write(to: storeURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        NotificationCenter.default.post(name: Self.changed, object: nil)
    }

    func status() -> [String: Any] {
        ["enabled": UserDefaults.standard.bool(forKey: enabledKey),
         "allowed": ActivityAuthorizationInfo().areActivitiesEnabled,
         "active": Activity<CueActivityAttributes>.activities.contains { $0.activityState == .active || $0.activityState == .stale },
         "pushStatus": pushStatus]
    }

    func setEnabled(_ enabled: Bool) async throws -> [String: Any] {
        if enabled {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                throw CueCompanionError.message("Allow Live Activities for Cue in iPhone Settings.")
            }
            try silenceLegacyAlerts()
            UserDefaults.standard.set(true, forKey: enabledKey)
            try await restore(startIfNeeded: true)
        } else {
            revision += 1
            deadlineTask?.cancel()
            UserDefaults.standard.set(false, forKey: enabledKey)
            for activity in Activity<CueActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
                await syncPush(activity, stop: true)
                pushObservers.removeValue(forKey: activity.id)?.cancel()
            }
        }
        return status()
    }

    private func restingState() throws -> CueActivityAttributes.ContentState {
        let reminders = try timeline()
        let now = Date()
        let state = displayState(reminders, now: now)
        var result = state
        if let transition = CueSelection.nextChange(reminders, now: now) {
            let next = displayState(reminders, now: transition)
            result.nextTitle = next.title
            result.nextID = next.reminderID
            result.nextDueAt = next.dueAt
            result.nextPhase = next.phase
            result.nextDetail = next.detail
            result.nextMissedCount = next.missedCount
            result.nextReviewingMissed = next.reviewingMissed
            result.nextTransitionAt = transition
        }
        return result
    }

    private func displayState(_ reminders: [CueReminder], now: Date) -> CueActivityAttributes.ContentState {
        let current = CueSelection.reminder(reminders, now: now)
        let missed = CueSelection.missed(reminders, now: now)
        let reviewingID = UserDefaults.standard.string(forKey: reviewingKey)
        let anchor = UserDefaults.standard.string(forKey: reviewAnchorKey)
        let reviewing = reviewingID != nil && current?.id == anchor && !missed.isEmpty
        let selected = reviewing ? missed.first(where: { $0.id == reviewingID }) ?? missed.first : current
        let isMissed = missed.contains { $0.id == selected?.id }
        let phase: String
        if isMissed { phase = "missed" }
        else if selected?.source == "calendar" { phase = selected?.dueDate.map { $0 <= now ? "event_now" : "event" } ?? "event" }
        else { phase = selected?.dueDate.map { $0 <= now ? "due" : "ready" } ?? "ready" }
        return .init(phase: phase,
            title: selected?.title ?? "Nothing waiting",
            detail: selected?.dueDate.map(CueDates.label) ?? (selected == nil ? "" : "No time set"),
            reminderID: selected?.id, dueAt: selected?.dueDate,
            missedCount: missed.count, reviewingMissed: reviewing)
    }

    private func publish(_ state: CueActivityAttributes.ContentState, startIfNeeded: Bool = false) async throws {
        guard UserDefaults.standard.bool(forKey: enabledKey) else { return }
        // The upcoming snapshot becomes outdated at its next deadline. The widget
        // can then render the preloaded due candidate; this never executes app code.
        let staleDate = ["processing", "saved", "error"].contains(state.phase) ? nil : state.nextTransitionAt
        let content = ActivityContent(state: state, staleDate: staleDate)
        let activity: Activity<CueActivityAttributes>
        if let existing = Activity<CueActivityAttributes>.activities.first(where: { $0.activityState == .active || $0.activityState == .stale }) {
            activity = existing
            await activity.update(content)
        } else if startIfNeeded && ActivityAuthorizationInfo().areActivitiesEnabled {
            let sessionID = UUID().uuidString
            activity = try Activity.request(attributes: CueActivityAttributes(sessionID: sessionID), content: content, pushType: .token)
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "cue.activity.start.\(sessionID)")
        } else { return }
        watchPushToken(activity)
        if !["processing", "saved", "error"].contains(state.phase) { await syncPush(activity) }
    }

    private func watchPushToken(_ activity: Activity<CueActivityAttributes>) {
        guard pushObservers[activity.id] == nil else { return }
        pushObservers[activity.id] = Task {
            for await _ in activity.pushTokenUpdates {
                guard !Task.isCancelled else { return }
                await self.syncPush(activity)
            }
        }
    }

    private func syncPush(_ activity: Activity<CueActivityAttributes>, stop: Bool = false) async {
        if !stop && ["processing", "saved", "error"].contains(activity.content.state.phase) { return }
        guard stop || activity.pushToken != nil else {
            pushStatus = "Waiting for Apple’s Live Activity token. Restart the companion after upgrading an older build."
            return
        }
        do {
            guard let settings = try cloudConfiguration(), let origin = settings["url"], let token = settings["token"],
                  let url = URL(string: "\(origin)/v1/live-activity") else { return }
            var owner = try CueCompanionKeychain.read(account: "activity-owner")
            if owner.isEmpty {
                owner = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").lowercased()
                try CueCompanionKeychain.save(owner, account: "activity-owner")
            }
            let sequenceKey = "cue.activity.revision"
            let sequence = UserDefaults.standard.integer(forKey: sequenceKey) + 1
            UserDefaults.standard.set(sequence, forKey: sequenceKey)
            var body: [String: Any] = ["sessionID": activity.attributes.sessionID, "ownerSecret": owner,
                "revision": sequence, "stop": stop]
            if !stop {
                guard let pushToken = activity.pushToken else { return }
                let tasks = try load().filter { !$0.completed }
                guard tasks.count <= 128 else { throw CueCompanionError.message("Automatic updates support up to 128 open reminders.") }
                let events = (try? calendar.upcoming(now: Date())) ?? []
                let reminders = tasks + Array(events.prefix(128 - tasks.count))
                let startKey = "cue.activity.start.\(activity.attributes.sessionID)"
                let storedStart = UserDefaults.standard.double(forKey: startKey)
                let start = storedStart > 0 ? storedStart : Date().timeIntervalSince1970
                if storedStart == 0 { UserDefaults.standard.set(start, forKey: startKey) }
                body["expiresAt"] = (start + 8 * 3600) * 1000
                body["environment"] = Bundle.main.object(forInfoDictionaryKey: "CueAPNsEnvironment") as? String ?? "development"
                body["pushToken"] = pushToken.map { String(format: "%02x", $0) }.joined()
                body["holdUntil"] = feedbackUntil.map { $0.timeIntervalSince1970 * 1000 } as Any? ?? NSNull()
                body["reminders"] = reminders.map { reminder -> [String: Any] in
                    ["id": reminder.id, "title": reminder.title,
                     "dueAt": reminder.dueDate.map { $0.timeIntervalSince1970 * 1000 } as Any? ?? NSNull(),
                     "createdAt": (CueDates.parse(reminder.createdAt) ?? .distantPast).timeIntervalSince1970 * 1000,
                     "endAt": reminder.endDate.map { $0.timeIntervalSince1970 * 1000 } as Any? ?? NSNull()]
                }
                body["reviewingID"] = UserDefaults.standard.string(forKey: reviewingKey) as Any? ?? NSNull()
                body["reviewAnchor"] = UserDefaults.standard.string(forKey: reviewAnchorKey) as Any? ?? NSNull()
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 6
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
                let failure = try? JSONDecoder().decode(CloudFailure.self, from: data)
                if failure?.error.code == "push_not_configured" {
                    throw CueCompanionError.message("Automatic updates need Apple push setup. Reminders are saved; open Cue to refresh.")
                }
                throw CueCompanionError.message(failure?.error.message ?? "Automatic updates could not be scheduled. Reopen Cue to retry.")
            }
            if UserDefaults.standard.integer(forKey: sequenceKey) == sequence {
                let result = try JSONDecoder().decode(PushRegistration.self, from: data)
                guard result.ok, stop || result.scheduled else {
                    throw CueCompanionError.message("Restart Cue’s companion to begin a new push session.")
                }
                pushStatus = stop ? "Automatic updates stopped." : result.lastFailure ?? "Automatic updates scheduled with Apple push."
            }
        } catch {
            pushStatus = String(error.localizedDescription.prefix(300))
        }
    }

    func restore(startIfNeeded: Bool = false) async throws {
        revision += 1
        feedbackUntil = nil
        try await publish(restingState(), startIfNeeded: startIfNeeded)
        await scheduleForegroundRefresh()
    }

    private func scheduleForegroundRefresh() async {
        deadlineTask?.cancel()
        guard UserDefaults.standard.bool(forKey: enabledKey),
              await MainActor.run(body: { UIApplication.shared.applicationState == .active }),
              let reminders = try? timeline(),
              let date = CueSelection.nextChange(reminders, now: Date()) else { return }
        deadlineTask = Task {
            do { try await Task.sleep(nanoseconds: UInt64(max(0, date.timeIntervalSinceNow) * 1_000_000_000)) }
            catch { return }
            guard await MainActor.run(body: { UIApplication.shared.applicationState == .active }) else { return }
            try? await self.refresh()
        }
    }

    func showMissed() async throws {
        let reminders = try load()
        let now = Date()
        let missed = CueSelection.missed(reminders, now: now)
        guard !missed.isEmpty else { try await resume(); return }
        let anchor = CueSelection.reminder(try timeline(), now: now)?.id
        let previous = UserDefaults.standard.string(forKey: reviewAnchorKey) == anchor ? UserDefaults.standard.string(forKey: reviewingKey) : nil
        let index = missed.firstIndex { $0.id == previous }
        let selected = missed[index.map { ($0 + 1) % missed.count } ?? 0]
        UserDefaults.standard.set(selected.id, forKey: reviewingKey)
        UserDefaults.standard.set(anchor, forKey: reviewAnchorKey)
        try await restore()
    }

    func resume() async throws {
        UserDefaults.standard.removeObject(forKey: reviewingKey)
        UserDefaults.standard.removeObject(forKey: reviewAnchorKey)
        try await restore()
    }

    func refresh() async throws {
        // Foreground synchronization must not erase a Shortcut's in-flight feedback.
        if !isCapturing { try await restore() }
    }

    private func showFeedback(phase: String, title: String, detail: String = "", startIfNeeded: Bool = false) async {
        guard var state = try? restingState() else { return }
        if phase == "answer", let until = feedbackUntil?.addingTimeInterval(-6), let reminders = try? timeline() {
            // If iOS ends this execution, the stale snapshot can still replace
            // the answer; no app-side background timer is required.
            let next = displayState(reminders, now: until)
            state.nextTitle = next.title
            state.nextID = next.reminderID
            state.nextDueAt = next.dueAt
            state.nextPhase = next.phase
            state.nextDetail = next.detail
            state.nextMissedCount = next.missedCount
            state.nextReviewingMissed = next.reviewingMissed
            state.nextTransitionAt = until
        }
        state.phase = phase
        state.title = title
        state.detail = detail
        try? await publish(state, startIfNeeded: startIfNeeded)
    }

    func capture(_ input: String, source: String) async throws -> CueCaptureResult {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty && text.count <= 2000 else {
            throw CueCompanionError.message("Enter one reminder, up to 2,000 characters.")
        }
        guard !isCapturing else { throw CueCompanionError.message("Finish the current reminder first.") }
        isCapturing = true
        defer { isCapturing = false }
        revision += 1
        try silenceLegacyAlerts()
        // First capture starts a session. Preserve an explicit in-app opt-out;
        // invoking the companion's Shortcut explicitly enables it again.
        if source == "shortcut" || UserDefaults.standard.object(forKey: enabledKey) == nil {
            UserDefaults.standard.set(true, forKey: enabledKey)
        }
        await showFeedback(phase: "processing", title: "Thinking…", startIfNeeded: true)
        do {
            let parsed = try await parse(text)
            let reply: CueAssistantReply
            let answering = ["query_calendar", "answer"].contains(parsed.action)
            switch parsed.action {
            case "reminder":
                let reminder = CueReminder(id: UUID().uuidString, title: parsed.title, note: parsed.note,
                    dueAt: parsed.dueAt.isEmpty ? nil : parsed.dueAt, completed: false,
                    createdAt: CueDates.string(Date()), source: source)
                guard !reminder.title.isEmpty, reminder.title.count <= 120,
                      parsed.dueAt.isEmpty || reminder.dueDate.map({ $0 > Date() }) == true else {
                    throw CueCompanionError.message("That time is unclear or has passed. Include a future date and time.")
                }
                // Reload after inference so concurrent completion/deletion survives.
                var reminders = try load()
                reminders.insert(reminder, at: 0)
                try write(reminders)
                reply = .init(title: "Added: \(reminder.title)", detail: reminder.dueDate.map(CueDates.label) ?? "No time set")
            case "create_event", "update_event": reply = try calendar.save(parsed)
            case "query_calendar": reply = try calendar.query(parsed)
            case "answer":
                guard !parsed.reply.isEmpty, parsed.reply.count <= 320 else { throw CueCompanionError.message("AI returned an empty answer.") }
                reply = .init(title: "Cue", detail: parsed.reply)
            default: throw CueCompanionError.message("AI returned an unsupported action. Try a simpler request.")
            }
            revision += 1
            let feedbackRevision = revision
            let answerUntil = Date().addingTimeInterval(8)
            feedbackUntil = answering ? answerUntil.addingTimeInterval(6) : nil
            await showFeedback(phase: answering ? "answer" : "saved", title: reply.title, detail: reply.detail)
            // Await the acknowledgement within the user-triggered execution. No background timer.
            let pause = answering ? max(0, answerUntil.timeIntervalSinceNow) : parsed.action == "reminder" ? 1.3 : 3
            try? await Task.sleep(nanoseconds: UInt64(pause * 1_000_000_000))
            if revision == feedbackRevision { try? await restore() }
            return CueCaptureResult(remindersJSON: try json(load()), reply: reply.text)
        } catch {
            revision += 1
            let feedbackRevision = revision
            await showFeedback(phase: "error", title: "Couldn’t complete request", detail: error.localizedDescription)
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if revision == feedbackRevision { try? await restore() }
            throw error
        }
    }

    func toggle(_ id: String, completed: Bool) async throws -> String {
        var reminders = try load()
        guard let originalIndex = reminders.firstIndex(where: { $0.id == id }) else { return try json(reminders) }
        let oldNotification = reminders[originalIndex].notificationId
        let newNotification: String? = nil
        let index = originalIndex
        reminders[index].completed = completed
        reminders[index].notificationId = newNotification
        do { try write(reminders) }
        catch { if newNotification != oldNotification { cancel(newNotification) }; throw error }
        if oldNotification != newNotification { cancel(oldNotification) }
        try await restore()
        return try json(load())
    }

    func remove(_ id: String) async throws -> String {
        var reminders = try load()
        let oldNotification = reminders.first(where: { $0.id == id })?.notificationId
        reminders.removeAll { $0.id == id }
        try write(reminders)
        cancel(oldNotification)
        try await restore()
        return try json(load())
    }

    private func cancel(_ id: String?) {
        guard let id else { return }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id])
    }

    // Native build settings make Shortcuts independent of JS hydration/Metro.
    func cloudConfiguration() throws -> [String: String]? {
        let bundledOrigin = Bundle.main.object(forInfoDictionaryKey: "CueCloudOrigin") as? String ?? ""
        let bundledToken = Bundle.main.object(forInfoDictionaryKey: "CueCloudAccessToken") as? String ?? ""
        if let bundled = CueCloudSettings(origin: bundledOrigin, token: bundledToken) {
            return ["url": bundled.origin, "token": bundled.token]
        }
        let savedOrigin = UserDefaults.standard.string(forKey: "cue.cloud.origin") ?? ""
        guard !savedOrigin.isEmpty,
              let saved = CueCloudSettings(origin: savedOrigin, token: try CueCompanionKeychain.read()) else { return nil }
        return ["url": saved.origin, "token": saved.token]
    }

    func configureCloud(_ origin: String, token: String) throws {
        try CueCompanionKeychain.removeLegacyKey()
        // A development reload missing .env must not erase a working installation.
        if origin.isEmpty && token.isEmpty { return }
        guard let settings = CueCloudSettings(origin: origin, token: token) else {
            throw CueCompanionError.message("Cue’s cloud configuration is invalid. Rebuild Cue with its Worker URL and access token.")
        }
        try CueCompanionKeychain.save(settings.token)
        UserDefaults.standard.set(settings.origin, forKey: "cue.cloud.origin")
    }

    private struct CloudAssistant: Decodable { var plan: CueAssistantPlan }
    private struct PushRegistration: Decodable { var ok: Bool; var scheduled: Bool; var lastFailure: String? }
    private struct CloudFailure: Decodable {
        struct Detail: Decodable { var message: String; var code: String? }
        var error: Detail
    }

    private func parse(_ text: String) async throws -> CueAssistantPlan {
        guard let settings = try cloudConfiguration(),
              let origin = settings["url"], let token = settings["token"],
              let url = URL(string: "\(origin)/v1/assistant") else {
            throw CueCompanionError.message("This Cue build has no cloud settings. On your Mac, run ios:sync:companion and rebuild/install Cue. Opening the app alone won’t fix this build.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text, "timeZone": TimeZone.current.identifier])
        let data: Data
        let response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch {
            throw CueCompanionError.message("Cloud AI couldn’t be reached. Check your connection and try again.")
        }
        guard let response = response as? HTTPURLResponse else {
            throw CueCompanionError.message("Cloud AI returned an unreadable response.")
        }
        guard (200..<300).contains(response.statusCode) else {
            let failure = try? JSONDecoder().decode(CloudFailure.self, from: data)
            var message = String((failure?.error.message ?? "Cloud AI is unavailable. Please try again.").prefix(300))
            if response.statusCode == 429, let retry = response.value(forHTTPHeaderField: "Retry-After"),
               let seconds = Int(retry), seconds > 0 && seconds <= 60 {
                message += " Try again in \(seconds) seconds."
            }
            throw CueCompanionError.message(message)
        }
        guard let result = try? JSONDecoder().decode(CloudAssistant.self, from: data).plan else {
            throw CueCompanionError.message("Cloud AI returned an invalid request. Update the Worker and rebuild Cue.")
        }
        return result
    }
}

enum CueCompanionKeychain {
    private static func query(account: String = "cloud-access") -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.remindersplusplus.cue.companion",
         kSecAttrAccount as String: account]
    }

    static func removeLegacyKey() throws {
        let status = SecItemDelete(query(account: "openai") as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CueCompanionError.message("Unlock your iPhone and reopen Cue to finish cloud setup.")
        }
    }

    static func save(_ token: String, account: String = "cloud-access") throws {
        let lookup = query(account: account)
        if token.isEmpty {
            let status = SecItemDelete(lookup as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                throw CueCompanionError.message("Couldn’t remove Cue’s cloud access settings.")
            }
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(lookup as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(lookup.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw CueCompanionError.message("Couldn’t save Cue’s cloud access settings.") }
    }

    static func read(account: String = "cloud-access") throws -> String {
        var lookup = query(account: account)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &item)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let data = item as? Data else {
            throw CueCompanionError.message("Unlock your iPhone to access Cue’s cloud settings.")
        }
        return String(decoding: data, as: UTF8.self)
    }
}
