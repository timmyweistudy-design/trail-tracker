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
  async function user() {
    const c = client_(); if (!c) return null;
    const { data } = await c.auth.getUser();
    return data ? data.user : null;
  }
  return { ready, client: client_, user };
})();
if (typeof module !== "undefined") module.exports = Supa;
