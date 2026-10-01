// Supabase client 單例 + session 輔助。沒有設定憑證時 ready() 回傳 false，社群分頁顯示「尚未啟用」。
const Supa = (() => {
  let client = null;
  function ready() { return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient); }
  function client_() {
    if (client) return client;
    if (!ready()) return null;
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        flowType: "pkce",   // PKCE：網頁自動處理，原生 App 也能用 exchangeCodeForSession 交換 deep link 的 code
        // 繞過 navigator.locks：iOS 主畫面 PWA / webview 裡它常卡死，導致 getSession() 不回來
        lock: (_name, _timeout, fn) => fn(),
      },
      // Realtime 韌性：部分網路（私人DNS/代理/省電）會很快砍掉閒置 WebSocket → 小隊 presence 頻頻 CLOSED。
      // 心跳從預設 30s 縮到 15s 讓連線不被當閒置而砍；斷線後快速重連。
      realtime: { heartbeatIntervalMs: 15000, timeout: 20000, reconnectAfterMs: t => Math.min(1000 * t, 5000) },
    });
    return client;
  }
  async function user() { return (await meUser()).data.user; }
  // 目前登入者：讀本機 session，不打網路。
  // 原本到處用 auth.getUser()——那是每次都去伺服器驗一次身分，社群頁一次切換就打 6 次；
  // 身分本來就由伺服器端 RLS 用 token 把關，前端只需要知道「我是誰」。回傳格式和 getUser 相同。
  async function meUser() {
    const c = Supa.client(); if (!c) return { data: { user: null } };   // 走 Supa.client()（測試可替換）
    try { const { data } = await c.auth.getSession(); return { data: { user: data && data.session ? data.session.user : null } }; }
    catch (e) { return { data: { user: null } }; }
  }
  async function uid() { const u = (await meUser()).data.user; return u ? u.id : null; }
  // 共用：HTML 跳脫（原本 12 個模組各寫一份）
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&"']/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch])); }
  // 共用：「3 小時前」（跟著介面語言；以前動態寫「分鐘前」、通知寫「分前」）
  function ago(iso) {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return typeof ttAgo === "function" ? ttAgo(s) : (s < 3600 ? Math.floor(s / 60) + " 分鐘前" : s < 86400 ? Math.floor(s / 3600) + " 小時前" : Math.floor(s / 86400) + " 天前");
  }
  // 分享連結：只有真的是網站（http/https、不是本機）才給網址；iOS App 裡 location 是 capacitor://localhost，
  // 分享出去別人打不開，這時只分享文字。
  function webLink(query) {
    try {
      if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return null;
      return location.origin + location.pathname + (query || "");
    } catch (e) { return null; }
  }
  // Supabase 回來的英文錯誤 → 人話
  function errText(msg) {
    const m = String(msg || "");
    if (/rate limit|too many|429/i.test(m)) return "太頻繁了，等一分鐘再試";
    if (/expired|invalid.*(otp|token)|otp.*invalid|token.*(expired|invalid)/i.test(m)) return "驗證碼不對或已過期，再寄一次";
    if (/failed to fetch|network|timeout|逾時/i.test(m)) return "連不上網路，檢查一下再試";
    if (/duplicate|unique/i.test(m)) return "這個已經有了";
    if (/payload too large|too large|size/i.test(m)) return "檔案太大了";
    return "出了點問題，等一下再試試";
  }
  return { ready, client: client_, user, meUser, uid, esc, ago, webLink, errText };
})();
if (typeof module !== "undefined") module.exports = Supa;
