import AppIntents

struct AddCueReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add Cue reminder"
    static var description = IntentDescription("Turn a sentence into a reminder and acknowledge it on the Lock Screen.")
    static var openAppWhenRun = false
    @Parameter(title: "Reminder", requestValueDialog: "What should I remind you about?")
    var text: String

    func perform() async throws -> some IntentResult {
        #if !CUE_WIDGET_EXTENSION
        _ = try await CueCompanionService.shared.capture(text, source: "shortcut")
        #else
        throw CueCompanionError.message("Open the installed Cue app and try again.")
        #endif
        return .result()
    }
}

struct ShowCueMissedReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Show missed Cue reminder"
    func perform() async throws -> some IntentResult {
        #if !CUE_WIDGET_EXTENSION
        try await CueCompanionService.shared.showMissed()
        #endif
        return .result()
    }
}

struct ResumeCueReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Return to current Cue reminder"
    func perform() async throws -> some IntentResult {
        #if !CUE_WIDGET_EXTENSION
        try await CueCompanionService.shared.resume()
        #endif
        return .result()
    }
}

struct CompleteCueReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Complete Cue reminder"
    @Parameter(title: "Reminder identifier") var reminderID: String
    init() {}
    init(reminderID: String) { self.reminderID = reminderID }
    func perform() async throws -> some IntentResult {
        #if !CUE_WIDGET_EXTENSION
        _ = try await CueCompanionService.shared.toggle(reminderID, completed: true)
        #endif
        return .result()
    }
}

#if !CUE_WIDGET_EXTENSION
struct CueShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddCueReminderIntent(),
            phrases: ["Add a reminder in \(.applicationName)"],
            shortTitle: "Add reminder", systemImageName: "text.badge.plus")
    }
}
#endif
