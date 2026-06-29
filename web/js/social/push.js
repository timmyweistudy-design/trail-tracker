// Web Push 推播：向瀏覽器訂閱推播、把訂閱存到 Supabase。需 config 的 VAPID_PUBLIC_KEY + 部署 Edge Function 發送。
const Push = (() => {
  function supported() {
    return !!(window.VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }
  function urlB64ToUint8Array(base64) {
    const pad = "=".repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64); const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function isOn() {
    try {
      if (!supported()) return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) { return false; }
  }

  async function enable() {
    if (!supported()) { if (typeof toast === "function") toast("此裝置不支援推播"); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { if (typeof toast === "function") toast("未允許通知權限"); return false; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(window.VAPID_PUBLIC_KEY) });
    const c = (typeof Supa !== "undefined") ? Supa.client() : null;
    const { data: u } = c ? await c.auth.getUser() : { data: null };
    if (!c || !u || !u.user) { if (typeof toast === "function") toast("請先登入社群"); return false; }
    const j = sub.toJSON();
    const { error } = await c.from("push_subscriptions").upsert({
      user_id: u.user.id, endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    }, { onConflict: "endpoint" });
    if (error) { if (typeof toast === "function") toast("訂閱失敗：" + error.message); return false; }
    if (typeof toast === "function") toast("已開啟推播通知");
    return true;
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const c = (typeof Supa !== "undefined") ? Supa.client() : null;
        if (c) await c.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      if (typeof toast === "function") toast("已關閉推播通知");
    } catch (e) { /* */ }
  }

  async function toggle() { return (await isOn()) ? (await disable(), false) : await enable(); }

  return { supported, isOn, enable, disable, toggle };
})();
