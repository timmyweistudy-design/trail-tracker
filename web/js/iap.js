// 原生 App 內購（RevenueCat）：Apple StoreKit / Google Play Billing 的統一包裝。
// 網頁版永遠用不到（available() 為假），付費走 Stripe（premium.js）。
// 訂閱狀態的真相仍在 subscriptions 表——這裡只負責「買」與「回復」，狀態由 RevenueCat webhook 寫回。
const IAP = (() => {
  const ENTITLEMENT = "premium";
  let _configured = false;

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
    if (!available() || !uid) return false;
    const P = plugin();
    try {
      if (!_configured) { await P.configure({ apiKey: apiKey(), appUserID: uid }); _configured = true; }
      else await P.logIn({ appUserID: uid });
      return true;
    } catch (e) { return false; }
  }

  // 商店回傳的方案（含當地價格字串）：Apple 規定價格必須與商店一致，不能寫死 NT$60
  async function plans() {
    if (!available()) return null;
    try {
      const r = await plugin().getOfferings();
      const cur = r && r.offerings && r.offerings.current;
      if (!cur || !Array.isArray(cur.availablePackages)) return null;
      const pick = k => {
        const p = cur.availablePackages.find(x => x.packageType === k);
        return p ? { pkg: p, price: (p.product && p.product.priceString) || "" } : null;
      };
      const month = pick("MONTHLY"), year = pick("ANNUAL");
      if (!month && !year) return null;
      return { month, year };
    } catch (e) { return null; }
  }

  // 回傳 "ok"（買到）/ "cancel"（使用者取消，呼叫端不要 toast）/ "fail"
  async function purchase(plan) {
    if (!available()) return "fail";
    const ps = await plans(); if (!ps) return "fail";
    const target = (plan === "year" ? ps.year : ps.month) || ps.month || ps.year;
    if (!target) return "fail";
    try {
      const r = await plugin().purchasePackage({ aPackage: target.pkg });
      const ent = r && r.customerInfo && r.customerInfo.entitlements && r.customerInfo.entitlements.active;
      return (ent && ent[ENTITLEMENT]) ? "ok" : "fail";
    } catch (e) {
      if (e && (e.userCancelled || String(e.code) === "1" || (e.message || "").toLowerCase().includes("cancel"))) return "cancel";
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

  // 管理訂閱：開系統的訂閱設定頁（原生不得開 Stripe portal）
  function manageUrl() {
    return isIOS() ? "itms-apps://apps.apple.com/account/subscriptions"
                   : "https://play.google.com/store/account/subscriptions";
  }

  return { available, native, init, plans, purchase, restore, manageUrl };
})();
if (typeof module !== "undefined" && module.exports) module.exports = IAP;
