import ActivityKit
import Foundation

struct CueActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var phase: String
        var title: String
        var detail: String
        var reminderID: String?
        var dueAt: Date?
        var nextTitle: String?
        var nextID: String?
        var nextDueAt: Date?
    }

    var sessionID: String
}
