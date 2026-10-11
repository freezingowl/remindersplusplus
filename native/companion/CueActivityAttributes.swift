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
        // Optional fields allow an existing activity snapshot to decode on upgrade.
        var missedCount: Int?
        var nextMissedCount: Int?
        var reviewingMissed: Bool?
        var nextPhase: String?
        var nextDetail: String?
        var nextReviewingMissed: Bool?
        var nextTransitionAt: Date?
    }

    var sessionID: String
}
