// App Store / Google Play 內建評分邀請（Capacitor: @capacitor-community/in-app-review）。
// 只在「原生 App + 走完有意義的一趟 + 很久沒問過」時，才在系統層請使用者評分一次（不跳出自製對話框、不導離 App）。
// 網頁版沒有這個外掛 → 靜默 no-op。iOS/Play 系統本身也會再限制實際顯示頻率。
const ReviewPrompt = (() => {
  const KEY_AT = "tt_review_at", KEY_N = "tt_review_n";
  function plugin() {
    const w = window;
    return (w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform()
      && w.Capacitor.Plugins && w.Capacitor.Plugins.InAppReview) ? w.Capacitor.Plugins.InAppReview : null;
  }
  const num = k => { try { return +(localStorage.getItem(k) || 0) || 0; } catch (e) { return 0; } };
  // 好時機判定：真的用了幾趟、這趟不是走兩步、間隔夠久、一輩子問的次數有限
  function eligible(rec) {
    if (!plugin()) return false;
    if (((rec && rec.distanceKm) || 0) < 0.5) return false;          // 太短的一趟不是好時機
    const real = (typeof realRecords === "function") ? realRecords().length : 0;
    if (real < 3) return false;                                       // 累積 3 趟以上＝確定會用了才問
    if (num(KEY_N) >= 4) return false;                                // 一輩子最多 4 次（比照 iOS 一年上限）
    const last = num(KEY_AT);
    if (last && Date.now() - last < 45 * 864e5) return false;         // 距上次至少 45 天
    return true;
  }
  async function maybeAsk(rec) {
    try {
      if (!eligible(rec)) return;
      const P = plugin(); if (!P) return;
      try { localStorage.setItem(KEY_AT, String(Date.now())); localStorage.setItem(KEY_N, String(num(KEY_N) + 1)); } catch (e) { /* */ }
      setTimeout(() => { try { P.requestReview(); } catch (e) { /* */ } }, 1600);   // 等結算頁動畫穩定再出
    } catch (e) { /* 靜默：評分失敗不影響任何功能 */ }
  }
  return { maybeAsk, eligible };
})();
if (typeof window !== "undefined") window.ReviewPrompt = ReviewPrompt;
