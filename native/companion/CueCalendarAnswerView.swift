import SwiftUI

// Pure SwiftUI content, also renderable without a running Live Activity for QA.
struct CueCalendarAnswerView: View {
    let title: String
    let date: String
    let rows: [CueAnswerRow]
    let footer: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "sparkles").frame(width: 14, height: 14).accessibilityHidden(true)
                Text("cue").fontWeight(.medium)
                Spacer()
                Text(date).lineLimit(1)
            }
            .font(.system(size: 11)).foregroundStyle(.secondary)
            Text(title).font(.system(size: 22, weight: .semibold, design: .rounded))
                .lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(rows.prefix(3).enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 10) {
                        Text(row.time).font(.system(size: 12, weight: .medium)).monospacedDigit()
                            .frame(width: 106, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
                        Text(row.title).font(.system(size: 14, weight: row.kind == "free" ? .semibold : .medium))
                            .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .foregroundStyle(row.kind == "info" ? .secondary : .primary)
                    .accessibilityElement(children: .combine)
                }
            }
            if !footer.isEmpty {
                Text(footer).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}
