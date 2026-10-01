import SwiftUI
import WidgetKit

private enum WavelengthWidgetConstants {
    static let appGroupIdentifier = "group.com.bocametrics.wavelength"
    static let snapshotFilename = "widget-snapshot-v1.json"
    static let maximumSnapshotBytes = 64 * 1024
    static let retryInterval: TimeInterval = 15 * 60
}

private struct SnapshotProgress: Decodable, Equatable {
    let completed: Int
    let total: Int
}

private struct WidgetSnapshot: Decodable {
    let schemaVersion: Int
    let revision: Int64
    let generatedAt: Date
    let dayKey: String
    let timeZone: String?
    let expiresAt: Date
    let nextRefreshAt: Date
    let progress: SnapshotProgress

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case revision
        case generatedAt
        case dayKey
        case timeZone
        case expiresAt
        case nextRefreshAt
        case progress
    }
}

private enum SnapshotReader {
    static let maximumSnapshotBytes = WavelengthWidgetConstants.maximumSnapshotBytes

    static func load(now: Date = Date()) -> WidgetSnapshot? {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: WavelengthWidgetConstants.appGroupIdentifier
        ) else {
            return nil
        }

        let snapshotURL = containerURL.appendingPathComponent(
            WavelengthWidgetConstants.snapshotFilename,
            isDirectory: false
        )

        guard let attributes = try? FileManager.default.attributesOfItem(atPath: snapshotURL.path),
              let fileSize = attributes[.size] as? NSNumber,
              fileSize.intValue <= maximumSnapshotBytes,
              let data = try? Data(contentsOf: snapshotURL, options: [.mappedIfSafe]),
              data.count <= maximumSnapshotBytes,
              let snapshot = try? decoder.decode(WidgetSnapshot.self, from: data),
              snapshot.schemaVersion == 1 else {
            return nil
        }

        let expectedRevision = Int64((snapshot.generatedAt.timeIntervalSince1970 * 1000).rounded())
        guard snapshot.generatedAt <= now,
              snapshot.revision == expectedRevision,
              snapshot.nextRefreshAt <= snapshot.expiresAt,
              snapshot.expiresAt > now else {
            return nil
        }

        let progress = snapshot.progress
        guard progress.completed >= 0,
              progress.completed <= progress.total else {
            return nil
        }

        let timeZone = snapshot.timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
        let localDayKey = dayKey(for: now, in: timeZone)
        guard snapshot.dayKey == localDayKey else {
            return nil
        }

        return snapshot
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = fractionalDateFormatter.date(from: value) ?? dateFormatter.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO 8601 date"
            )
        }
        return decoder
    }()

    private static let fractionalDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static func dayKey(for date: Date, in timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private struct WavelengthEntry: TimelineEntry {
    let date: Date
    let progress: SnapshotProgress?
}

private struct WavelengthProvider: TimelineProvider {
    func placeholder(in context: Context) -> WavelengthEntry {
        WavelengthEntry(date: Date(), progress: SnapshotProgress(completed: 3, total: 5))
    }

    func getSnapshot(in context: Context, completion: @escaping (WavelengthEntry) -> Void) {
        let now = Date()
        completion(WavelengthEntry(date: now, progress: SnapshotReader.load(now: now)?.progress))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WavelengthEntry>) -> Void) {
        let now = Date()
        guard let snapshot = SnapshotReader.load(now: now) else {
            let unavailableEntry = WavelengthEntry(date: now, progress: nil)
            completion(Timeline(
                entries: [unavailableEntry],
                policy: .after(now.addingTimeInterval(WavelengthWidgetConstants.retryInterval))
            ))
            return
        }

        let currentEntry = WavelengthEntry(date: now, progress: snapshot.progress)
        let expiryEntry = WavelengthEntry(date: snapshot.expiresAt, progress: nil)
        let futureRefreshDates = [snapshot.nextRefreshAt, snapshot.expiresAt]
            .compactMap { $0 }
            .filter { $0 > now }
        let refreshDate = futureRefreshDates.min()
            ?? now.addingTimeInterval(WavelengthWidgetConstants.retryInterval)

        completion(Timeline(entries: [currentEntry, expiryEntry], policy: .after(refreshDate)))
    }
}

private struct WavelengthWidgetView: View {
    @Environment(\.widgetRenderingMode) private var renderingMode

    let entry: WavelengthEntry

    var body: some View {
        Group {
            if let progress = entry.progress {
                progressView(progress)
                    .privacySensitive()
            } else {
                unavailableView
            }
        }
        .containerBackground(for: .widget) {
            backgroundColor
        }
    }

    private func progressView(_ progress: SnapshotProgress) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "wave.3.right")
                    .font(.system(size: 9, weight: .semibold))
                Text("WAVELENGTH")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.7)
            }
            .foregroundStyle(accentColor)
            .widgetAccentable()

            Spacer(minLength: 0)

            ZStack {
                Circle()
                    .stroke(.secondary.opacity(0.22), lineWidth: 9)
                Circle()
                    .trim(from: 0, to: progressFraction(progress))
                    .stroke(
                        accentColor,
                        style: StrokeStyle(lineWidth: 9, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .widgetAccentable()

                VStack(spacing: 0) {
                    Text("\(progress.completed)/\(progress.total)")
                        .font(.title2.weight(.bold).monospacedDigit())
                        .foregroundStyle(.primary)
                        .minimumScaleFactor(0.75)
                    Text("COMPLETED")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Today's progress")
            .accessibilityValue(accessibilityProgressValue(progress))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var unavailableView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "wave.3.right")
                    .font(.system(size: 9, weight: .semibold))
                Text("WAVELENGTH")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.7)
            }
            .foregroundStyle(accentColor)
            .widgetAccentable()

            Spacer()

            Image(systemName: "arrow.up.forward.app")
                .font(.title2)
                .foregroundStyle(accentColor)
                .widgetAccentable()
            Text("Open Wavelength")
                .font(.headline)
                .foregroundStyle(.primary)
            Text("Refresh today’s progress in the app.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }

    private var accentColor: Color {
        switch renderingMode {
        case .fullColor:
            return Color(red: 0.12, green: 0.49, blue: 0.91)
        case .accented:
            return .accentColor
        case .vibrant:
            return .primary
        default:
            return .accentColor
        }
    }

    private var backgroundColor: Color {
        switch renderingMode {
        case .fullColor:
            return Color(.systemBackground)
        case .accented:
            return Color(.systemBackground)
        case .vibrant:
            return .clear
        default:
            return Color(.systemBackground)
        }
    }

    private func progressFraction(_ progress: SnapshotProgress) -> CGFloat {
        guard progress.total > 0 else { return 0 }
        return CGFloat(progress.completed) / CGFloat(progress.total)
    }

    private func accessibilityProgressValue(_ progress: SnapshotProgress) -> String {
        let habitWord = progress.total == 1 ? "habit" : "habits"
        return "\(progress.completed) of \(progress.total) \(habitWord) completed today"
    }
}

@main
struct WavelengthWidget: Widget {
    static let kind = "WavelengthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: WavelengthProvider()) { entry in
            WavelengthWidgetView(entry: entry)
        }
        .configurationDisplayName("Today’s Wavelength")
        .description("See today’s habit progress at a glance.")
        .supportedFamilies([.systemSmall])
    }
}
