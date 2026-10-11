import AppKit
import SwiftUI

// Render the actual answer component with synthetic data, not the phone's
// Calendar or a fabricated device screenshot. Run on macOS for layout QA.
@main
struct AnswerPreview {
    @MainActor static func main() throws {
        let output = CommandLine.arguments[1]
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kolkata")!
        let start = CueDates.parse("2026-10-12T00:00:00+05:30")!
        let entries = [
            CueCalendarEntry(title: "Hackathon", start: start.addingTimeInterval(9 * 3600), end: start.addingTimeInterval(10 * 3600), allDay: false, subscribed: false, birthday: false, availability: .unsupported, declined: false),
            CueCalendarEntry(title: "Columbus Day", start: start, end: start.addingTimeInterval(86400), allDay: true, subscribed: true, birthday: false, availability: .unsupported, declined: false),
            CueCalendarEntry(title: "Indigenous Peoples' Day", start: start, end: start.addingTimeInterval(86400), allDay: true, subscribed: true, birthday: false, availability: .unsupported, declined: false),
        ]
        let now = start.addingTimeInterval(-12 * 3600)
        let agenda = CueCalendarAnswers.make(entries: entries, window: .init(start: start, end: start.addingTimeInterval(86400)), availability: false, now: now, calendar: calendar, locale: .init(identifier: "en_US"))
        let free = CueCalendarAnswers.make(entries: entries, window: .init(start: start.addingTimeInterval(9 * 3600), end: start.addingTimeInterval(18 * 3600)), availability: true, now: now, calendar: calendar, locale: .init(identifier: "en_US"))
        for (name, answer) in [("agenda", agenda), ("free", free)] {
            for width in [320.0, 350.0, 390.0] {
                let content = CueCalendarAnswerView(title: answer.title, date: answer.dateLabel, rows: answer.previewRows, footer: answer.previewFooter)
                    .padding(.horizontal, 20).padding(.vertical, 12).frame(width: width)
                    .background(Color(red: 0.10, green: 0.12, blue: 0.16)).environment(\.colorScheme, .dark)
                let renderer = ImageRenderer(content: content)
                renderer.scale = 3
                guard let cgImage = renderer.cgImage else { fatalError("Rendering failed") }
                let height = Double(cgImage.height) / renderer.scale
                guard height <= 160 else { fatalError("Answer exceeds the Live Activity height: \(height)") }
                let bitmap = NSBitmapImageRep(cgImage: cgImage)
                guard let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("PNG export failed") }
                try png.write(to: URL(fileURLWithPath: "\(output)/\(name)-\(Int(width)).png"))
                print("\(name) at \(Int(width))pt: \(height)pt high")
            }
        }
    }
}
