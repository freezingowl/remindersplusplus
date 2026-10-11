import SwiftUI

// Shared simple answer content, also renderable without a Live Activity for QA.
struct CueAnswerView: View {
    let text: String
    let date: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Image(systemName: "sparkles").frame(width: 14, height: 14).accessibilityHidden(true)
                Text("cue").fontWeight(.medium)
                Spacer()
                Text(date).lineLimit(1)
            }
            .font(.system(size: 11)).foregroundStyle(.secondary)
            Text(text).font(.system(size: 25, weight: .semibold, design: .rounded))
                .foregroundStyle(.primary).lineLimit(3).minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !detail.isEmpty {
                Text(detail).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}
