// 留存提醒（本地排程通知，Capacitor: @capacitor/local-notifications）：
//   ① 連續天數快中斷 → 當天晚上 19:00 提醒（今天已走 or 沒連續就不排）
//   ② 每週足跡回顧 → 每週日晚上 19:00
//   ③ 夥伴想你了（2026-10-07 寵物新一輪 #7，參考 Finch：溫和、不給罪惡感）→ 3 天以上沒出門，隔天早上 10:00 牠說一句；一天最多一則
// 全部在裝置本地排程，不需後端。預設「關」，要使用者到設定主動開（並授權通知）。網頁版無外掛 → 隱藏開關。
const Reminders = (() => {
  const KEY = "tt_reminders";                 // "1" 開 / 其他 = 關
  const ID_STREAK = 101, ID_WEEKLY = 102, ID_PET = 103;
  function P() {
    const w = window;
    return (w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform()
      && w.Capacitor.Plugins && w.Capacitor.Plugins.LocalNotifications) ? w.Capacitor.Plugins.LocalNotifications : null;
  }
  const available = () => !!P();
  const on = () => { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
  const tt = k => (typeof window.ttT === "function" ? window.ttT(k) : k);

  async function ensurePermission() {
    const p = P(); if (!p) return false;
    try {
      let st = await p.checkPermissions();
      if (st.display === "granted") return true;
      if (st.display === "denied") return false;
      st = await p.requestPermissions();
      return st.display === "granted";
    } catch (e) { return false; }
  }
  function hikedToday() {
    try {
      const recs = (typeof realRecords === "function") ? realRecords() : [];
      const t = new Date(); t.setHours(0, 0, 0, 0);
      return recs.some(r => { const d = new Date(r.date); d.setHours(0, 0, 0, 0); return d.getTime() === t.getTime(); });
    } catch (e) { return false; }
  }
  async function refreshStreak() {
    const p = P(); if (!p || !on()) return;
    try { await p.cancel({ notifications: [{ id: ID_STREAK }] }); } catch (e) { /* */ }
    const streak = (typeof daysStreak === "function") ? daysStreak() : 0;
    if (streak < 1 || hikedToday()) return;                 // 沒連續 or 今天已走 → 免提醒
    const at = new Date(); at.setHours(19, 0, 0, 0);
    if (at.getTime() <= Date.now()) return;                 // 已過 19:00 → 今天不排（明天開 App 再排）
    try {
      await p.schedule({ notifications: [{
        id: ID_STREAK, title: tt("循徑拾光"),
        body: tt("連續 %d 天了，今天走一小段就不會斷").replace("%d", streak),
        schedule: { at },
      }] });
    } catch (e) { /* */ }
  }
  async function scheduleWeekly() {
    const p = P(); if (!p || !on()) return;
    try {
      await p.schedule({ notifications: [{
        id: ID_WEEKLY, title: tt("循徑拾光"), body: tt("來看看你這週走了多遠 🥾"),
        schedule: { on: { weekday: 1, hour: 19, minute: 0 }, repeats: true },   // weekday 1 = 週日
      }] });
    } catch (e) { /* */ }
  }
  const PET_NUDGE = ["%s 在步道口等你，天氣不錯喔", "%s 把背包整理好了，隨時可以出發", "%s 說：走一小段也很好", "%s 想去看看山上的雲"];
  async function refreshPet() {
    const p = P(); if (!p || !on()) return;
    try { await p.cancel({ notifications: [{ id: ID_PET }] }); } catch (e) { /* */ }
    const recs = (typeof realRecords === "function") ? realRecords() : []; if (!recs.length) return;   // 還沒出過門：不催
    const last = recs.reduce((m, r) => (r.date > m ? r.date : m), recs[0].date), idle = (Date.now() - new Date(last).getTime()) / 864e5;
    if (idle < 2) return;   // 隔天 10 點時已經滿 3 天才提醒
    const at = new Date(); at.setDate(at.getDate() + 1); at.setHours(10, 0, 0, 0);
    const nm = (typeof petStats === "function" && petStats().name) || tt("夥伴");
    try { await p.schedule({ notifications: [{ id: ID_PET, title: tt("循徑拾光"), body: tt(PET_NUDGE[Math.floor(Math.random() * PET_NUDGE.length)]).replace("%s", nm), schedule: { at } }] }); } catch (e) { /* */ }
  }
  async function syncAll() {                                  // 開機時：有開才重排（權限沒了就靜默跳過）
    if (!P() || !on()) return;
    if (!(await ensurePermission())) return;
    refreshStreak(); scheduleWeekly(); refreshPet();
  }
  async function enable() {
    if (!P()) { if (typeof toast === "function") toast(tt("這個版本不支援提醒")); return false; }
    if (!(await ensurePermission())) { if (typeof toast === "function") toast(tt("請到系統設定開啟通知權限")); return false; }
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* */ }
    refreshStreak(); scheduleWeekly(); refreshPet();
    return true;
  }
  async function disable() {
    try { localStorage.setItem(KEY, "0"); } catch (e) { /* */ }
    const p = P(); if (p) { try { await p.cancel({ notifications: [{ id: ID_STREAK }, { id: ID_WEEKLY }, { id: ID_PET }] }); } catch (e) { /* */ } }
  }
  return { available, on, enable, disable, syncAll, refreshStreak, refreshPet };
})();
if (typeof window !== "undefined") window.Reminders = Reminders;
