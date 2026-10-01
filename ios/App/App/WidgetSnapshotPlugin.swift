import Capacitor
import Foundation
import WidgetKit

@objc(WidgetSnapshotPlugin)
class WidgetSnapshotPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "WidgetSnapshotPlugin"
    let jsName = "WidgetSnapshot"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise)
    ]

    private static let appGroupIdentifier = "group.com.bocametrics.wavelength"
    private static let snapshotFilename = "widget-snapshot-v1.json"
    private static let maximumSnapshotBytes = 64 * 1024

    @objc func publish(_ call: CAPPluginCall) {
        guard call.getInt("schemaVersion") == 1 else {
            call.reject("Unsupported widget snapshot schema", "INVALID_SCHEMA")
            return
        }

        guard let snapshot = call.options as? [String: Any],
              JSONSerialization.isValidJSONObject(snapshot) else {
            call.reject("Widget snapshot must be a JSON object", "INVALID_SNAPSHOT")
            return
        }

        let data: Data
        do {
            data = try JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys])
        } catch {
            call.reject("Unable to encode widget snapshot", "ENCODING_FAILED", error)
            return
        }

        guard data.count <= Self.maximumSnapshotBytes else {
            call.reject("Widget snapshot exceeds the 64 KiB limit", "SNAPSHOT_TOO_LARGE")
            return
        }

        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) else {
            call.reject("App Group container is unavailable", "APP_GROUP_UNAVAILABLE")
            return
        }

        let snapshotURL = containerURL.appendingPathComponent(Self.snapshotFilename, isDirectory: false)
        do {
            try data.write(to: snapshotURL, options: .atomic)
        } catch {
            call.reject("Unable to store widget snapshot", "WRITE_FAILED", error)
            return
        }

        WidgetCenter.shared.reloadTimelines(ofKind: "WavelengthWidget")
        call.resolve(["bytesWritten": data.count])
    }
}
