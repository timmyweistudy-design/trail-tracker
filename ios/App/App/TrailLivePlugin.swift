// 原生橋接（JS 端：web/js/native-live.js）
//  - 記錄中：開／更新／結束 Live Activity（鎖定畫面＋動態島，iOS 16.2+）
//  - 主畫面小工具：把連續天數、本週里程、夥伴資料寫進 App Group，請 WidgetKit 重畫
// 小工具擴充是在 Codemagic 建置時才加進專案（scripts/ios-add-widgets.mjs，ENABLE_WIDGETS=1 才會做）。
import Foundation
import UIKit
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif

@objc(TrailLivePlugin)
public class TrailLivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrailLivePlugin"
    public let jsName = "TrailLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "battery", returnType: CAPPluginReturnPromise),
    ]

    static let appGroup = "group.com.timmyweistudy.trailtracker"

    private func groupURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: TrailLivePlugin.appGroup)
    }

    @objc func available(_ call: CAPPluginCall) {
        var live = false
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) { live = ActivityAuthorizationInfo().areActivitiesEnabled }
        #endif
        call.resolve(["live": live, "widget": groupURL() != nil])
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func contentState(_ call: CAPPluginCall) -> TrailActivityAttributes.ContentState {
        let startedMs = call.getDouble("startedAt") ?? Date().timeIntervalSince1970 * 1000
        return TrailActivityAttributes.ContentState(
            km: call.getDouble("km") ?? 0,
            ascent: call.getInt("ascent") ?? 0,
            altitude: call.getInt("altitude") ?? 0,
            startedAt: Date(timeIntervalSince1970: startedMs / 1000),
            paused: call.getBool("paused") ?? false,
            elapsed: call.getDouble("elapsed") ?? 0
        )
    }
    #endif

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["ok": false, "reason": "disabled"]); return }
        var labels: [String: String] = [:]
        if let obj = call.getObject("labels") { for (k, v) in obj { if let s = v as? String { labels[k] = s } } }
        let attrs = TrailActivityAttributes(trailName: call.getString("trail") ?? "", labels: labels)
        let state = contentState(call)
        Task {
            // 同時只留一張（上一趟沒收乾淨的先收掉）
            for a in Activity<TrailActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            do {
                _ = try Activity<TrailActivityAttributes>.request(attributes: attrs, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
                call.resolve(["ok": true])
            } catch {
                call.resolve(["ok": false, "reason": error.localizedDescription])
            }
        }
        #else
        call.resolve(["ok": false])
        #endif
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false]); return }
        let state = contentState(call)
        Task {
            for a in Activity<TrailActivityAttributes>.activities { await a.update(ActivityContent(state: state, staleDate: nil)) }
            call.resolve(["ok": true])
        }
        #else
        call.resolve(["ok": false])
        #endif
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false]); return }
        let hasFinal = call.getDouble("km") != nil
        let state = contentState(call)
        Task {
            for a in Activity<TrailActivityAttributes>.activities {
                // 走完的成績在鎖定畫面多留 10 分鐘，之後系統自己收
                await a.end(hasFinal ? ActivityContent(state: state, staleDate: nil) : nil, dismissalPolicy: .after(Date().addingTimeInterval(600)))
            }
            call.resolve(["ok": true])
        }
        #else
        call.resolve(["ok": false])
        #endif
    }

    /// data：小工具要顯示的 JSON（字串）；pet：夥伴圖 PNG（base64，可省略＝沿用上次的）
    // 電量（記錄中低電量時建議開省電模式）：level 0–1，拿不到是 -1；charging＝充電中或已充飽
    @objc func battery(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIDevice.current.isBatteryMonitoringEnabled = true
            let lvl = UIDevice.current.batteryLevel
            let st = UIDevice.current.batteryState
            call.resolve(["level": lvl < 0 ? -1 : Double(lvl), "charging": st == .charging || st == .full])
        }
    }

    @objc func setWidget(_ call: CAPPluginCall) {
        guard let dir = groupURL() else { call.resolve(["ok": false, "reason": "no-app-group"]); return }
        if let json = call.getString("data") {
            UserDefaults(suiteName: TrailLivePlugin.appGroup)?.set(json, forKey: "widget")
        }
        if let b64 = call.getString("pet"), let png = Data(base64Encoded: b64) {
            try? png.write(to: dir.appendingPathComponent("pet.png"), options: .atomic)
        }
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        #endif
        call.resolve(["ok": true])
    }
}
