import AppIntents

struct AddCueReminderIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add Cue reminder"
    static var description = IntentDescription("Turn a sentence into a reminder and acknowledge it on the Lock Screen.")
    static var openAppWhenRun = false
    @Parameter(title: "Reminder", requestValueDialog: "What should I remind you about?")
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        #if !CUE_WIDGET_EXTENSION
        _ = try await CueCompanionService.shared.capture(text, source: "shortcut")
        #endif
        return .result(dialog: "Added to Cue.")
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
