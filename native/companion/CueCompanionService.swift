import ActivityKit
import Foundation
import Security
import UserNotifications

actor CueCompanionService {
    static let shared = CueCompanionService()
    static let changed = Notification.Name("CueRemindersChanged")
    private let enabledKey = "cue.companion.enabled"
    private let pinnedKey = "cue.companion.pinned"
    private var isCapturing = false
    private var revision = 0

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
        return try json(load())
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

    func status() -> [String: Bool] {
        ["enabled": UserDefaults.standard.bool(forKey: enabledKey),
         "allowed": ActivityAuthorizationInfo().areActivitiesEnabled,
         "active": Activity<CueActivityAttributes>.activities.contains { $0.activityState == .active || $0.activityState == .stale }]
    }

    func setEnabled(_ enabled: Bool) async throws -> [String: Bool] {
        if enabled {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                throw CueCompanionError.message("Allow Live Activities for Cue in iPhone Settings.")
            }
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            }
            UserDefaults.standard.set(true, forKey: enabledKey)
            try await restore(startIfNeeded: true)
        } else {
            revision += 1
            UserDefaults.standard.set(false, forKey: enabledKey)
            for activity in Activity<CueActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        return status()
    }

    private func restingState() throws -> CueActivityAttributes.ContentState {
        let reminders = try load()
        let now = Date()
        let selected = CueSelection.reminder(reminders, preferredID: UserDefaults.standard.string(forKey: pinnedKey), now: now)
        let next = CueSelection.nextDue(reminders, now: now)
        UserDefaults.standard.set(selected?.id, forKey: pinnedKey)
        return .init(
            phase: selected?.dueDate.map { $0 <= now ? "due" : "ready" } ?? "ready",
            title: selected?.title ?? "Nothing waiting",
            detail: selected?.dueDate.map(CueDates.label) ?? (selected == nil ? "" : "No time set"),
            reminderID: selected?.id, dueAt: selected?.dueDate,
            nextTitle: next?.title, nextID: next?.id, nextDueAt: next?.dueDate
        )
    }

    private func publish(_ state: CueActivityAttributes.ContentState, startIfNeeded: Bool = false) async throws {
        guard UserDefaults.standard.bool(forKey: enabledKey) else { return }
        // The upcoming snapshot becomes outdated at its next deadline. The widget
        // can then render the preloaded due candidate; this never executes app code.
        let staleDate = state.phase == "ready" ? state.nextDueAt : nil
        let content = ActivityContent(state: state, staleDate: staleDate)
        if let activity = Activity<CueActivityAttributes>.activities.first(where: { $0.activityState == .active || $0.activityState == .stale }) {
            await activity.update(content)
        } else if startIfNeeded && ActivityAuthorizationInfo().areActivitiesEnabled {
            _ = try Activity.request(attributes: CueActivityAttributes(sessionID: UUID().uuidString), content: content, pushType: nil)
        }
    }

    func restore(startIfNeeded: Bool = false) async throws {
        revision += 1
        try await publish(restingState(), startIfNeeded: startIfNeeded)
    }

    func refresh() async throws {
        // Foreground synchronization must not erase a Shortcut's in-flight feedback.
        if !isCapturing { try await restore() }
    }

    private func showFeedback(phase: String, title: String, detail: String = "", startIfNeeded: Bool = false) async {
        guard var state = try? restingState() else { return }
        state.phase = phase
        state.title = title
        state.detail = detail
        try? await publish(state, startIfNeeded: startIfNeeded)
    }

    func capture(_ input: String, source: String) async throws -> String {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty && text.count <= 2000 else {
            throw CueCompanionError.message("Enter one reminder, up to 2,000 characters.")
        }
        guard !isCapturing else { throw CueCompanionError.message("Finish the current reminder first.") }
        isCapturing = true
        defer { isCapturing = false }
        revision += 1
        // First capture starts a session. Preserve an explicit in-app opt-out;
        // invoking the companion's Shortcut explicitly enables it again.
        if source == "shortcut" || UserDefaults.standard.object(forKey: enabledKey) == nil {
            UserDefaults.standard.set(true, forKey: enabledKey)
        }
        await showFeedback(phase: "processing", title: "Adding reminder…", startIfNeeded: true)
        do {
            let parsed = try await parse(text)
            var reminder = CueReminder(id: UUID().uuidString, title: parsed.title, note: parsed.note,
                dueAt: parsed.dueAt.isEmpty ? nil : parsed.dueAt, completed: false,
                createdAt: CueDates.string(Date()), source: source)
            if let date = reminder.dueDate, date <= Date() {
                throw CueCompanionError.message("That time has passed. Include a future date and time.")
            }
            var notificationFailed = false
            if source != "shortcut", reminder.dueDate != nil {
                let center = UNUserNotificationCenter.current()
                if await center.notificationSettings().authorizationStatus == .notDetermined {
                    _ = try? await center.requestAuthorization(options: [.alert, .sound])
                }
            }
            do { reminder.notificationId = try await schedule(reminder) }
            catch { notificationFailed = true }
            // Reload after inference: completion or deletion during capture must survive.
            var reminders = try load()
            reminders.insert(reminder, at: 0)
            do { try write(reminders) }
            catch {
                cancel(reminder.notificationId)
                throw error
            }
            let detail = reminder.dueDate.map(CueDates.label) ?? "No time set"
            let alertsOff = reminder.dueAt != nil && (reminder.notificationId == nil || notificationFailed)
            revision += 1
            let feedbackRevision = revision
            await showFeedback(phase: "saved", title: "Added: \(reminder.title)", detail: alertsOff ? "\(detail) · alerts unavailable" : detail)
            // Await the acknowledgement within the user-triggered execution. No background timer.
            try? await Task.sleep(nanoseconds: 1_300_000_000)
            if revision == feedbackRevision { try? await restore() }
            return try json(load())
        } catch {
            revision += 1
            let feedbackRevision = revision
            await showFeedback(phase: "error", title: "Couldn’t add reminder", detail: error.localizedDescription)
            try? await Task.sleep(nanoseconds: 1_300_000_000)
            if revision == feedbackRevision { try? await restore() }
            throw error
        }
    }

    func toggle(_ id: String, completed: Bool) async throws -> String {
        var reminders = try load()
        guard let originalIndex = reminders.firstIndex(where: { $0.id == id }) else { return try json(reminders) }
        let oldNotification = reminders[originalIndex].notificationId
        let newNotification = completed ? nil : try await schedule(reminders[originalIndex])
        // Scheduling can suspend the actor. Reload before changing the one task.
        reminders = try load()
        guard let index = reminders.firstIndex(where: { $0.id == id }) else {
            cancel(newNotification)
            return try json(reminders)
        }
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

    private func schedule(_ reminder: CueReminder) async throws -> String? {
        guard let date = reminder.dueDate, date > Date() else { return nil }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return nil }
        let content = UNMutableNotificationContent()
        content.title = "Cue"
        content.body = reminder.title
        content.sound = .default
        content.userInfo = ["type": "reminder", "reminderId": reminder.id]
        let id = "cue.reminder.\(reminder.id)"
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
        try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        return id
    }

    // Persisted configuration lets an App Intent call the Worker without Metro/JS.
    func configureCloud(_ origin: String, token: String) throws {
        if !origin.isEmpty {
            guard let url = URLComponents(string: origin), url.scheme == "https", url.host != nil,
                  url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
                  (url.path.isEmpty || url.path == "/"),
                  token.range(of: "^[A-Za-z0-9_-]{32,256}$", options: .regularExpression) != nil else {
                throw CueCompanionError.message("Cue’s cloud configuration is invalid. Contact the app owner.")
            }
        }
        try CueCompanionKeychain.removeLegacyKey()
        try CueCompanionKeychain.save(origin.isEmpty ? "" : token)
        UserDefaults.standard.set(origin.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "cue.cloud.origin")
    }

    private struct Parsed: Decodable { var title: String; var note: String; var dueAt: String }
    private struct CloudReminder: Decodable { var reminder: Parsed }
    private struct CloudFailure: Decodable {
        struct Detail: Decodable { var message: String }
        var error: Detail
    }

    private func parse(_ text: String) async throws -> Parsed {
        let origin = UserDefaults.standard.string(forKey: "cue.cloud.origin") ?? ""
        let token = try CueCompanionKeychain.read()
        guard !origin.isEmpty, !token.isEmpty, let url = URL(string: "\(origin)/v1/reminders/parse") else {
            throw CueCompanionError.message("Cloud AI isn’t configured. Open the configured Cue app once, then try again.")
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
        guard var result = try? JSONDecoder().decode(CloudReminder.self, from: data).reminder else {
            throw CueCompanionError.message("Cloud AI returned an invalid reminder. Please try again.")
        }
        result.title = result.title.trimmingCharacters(in: .whitespacesAndNewlines)
        result.note = result.note.trimmingCharacters(in: .whitespacesAndNewlines)
        result.dueAt = result.dueAt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !result.title.isEmpty, result.title.count <= 120, result.note.count <= 240,
              result.dueAt.isEmpty || CueDates.parse(result.dueAt) != nil else {
            throw CueCompanionError.message("Cloud AI returned an unclear task or time. Please try again.")
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

    static func save(_ token: String) throws {
        let lookup = query()
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

    static func read() throws -> String {
        var lookup = query()
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
