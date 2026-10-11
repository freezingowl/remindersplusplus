import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private struct CueMark: View {
    var phase: String
    var body: some View {
        Group {
            if phase == "saved" {
                Image(systemName: "checkmark").font(.system(size: 10, weight: .semibold))
            } else if phase == "processing" {
                Image(systemName: "ellipsis").font(.system(size: 12, weight: .bold))
            } else if phase == "error" {
                Image(systemName: "exclamationmark").font(.system(size: 10, weight: .semibold))
            } else if phase == "answer" {
                Image(systemName: "sparkles").font(.system(size: 10, weight: .semibold))
            } else if phase == "event" || phase == "event_now" {
                Image(systemName: "calendar").font(.system(size: 10, weight: .semibold))
            } else {
                HStack(spacing: 3) {
                    Capsule().frame(width: 2.5, height: phase == "due" ? 6 : 4)
                    Capsule().frame(width: 2.5, height: phase == "due" ? 6 : 4)
                }
            }
        }
        .frame(width: 14, height: 14)
        .contentTransition(.symbolEffect(.replace))
        .accessibilityHidden(true)
    }
}

private struct CueCard: View {
    let context: ActivityViewContext<CueActivityAttributes>
    @Environment(\.isLuminanceReduced) private var reducedLuminance

    private var promoted: Bool { !["processing", "saved", "error"].contains(context.state.phase) && context.isStale && (context.state.nextTransitionAt != nil || context.state.nextID != nil) }
    private var phase: String { promoted ? context.state.nextPhase ?? "due" : context.state.phase }
    private var title: String { promoted ? context.state.nextTitle ?? context.state.title : context.state.title }
    private var reminderID: String? { promoted ? context.state.nextID : context.state.reminderID }
    private var dueAt: Date? { promoted ? context.state.nextDueAt : context.state.dueAt }
    private var temporary: Bool { ["processing", "saved", "answer", "error"].contains(phase) }
    private var idle: Bool { !temporary && reminderID == nil }
    private var missedCount: Int { promoted ? context.state.nextMissedCount ?? 0 : context.state.missedCount ?? 0 }
    private var reviewingMissed: Bool { promoted ? context.state.nextReviewingMissed == true : context.state.reviewingMissed == true }
    private var detail: String { promoted ? context.state.nextDetail ?? "" : context.state.detail }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 4) {
                CueMark(phase: phase)
                Text("cue").font(.system(size: 11, weight: .medium, design: .rounded))
                Spacer()
                if !temporary, reviewingMissed {
                    Button(intent: ResumeCueReminderIntent()) { Text("Back") }
                        .buttonStyle(.plain).font(.system(size: 11, weight: .medium))
                        .accessibilityLabel("Return to current reminder")
                }
                if !temporary, missedCount > 0 {
                    Button(intent: ShowCueMissedReminderIntent()) {
                        Text("\(missedCount) missed")
                            .font(.system(size: 11, weight: .medium))
                            .padding(.horizontal, 7).padding(.vertical, 4)
                            .background(.primary.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Show \(missedCount) missed \(missedCount == 1 ? "reminder" : "reminders")")
                }
                if phase == "due" || phase == "event_now" { Text("NOW").font(.system(size: 10, weight: .semibold)).tracking(1) }
            }
            .foregroundStyle(.secondary)

            if !idle { HStack(alignment: .center, spacing: 12) {
                if !temporary, let reminderID, !reminderID.hasPrefix("cal_") {
                    Button(intent: CompleteCueReminderIntent(reminderID: reminderID)) {
                        Image(systemName: "circle").font(.system(size: 30, weight: .ultraLight))
                            .frame(width: 38, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Complete \(title)")
                }
                Text(title)
                    .font(.system(size: phase == "due" ? 29 : 25, weight: .semibold, design: .rounded))
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .contentTransition(.interpolate)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } }

            if temporary {
                if !context.state.detail.isEmpty {
                    Text(context.state.detail).font(.system(size: phase == "answer" ? 14 : 12)).foregroundStyle(.secondary).lineLimit(phase == "answer" ? 4 : 2)
                }
            } else if phase == "missed", let dueAt {
                HStack(spacing: 5) {
                    Text("Missed")
                    Text("·")
                    Text(dueAt, style: .time)
                }
                .font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            } else if phase == "event_now" {
                Text("In your Calendar").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            } else if phase != "due", let dueAt {
                HStack(spacing: 5) {
                    Text(dueAt, style: .time)
                    Text("·")
                    Text(dueAt, style: .timer).monospacedDigit()
                }
                .font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            } else if !detail.isEmpty && phase != "due" {
                Text(detail).font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20).padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: idle ? 48 : phase == "due" ? 132 : 72, alignment: .leading)
        // Keep the native Lock Screen surface. An opaque custom fill obscures the
        // system's glass/translucency; glassEffect is not assumed to work in widgets.
        .activityBackgroundTint(nil)
        .activitySystemActionForegroundColor(.primary)
        .animation(reducedLuminance ? nil : .easeInOut(duration: 0.35), value: phase)
        .widgetURL(URL(string: "cue://reminders"))
    }
}

struct CueLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CueActivityAttributes.self) { context in
            CueCard(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) { CueCard(context: context) }
            } compactLeading: {
                CueMark(phase: context.state.phase)
            } compactTrailing: {
                if let due = context.state.dueAt, context.state.phase == "ready", !context.isStale {
                    Text(due, style: .timer).monospacedDigit().frame(maxWidth: 48)
                } else {
                    CueMark(phase: context.isStale ? "due" : context.state.phase)
                }
            } minimal: {
                CueMark(phase: context.isStale ? "due" : context.state.phase)
            }
            .widgetURL(URL(string: "cue://reminders"))
        }
    }
}

@main
struct CueCompanionWidgets: WidgetBundle {
    var body: some Widget { CueLiveActivity() }
}
