import Capacitor

class WavelengthBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WidgetSnapshotPlugin())
    }
}
