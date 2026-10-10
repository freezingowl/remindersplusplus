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

    private var promoted: Bool { context.state.phase == "ready" && context.isStale && context.state.nextID != nil }
    private var phase: String { promoted ? "due" : context.state.phase }
    private var title: String { promoted ? context.state.nextTitle ?? context.state.title : context.state.title }
    private var reminderID: String? { promoted ? context.state.nextID : context.state.reminderID }
    private var dueAt: Date? { promoted ? context.state.nextDueAt : context.state.dueAt }
    private var temporary: Bool { ["processing", "saved", "error"].contains(phase) }
    private var idle: Bool { !temporary && reminderID == nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 4) {
                CueMark(phase: phase)
                Text("cue").font(.system(size: 11, weight: .medium, design: .rounded))
                Spacer()
                if phase == "due" { Text("NOW").font(.system(size: 10, weight: .semibold)).tracking(1) }
            }
            .foregroundStyle(.secondary)

            if !idle { HStack(alignment: .center, spacing: 12) {
                if !temporary, let reminderID {
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
                    Text(context.state.detail).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                }
            } else if phase != "due", let dueAt {
                HStack(spacing: 5) {
                    Text(dueAt, style: .time)
                    Text("·")
                    Text(dueAt, style: .timer).monospacedDigit()
                }
                .font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            } else if !context.state.detail.isEmpty && phase != "due" {
                Text(context.state.detail).font(.system(size: 12)).foregroundStyle(.secondary)
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
                if let due = context.state.nextDueAt, context.state.phase == "ready", !context.isStale {
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
