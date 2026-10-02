// 循徑拾光的小工具擴充：主畫面／鎖定畫面小工具＋記錄中的 Live Activity（鎖定畫面、動態島）。
// 由 scripts/ios-add-widgets.mjs 在建置時加進 Xcode 專案；最低 iOS 16.2。
import WidgetKit
import SwiftUI

@main
struct TrailWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TrailHomeWidget()
        TrailLiveActivity()
    }
}

/// 品牌色
enum TT {
    static let deep = Color(red: 0.086, green: 0.188, blue: 0.122)     // #16301f
    static let forest = Color(red: 0.122, green: 0.278, blue: 0.188)   // #1f4730
    static let gold = Color(red: 0.878, green: 0.694, blue: 0.353)     // #e0b15a
    static let cream = Color(red: 0.953, green: 0.937, blue: 0.894)    // #f3efe4
    static let leaf = Color(red: 0.498, green: 0.812, blue: 0.596)     // #7fcf98
}
