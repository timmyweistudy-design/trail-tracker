// 主畫面／鎖定畫面小工具：夥伴、連續天數、本週里程、本月挑戰進度。
// 資料由 App 寫進 App Group（TrailLivePlugin.setWidget）：UserDefaults 的 "widget"（JSON）＋ pet.png。
import WidgetKit
import SwiftUI
import UIKit

private let appGroup = "group.com.timmyweistudy.trailtracker"

struct WidgetData: Codable {
    var streak: Int = 0
    var weekKm: Double = 0
    var monthKm: Double = 0
    var goalKm: Double? = nil
    var petName: String = ""
    var petLevel: Int = 1
    var hikedToday: Bool = false
    /// 非 PRO：小工具只顯示「PRO 會員專屬」（舊版 App 寫的資料沒有這欄 → 視為沒鎖）
    var locked: Bool? = nil
    var labels: [String: String] = [:]

    func t(_ key: String, _ fallback: String) -> String { labels[key] ?? fallback }

    static func load() -> WidgetData {
        guard let s = UserDefaults(suiteName: appGroup)?.string(forKey: "widget"),
              let d = s.data(using: .utf8),
              let v = try? JSONDecoder().decode(WidgetData.self, from: d) else { return WidgetData() }
        return v
    }
    static func petImage() -> UIImage? {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        return UIImage(contentsOfFile: dir.appendingPathComponent("pet.png").path)
    }
}

struct HomeEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
    let pet: UIImage?
}

struct HomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeEntry {
        HomeEntry(date: Date(), data: WidgetData(streak: 3, weekKm: 12.4, monthKm: 30, goalKm: 45, petName: "小苔", petLevel: 3), pet: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (HomeEntry) -> Void) {
        completion(HomeEntry(date: Date(), data: WidgetData.load(), pet: WidgetData.petImage()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeEntry>) -> Void) {
        let entry = HomeEntry(date: Date(), data: WidgetData.load(), pet: WidgetData.petImage())
        // 過了午夜「今天走了沒」會變，隔天清晨重畫一次；平常靠 App 寫入後主動 reload
        let cal = Calendar.current
        let next = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: Date()))?.addingTimeInterval(5 * 60) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct PetView: View {
    let image: UIImage?
    var body: some View {
        if let image { Image(uiImage: image).resizable().scaledToFit() }
        else { Image(systemName: "pawprint.fill").resizable().scaledToFit().foregroundStyle(TT.gold).padding(8) }
    }
}

struct HomeWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: HomeEntry
    private var d: WidgetData { entry.data }
    private func km(_ v: Double) -> String { v >= 100 ? String(format: "%.0f", v) : String(format: "%.1f", v) }

    var body: some View {
        if d.locked == true { lockedView } else { content }
    }

    @ViewBuilder private var lockedView: some View {
        switch family {
        case .accessoryCircular, .accessoryRectangular:
            Label(d.t("locked", "PRO 會員專屬小工具"), systemImage: "lock.fill").font(.caption)
        default:
            VStack(spacing: 6) {
                Image(systemName: "lock.fill").font(.title3).foregroundStyle(TT.gold)
                Text(d.t("locked", "PRO 會員專屬小工具")).font(.caption.weight(.semibold)).multilineTextAlignment(.center)
                Text(d.t("unlock", "打開 App 升級")).font(.caption2).foregroundStyle(TT.cream.opacity(0.7))
            }
            .foregroundStyle(TT.cream)
        }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text("\(d.streak)").font(.system(size: 22, weight: .bold, design: .rounded))
                    Text(d.t("days", "天")).font(.system(size: 10))
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("\(d.t("streak", "連續")) \(d.streak) \(d.t("days", "天"))").font(.headline)
                Text("\(d.t("week", "本週")) \(km(d.weekKm)) km").font(.caption)
                if let g = d.goalKm, g > 0 { ProgressView(value: min(d.monthKm, g), total: g) }
            }
        case .systemMedium:
            HStack(spacing: 14) {
                VStack(spacing: 4) {
                    PetView(image: entry.pet).frame(width: 82, height: 82)
                    Text(d.petName.isEmpty ? " " : "\(d.petName) Lv.\(d.petLevel)").font(.caption2).foregroundStyle(TT.cream.opacity(0.85)).lineLimit(1)
                }
                VStack(alignment: .leading, spacing: 8) {
                    stat(d.t("streak", "連續"), "\(d.streak)", d.t("days", "天"))
                    stat(d.t("week", "本週"), km(d.weekKm), "km")
                    if let g = d.goalKm, g > 0 {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(d.t("challenge", "本月挑戰")).font(.caption2).foregroundStyle(TT.cream.opacity(0.75))
                            ProgressView(value: min(d.monthKm, g), total: g).tint(TT.gold)
                            Text("\(km(d.monthKm)) / \(km(g)) km").font(.caption2.monospacedDigit()).foregroundStyle(TT.cream.opacity(0.85))
                        }
                    } else {
                        Text(d.hikedToday ? d.t("done", "今天走過了") : d.t("nudge", "今天出門走走吧")).font(.caption).foregroundStyle(TT.gold)
                    }
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(TT.cream)
        default:
            VStack(spacing: 4) {
                PetView(image: entry.pet).frame(width: 64, height: 64)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(d.streak)").font(.system(size: 26, weight: .bold, design: .rounded))
                    Text(d.t("days", "天")).font(.caption)
                }
                Text("\(d.t("week", "本週")) \(km(d.weekKm)) km").font(.caption2).foregroundStyle(TT.cream.opacity(0.8)).lineLimit(1)
            }
            .foregroundStyle(TT.cream)
        }
    }

    private func stat(_ label: String, _ value: String, _ unit: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(TT.cream.opacity(0.75))
            Text(value).font(.system(size: 20, weight: .bold, design: .rounded))
            Text(unit).font(.caption2).foregroundStyle(TT.cream.opacity(0.75))
        }
    }
}

struct TrailHomeWidget: Widget {
    let kind = "TrailHomeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeProvider()) { entry in
            if #available(iOS 17.0, *) {
                HomeWidgetView(entry: entry)
                    .containerBackground(for: .widget) { LinearGradient(colors: [TT.forest, TT.deep], startPoint: .topLeading, endPoint: .bottomTrailing) }
                    .widgetURL(URL(string: "com.timmyweistudy.trailtracker://open?view=pet"))
            } else {
                HomeWidgetView(entry: entry)
                    .padding()
                    .background(LinearGradient(colors: [TT.forest, TT.deep], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .widgetURL(URL(string: "com.timmyweistudy.trailtracker://open?view=pet"))
            }
        }
        .configurationDisplayName("循徑拾光")
        .description("夥伴、連續天數和本週里程")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}
