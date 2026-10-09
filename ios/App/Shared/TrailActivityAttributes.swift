// 鎖定畫面／動態島「記錄中」卡片的資料格式。App（TrailLivePlugin）和小工具擴充（TrailWidgets）兩邊共用這一份。
// 文字標籤（公里、爬升…）由 App 依使用者語言傳進來，小工具本身不做翻譯。
import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
public struct TrailActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var km: Double
        public var ascent: Int
        public var altitude: Int
        /// 計時起點（已扣掉暫停的時間）：畫面用系統計時器自己走秒，App 不用每秒更新
        public var startedAt: Date
        public var paused: Bool
        /// 暫停時顯示的固定時間（秒）
        public var elapsed: Double
        /// 夥伴的狀態（第三版 R14）：walk 走、rest 休息（暫停或停下來）、pant 爬坡喘；nil＝舊版 App
        public var mood: String?

        public init(km: Double, ascent: Int, altitude: Int, startedAt: Date, paused: Bool, elapsed: Double, mood: String? = nil) {
            self.km = km; self.ascent = ascent; self.altitude = altitude
            self.startedAt = startedAt; self.paused = paused; self.elapsed = elapsed; self.mood = mood
        }
    }

    public var trailName: String
    /// 依 App 語言的標籤：km、up（爬升）、alt（海拔）、rec（記錄中）、paused（暫停）、walk／rest／pant（夥伴狀態，R14）
    public var labels: [String: String]

    public init(trailName: String, labels: [String: String]) {
        self.trailName = trailName
        self.labels = labels
    }
}
#endif
