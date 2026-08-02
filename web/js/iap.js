// 原生 App 內購（RevenueCat）：Apple StoreKit / Google Play Billing 的統一包裝。
// 網頁版永遠用不到（available() 為假），付費走 Stripe（premium.js）。
// 訂閱狀態的真相仍在 subscriptions 表——這裡只負責「買」與「回復」，狀態由 RevenueCat webhook 寫回。
const IAP = (() => {
  const ENTITLEMENT = "premium";
  let _configured = false;
  let _lastErr = "";

  // IAP 的失敗一律被 catch 吞掉 → 畫面上全都長成「設定中」，無從分辨是沒 configure、
  // 抓不到產品、key 錯還是網路斷。這裡把真正的原因留下來：記進 phase19 的錯誤佇列
  // （app.js 開機 6 秒後批次上傳到 client_errors 表），並供畫面直接顯示。
  function note(stage, e) {
    const raw = (e && (e.message || e.code)) || (typeof e === "string" ? e : "") || "unknown";
    _lastErr = ("IAP " + stage + ": " + raw).slice(0, 300);
    try {
      const a = JSON.parse(localStorage.getItem("tt_errors") || "[]");
      a.unshift({ t: new Date().toISOString(), m: _lastErr });
      localStorage.setItem("tt_errors", JSON.stringify(a.slice(0, 20)));
    } catch (_) { /* 無 localStorage 就算了，不能因為記錯誤而再噴一個錯誤 */ }
  }
  function lastError() { return _lastErr; }

  function plugin() {
    const w = (typeof window !== "undefined") ? window : {};
    return (w.Capacitor && w.Capacitor.Plugins && w.Capacitor.Plugins.Purchases) || null;
  }
  function native() {
    const w = (typeof window !== "undefined") ? window : {};
    return !!(w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform());
  }
  // 原生 App＋SDK 在＋後台已設定好，三者皆備才走 IAP；缺一律降級（原生顯示「即將開放」，絕不退回 Stripe）
  function available() {
    const w = (typeof window !== "undefined") ? window : {};
    return !!(w.IAP_ENABLED && native() && plugin());
  }
  function isIOS() {
    const w = window;
    return !!(w.Capacitor && w.Capacitor.getPlatform && w.Capacitor.getPlatform() === "ios");
  }
  function apiKey() { return isIOS() ? (window.REVENUECAT_IOS_KEY || "") : (window.REVENUECAT_ANDROID_KEY || ""); }

  // 登入後呼叫：把 RevenueCat 的 app_user_id 綁成 Supabase user id，webhook 才對得回同一個人
  async function init(uid) {
    if (!available()) { note("init", "available() 為假（IAP_ENABLED/原生/外掛 三者有缺）"); return false; }
    if (!uid) { note("init", "沒有 uid（未登入）"); return false; }
    const P = plugin();
    const key = apiKey();
    if (!key) { note("init", "apiKey 是空的（platform=" + ((window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || "?") + "）"); return false; }
    try {
      if (!_configured) { await P.configure({ apiKey: key, appUserID: uid }); _configured = true; }
      else await P.logIn({ appUserID: uid });
      return true;
    } catch (e) { note(_configured ? "logIn" : "configure", e); return false; }
  }

  // 商店回傳的方案（含當地價格字串）：Apple 規定價格必須與商店一致，不能寫死 NT$60
  async function plans() {
    if (!available()) return null;
    try {
      // getOfferings() 回的是 PurchasesOfferings = { all, current }——沒有 offerings 這層包裝。
      // 曾經誤寫成 r.offerings.current（永遠 undefined → 面板一直顯示「設定中」），且假外掛照著錯的
      // 形狀寫、跟程式碼互相配合，e2e 因此全綠。動這裡前先看 node_modules 的 .d.ts，不要照記憶寫。
      if (!_configured) { note("plans", "還沒 configure() 就要方案"); return null; }
      const r = await plugin().getOfferings();
      const cur = r && r.current;
      if (!cur) { note("plans", "沒有 current offering（後台 offering 沒設成 current？keys=" + Object.keys((r && r.all) || {}).join(",") + "）"); return null; }
      if (!Array.isArray(cur.availablePackages)) { note("plans", "current offering 沒有 availablePackages 陣列"); return null; }
      const pick = k => {
        const p = cur.availablePackages.find(x => x.packageType === k);
        return p ? { pkg: p, price: (p.product && p.product.priceString) || "" } : null;
      };
      const month = pick("MONTHLY"), year = pick("ANNUAL");
      if (!month && !year) {
        note("plans", "offering「" + (cur.identifier || "?") + "」裡沒有 MONTHLY/ANNUAL package（實際有：" +
          cur.availablePackages.map(x => x.packageType).join(",") + "）");
        return null;
      }
      return { month, year };
    } catch (e) { note("getOfferings", e); return null; }
  }

  // 回傳 "ok"（買到）/ "cancel"（使用者取消，呼叫端不要 toast）/ "fail"
  async function purchase(plan) {
    if (!available()) return "fail";
    const ps = await plans(); if (!ps) return "noplans";   // 商店拿不到方案（付費協議未生效/商品未傳播）→ 呼叫端給明確訊息
    const target = (plan === "year" ? ps.year : ps.month) || ps.month || ps.year;
    if (!target) return "fail";
    try {
      const r = await plugin().purchasePackage({ aPackage: target.pkg });
      const ent = r && r.customerInfo && r.customerInfo.entitlements && r.customerInfo.entitlements.active;
      return (ent && ent[ENTITLEMENT]) ? "ok" : "fail";
    } catch (e) {
      if (e && (e.userCancelled || String(e.code) === "1" || (e.message || "").toLowerCase().includes("cancel"))) return "cancel";
      note("purchasePackage", e);
      return "fail";
    }
  }

  // 回復購買（Apple 審核必要項：換手機/重裝的人要能拿回訂閱）
  async function restore() {
    if (!available()) return false;
    try {
      const r = await plugin().restorePurchases();
      const ent = r && r.customerInfo && r.customerInfo.entitlements && r.customerInfo.entitlements.active;
      return !!(ent && ent[ENTITLEMENT]);
    } catch (e) { return false; }
  }

  // 商店端的訂閱狀態（裝置上的權威來源）。
  // 訂閱狀態的「帳本」是 subscriptions 表，但那張表要等 RevenueCat webhook 寫回；webhook 慢、
  // 失敗、或 app_user_id 沒綁到 Supabase uid 時，使用者會「付了錢卻沒解鎖」——回復購買尤其明顯：
  // 商店說有、App 卻不給。Apple 審核必測回復購買，回復無效是拒審理由。
  // 故 premium.js 會拿這個當「商店已確認」的即時憑據先解鎖，帳本晚點對上不影響。
  // 介面照 node_modules/@revenuecat/purchases-capacitor 的 definitions.d.ts：
  //   getCustomerInfo(): Promise<{ customerInfo: CustomerInfo }>；entitlements.active 是 map。
  async function entitlementActive() {
    if (!available() || !_configured) return false;
    try {
      const r = await plugin().getCustomerInfo();
      const ent = r && r.customerInfo && r.customerInfo.entitlements && r.customerInfo.entitlements.active;
      const e = ent && ent[ENTITLEMENT];
      if (!e) return false;
      // isActive 已含過期判斷；仍多擋一次過期時間，避免 SDK 快取到舊資料
      if (e.expirationDate && new Date(e.expirationDate) <= new Date()) return false;
      return e.isActive !== false;
    } catch (e) { note("getCustomerInfo", e); return false; }
  }

  // 管理訂閱：開系統的訂閱設定頁（原生不得開 Stripe portal）
  function manageUrl() {
    return isIOS() ? "itms-apps://apps.apple.com/account/subscriptions"
                   : "https://play.google.com/store/account/subscriptions";
  }

  return { available, native, init, plans, purchase, restore, entitlementActive, manageUrl, lastError };
})();
if (typeof module !== "undefined" && module.exports) module.exports = IAP;
