// 原生推播（iOS APNs / Android FCM）。
// 網頁版用 social/push.js 的 Web Push；原生 App 的 WKWebView 不支援 Web Push（PushManager 不存在），
// 改用 Capacitor Push Notifications 外掛拿 APNs/FCM token，交後端（send-push）發送。
// 開機載入（比照 native-cam），global NativePush；實際註冊在登入後 autoRegister。
const NativePush = (() => {
  function plugin() {
    const w = window;
    return (w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform()
      && w.Capacitor.Plugins && w.Capacitor.Plugins.PushNotifications) ? w.Capacitor.Plugins.PushNotifications : null;
  }
  const available = () => !!plugin();
  const tt = k => (typeof window.ttT === "function" ? window.ttT(k) : k);
  function say(k) { try { if (typeof window.toast === "function") window.toast(tt(k)); } catch (e) { /* */ } }

  let _wired = false, _lastToken = null;
  function wireOnce() {
    const P = plugin(); if (!P || _wired) return; _wired = true;
    // 拿到裝置 token → 存進 Supabase（後端發推播時查這張表）
    P.addListener("registration", t => { _lastToken = t && t.value; if (_lastToken) storeToken(_lastToken); });
    // 註冊失敗多半是 build 沒帶 aps-environment 權限（entitlement）→ 靜默，不打擾
    P.addListener("registrationError", () => { /* no-op */ });
    // 點推播通知 → 帶 url 就導過去
    P.addListener("pushNotificationActionPerformed", a => {
      try { const url = a && a.notification && a.notification.data && a.notification.data.url; if (url) location.assign(url); } catch (e) { /* */ }
    });
  }

  async function storeToken(token) {
    try {
      if (typeof Supa === "undefined" || !Supa.ready()) return;
      const c = Supa.client(); if (!c) return;
      const { data: u } = await c.auth.getUser(); if (!u || !u.user) return;
      const platform = (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || "ios";
      await c.from("native_push_tokens").upsert(
        { user_id: u.user.id, token, platform, updated_at: new Date().toISOString() },
        { onConflict: "user_id,token" });
      localStorage.setItem("tt_native_push", "1");
    } catch (e) { /* */ }
  }

  async function isOn() {
    const P = plugin(); if (!P) return false;
    try { const p = await P.checkPermissions(); return p && p.receive === "granted" && localStorage.getItem("tt_native_push") === "1"; }
    catch (e) { return false; }
  }

  async function enable() {
    const P = plugin(); if (!P) return false;
    wireOnce();
    try {
      let perm = await P.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await P.requestPermissions();
      if (perm.receive !== "granted") { say("未允許通知權限"); return false; }
      await P.register();                       // 觸發 registration 事件 → storeToken
      localStorage.setItem("tt_native_push", "1");
      say("已開啟推播通知");
      return true;
    } catch (e) { return false; }
  }

  async function disable() {
    try {
      localStorage.removeItem("tt_native_push");
      if (typeof Supa !== "undefined" && Supa.ready()) {
        const c = Supa.client();
        const { data: u } = await c.auth.getUser();
        if (u && u.user && _lastToken) await c.from("native_push_tokens").delete().eq("user_id", u.user.id).eq("token", _lastToken);
      }
      say("已關閉推播通知");
    } catch (e) { /* */ }
    return false;
  }

  async function toggle() { return (await isOn()) ? (await disable(), false) : await enable(); }

  // 登入後呼叫：之前開過推播就重新註冊（APNs token 會換，要刷新回存）
  async function autoRegister() {
    const P = plugin(); if (!P) return;
    if (localStorage.getItem("tt_native_push") !== "1") return;
    wireOnce();
    try { const p = await P.checkPermissions(); if (p.receive === "granted") await P.register(); } catch (e) { /* */ }
  }

  return { available, isOn, enable, disable, toggle, autoRegister };
})();
if (typeof window !== "undefined") window.NativePush = NativePush;
if (typeof module !== "undefined" && module.exports) module.exports = NativePush;
