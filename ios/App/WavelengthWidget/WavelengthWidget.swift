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

private struct SnapshotNextWave: Decodable, Equatable {
    let state: String
    let eyebrow: String
    let habitId: String
    let icon: String
    let title: String
    let targetLabel: String
    let detail: String
    let action: String
    let freshUntil: Date

    private enum CodingKeys: String, CodingKey {
        case state
        case eyebrow
        case habitId
        case icon
        case title
        case targetLabel
        case detail
        case action
        case freshUntil
    }
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
    let nextWave: SnapshotNextWave

    private enum CodingKeys: String, CodingKey {
        case schemaVersion
        case revision
        case generatedAt
        case dayKey
        case timeZone
        case expiresAt
        case nextRefreshAt
        case progress
        case nextWave
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
              snapshot.nextWave.freshUntil <= snapshot.nextRefreshAt,
              snapshot.nextWave.freshUntil <= snapshot.expiresAt,
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
    let nextWave: SnapshotNextWave?
}

private struct WavelengthProvider: TimelineProvider {
    func placeholder(in context: Context) -> WavelengthEntry {
        WavelengthEntry(
            date: Date(),
            progress: SnapshotProgress(completed: 3, total: 5),
            nextWave: SnapshotNextWave(
                state: "available",
                eyebrow: "Ideal now",
                habitId: "movement",
                icon: "🚶",
                title: "Outdoor walk or movement",
                targetLabel: "20+ min",
                detail: "This is a good time for it.",
                action: "View habit",
                freshUntil: Date().addingTimeInterval(WavelengthWidgetConstants.retryInterval)
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (WavelengthEntry) -> Void) {
        let now = Date()
        guard let snapshot = SnapshotReader.load(now: now) else {
            completion(WavelengthEntry(date: now, progress: nil, nextWave: nil))
            return
        }

        let currentNextWave = snapshot.nextWave.freshUntil > now ? snapshot.nextWave : nil
        completion(WavelengthEntry(date: now, progress: snapshot.progress, nextWave: currentNextWave))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WavelengthEntry>) -> Void) {
        let now = Date()
        guard let snapshot = SnapshotReader.load(now: now) else {
            let unavailableEntry = WavelengthEntry(date: now, progress: nil, nextWave: nil)
            completion(Timeline(
                entries: [unavailableEntry],
                policy: .after(now.addingTimeInterval(WavelengthWidgetConstants.retryInterval))
            ))
            return
        }

        let currentNextWave = snapshot.nextWave.freshUntil > now ? snapshot.nextWave : nil
        let currentEntry = WavelengthEntry(
            date: now,
            progress: snapshot.progress,
            nextWave: currentNextWave
        )
        let recommendationExpiryEntry = WavelengthEntry(
            date: snapshot.nextWave.freshUntil,
            progress: snapshot.progress,
            nextWave: nil
        )
        let expiryEntry = WavelengthEntry(
            date: snapshot.expiresAt,
            progress: nil,
            nextWave: nil
        )
        let futureRefreshDates = [
            snapshot.nextRefreshAt,
            snapshot.nextWave.freshUntil,
            snapshot.expiresAt
        ]
            .filter { $0 > now }
        let refreshDate = futureRefreshDates.min()
            ?? now.addingTimeInterval(WavelengthWidgetConstants.retryInterval)

        if context.family == .systemMedium,
           snapshot.nextWave.freshUntil > now,
           snapshot.nextWave.freshUntil < snapshot.expiresAt {
            completion(Timeline(
                entries: [currentEntry, recommendationExpiryEntry, expiryEntry],
                policy: .after(refreshDate)
            ))
        } else {
            completion(Timeline(entries: [currentEntry, expiryEntry], policy: .after(refreshDate)))
        }
    }
}

private struct WavelengthWidgetView: View {
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.widgetFamily) private var widgetFamily

    let entry: WavelengthEntry

    var body: some View {
        Group {
            switch widgetFamily {
            case .systemMedium:
                if let nextWave = entry.nextWave {
                    nextWaveView(nextWave)
                        .privacySensitive()
                } else {
                    nextWaveUnavailableView
                }
            case .systemSmall:
                smallWidgetView
            default:
                smallWidgetView
            }
        }
        .containerBackground(for: .widget) {
            backgroundColor
        }
    }

    @ViewBuilder
    private var smallWidgetView: some View {
        if let progress = entry.progress {
            progressView(progress)
                .privacySensitive()
        } else {
            unavailableView
        }
    }

    private func widgetSectionHeader(_ title: String, alignment: Alignment) -> some View {
        Text(title)
            .font(.system(size: 9, weight: .semibold))
            .tracking(0.7)
            .frame(maxWidth: .infinity, alignment: alignment)
            .foregroundStyle(accentColor)
            .widgetAccentable()
    }

    private func nextWaveView(_ nextWave: SnapshotNextWave) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            widgetSectionHeader("YOUR NEXT WAVE", alignment: .leading)

            Spacer(minLength: 4)

            HStack(alignment: .top, spacing: 10) {
                Text(nextWave.icon)
                    .font(.system(size: 28))
                    .frame(width: 30, alignment: .leading)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 0) {
                    Text(nextWave.eyebrow)
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(0.45)
                        .foregroundStyle(accentColor)
                        .widgetAccentable()
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.bottom, 5)

                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Text(nextWave.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .layoutPriority(1)

                        if !nextWave.targetLabel.isEmpty {
                            Text("·")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.secondary)

                            Text(nextWave.targetLabel)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    .padding(.bottom, 5)

                    Text(nextWave.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)

                    if !nextWave.action.isEmpty {
                        Text(nextWave.action)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(accentColor)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 40)
                            .background(accentColor.opacity(0.12), in: Capsule())
                            .widgetAccentable()
                            .padding(.top, 12)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .multilineTextAlignment(.leading)
        .accessibilityElement(children: .combine)
    }

    private var nextWaveUnavailableView: some View {
        VStack(alignment: .leading, spacing: 6) {
            widgetSectionHeader("YOUR NEXT WAVE", alignment: .leading)

            Spacer(minLength: 0)

            Image(systemName: "arrow.up.forward.app")
                .font(.title2)
                .foregroundStyle(accentColor)
                .widgetAccentable()
            Text("Open Wavelength")
                .font(.headline)
                .foregroundStyle(.primary)
            Text("Refresh in the app for a current suggestion.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .multilineTextAlignment(.leading)
        .accessibilityElement(children: .combine)
    }

    private func progressView(_ progress: SnapshotProgress) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            widgetSectionHeader("TODAY’S HABITS", alignment: .center)

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
            widgetSectionHeader("TODAY’S HABITS", alignment: .center)

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
        .description("See today’s habit progress or current Next Wave suggestion at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
