// 自訂的 Capacitor 主畫面：只為了註冊 App 自己的原生外掛（TrailLivePlugin）。
// Main.storyboard 的 customClass 由 scripts/ios-add-widgets.mjs 改成這個類別（ENABLE_WIDGETS=1 才會改）。
import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrailLivePlugin())
    }
}
