// 記錄中的 Live Activity：鎖定畫面卡片＋動態島（展開／精簡／最小）。
// 時間用系統計時器（Text(timerInterval:)）自己走，App 只在里程、爬升變了才更新。
import ActivityKit
import WidgetKit
import SwiftUI

struct TrailLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrailActivityAttributes.self) { ctx in
            LockScreenView(attrs: ctx.attributes, st: ctx.state)
                .activityBackgroundTint(TT.deep.opacity(0.92))
                .activitySystemActionForegroundColor(TT.cream)
                .widgetURL(URL(string: "com.timmyweistudy.trailtracker://open?view=record"))
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(kmText(ctx.state.km)).font(.system(size: 26, weight: .bold, design: .rounded)).monospacedDigit()
                        Text(ctx.attributes.labels["km"] ?? "公里").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        TimerText(st: ctx.state).font(.system(size: 22, weight: .semibold, design: .rounded))
                        Text(ctx.state.paused ? (ctx.attributes.labels["paused"] ?? "暫停") : (ctx.attributes.labels["rec"] ?? "記錄中"))
                            .font(.caption2).foregroundStyle(ctx.state.paused ? Color.orange : TT.leaf)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(ctx.attributes.trailName).font(.caption).lineLimit(1).foregroundStyle(TT.gold)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Label("\(ctx.attributes.labels["up"] ?? "爬升") \(ctx.state.ascent) m", systemImage: "arrow.up.right")
                        Spacer()
                        if ctx.state.altitude > 0 { Label("\(ctx.attributes.labels["alt"] ?? "海拔") \(ctx.state.altitude) m", systemImage: "mountain.2") }
                    }
                    .font(.caption).foregroundStyle(.secondary)
                }
            } compactLeading: {
                PetMoodIcon(mood: ctx.state.mood, paused: ctx.state.paused).frame(width: 22, height: 22)
            } compactTrailing: {
                Text(kmText(ctx.state.km) + " km").font(.caption.weight(.semibold)).monospacedDigit()
            } minimal: {
                Image(systemName: "figure.hiking").foregroundStyle(TT.leaf)
            }
            .widgetURL(URL(string: "com.timmyweistudy.trailtracker://open?view=record"))
            .keylineTint(TT.gold)
        }
    }
}

/// 夥伴的靜態狀態圖（R14，原28 縮小版——不做動畫）：小工具存在 App Group 的夥伴圖（戴著帽子、配件）＋右下角一個小記號
/// 走＝腳印、休息＝zzz、喘＝風；沒有夥伴圖（舊版、沒開 App Group）就退回原本的登山圖示
struct PetMoodIcon: View {
    let mood: String?
    let paused: Bool
    private var m: String { paused ? "rest" : (mood ?? "walk") }
    var body: some View {
        if let img = WidgetData.petImage(m == "rest" ? "pet-sleep.png" : "pet.png") ?? WidgetData.petImage() {
            ZStack(alignment: .bottomTrailing) {
                Image(uiImage: img).resizable().scaledToFit()
                Image(systemName: m == "rest" ? "zzz" : m == "pant" ? "wind" : "shoeprints.fill")
                    .font(.system(size: 8, weight: .bold)).foregroundStyle(m == "pant" ? Color.orange : TT.leaf)
                    .padding(2).background(Circle().fill(TT.deep.opacity(0.85)))
            }
        } else {
            Image(systemName: paused ? "pause.circle.fill" : "figure.hiking").resizable().scaledToFit().foregroundStyle(paused ? Color.orange : TT.leaf)
        }
    }
}
private func moodLabel(_ a: TrailActivityAttributes, _ st: TrailActivityAttributes.ContentState) -> String? {
    guard let m = st.mood else { return nil }
    return a.labels[m]
}

private func kmText(_ v: Double) -> String { v >= 100 ? String(format: "%.0f", v) : String(format: "%.2f", v) }

struct TimerText: View {
    let st: TrailActivityAttributes.ContentState
    var body: some View {
        if st.paused {
            let s = Int(st.elapsed)
            Text(s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s % 3600 / 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)).monospacedDigit()
        } else {
            Text(timerInterval: st.startedAt...Date.distantFuture, countsDown: false).monospacedDigit()
        }
    }
}

struct LockScreenView: View {
    let attrs: TrailActivityAttributes
    let st: TrailActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                PetMoodIcon(mood: st.mood, paused: st.paused).frame(width: 30, height: 30)
                Text(attrs.trailName).font(.subheadline.weight(.semibold)).foregroundStyle(TT.gold).lineLimit(1)
                Spacer()
                Text(st.paused ? (attrs.labels["paused"] ?? "暫停") : moodLabel(attrs, st) ?? (attrs.labels["rec"] ?? "記錄中")).font(.caption).foregroundStyle(TT.cream.opacity(0.7))
            }
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(kmText(st.km)).font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
                    Text(attrs.labels["km"] ?? "公里").font(.caption2).foregroundStyle(TT.cream.opacity(0.7))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    TimerText(st: st).font(.system(size: 26, weight: .semibold, design: .rounded))
                    HStack(spacing: 10) {
                        Text("↑\(st.ascent) m")
                        if st.altitude > 0 { Text("\(attrs.labels["alt"] ?? "海拔") \(st.altitude) m") }
                    }
                    .font(.caption2).foregroundStyle(TT.cream.opacity(0.7))
                }
            }
        }
        .foregroundStyle(TT.cream)
        .padding(16)
    }
}
