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
        // 繞過 navigator.locks：iOS 主畫面 PWA / webview 裡它常卡死，導致 getSession() 不回來
        lock: (_name, _timeout, fn) => fn(),
      },
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
