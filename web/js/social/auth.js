// 認證流程：Google OAuth / Email 魔法連結、session 取得、profile 讀取、onboarding 建檔。
const Auth = (() => {
  let onChange = () => {};

  // 原生 App 偵測 + 深層連結回呼位址（Supabase 後台的 Redirect URLs 要加這條）
  const NATIVE = !!(typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const REDIRECT = "com.timmyweistudy.trailtracker://login-callback";
  function _cap(name) { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; }

  function init(cb) {
    onChange = cb || (() => {});
    const c = Supa.client(); if (!c) return;
    c.auth.onAuthStateChange((_e, s) => {
      onChange();                                 // 登入/登出/回呼後重新路由
      // 原生 IAP：把 RevenueCat 的 app_user_id 綁成 Supabase user id，webhook 才對得回同一個人
      const uid = s && s.user ? s.user.id : null;
      if (uid && typeof IAP !== "undefined" && IAP.available()) { IAP.init(uid).catch(() => {}); }
      // 原生推播：登入後若之前開過，重新註冊刷新 APNs token（token 會換）
      if (uid && typeof NativePush !== "undefined" && NativePush.available()) { NativePush.autoRegister().catch(() => {}); }
    });
    initNativeAuth();
  }
  // 原生 App：Google 登入是用系統瀏覽器開，登完會用 deep link 帶 code 回來→這裡攔截並換 session
  let _nativeAuthHooked = false;
  function initNativeAuth() {
    if (!NATIVE || _nativeAuthHooked) return;
    const App = _cap("App"); if (!App) return;
    _nativeAuthHooked = true;
    App.addListener("appUrlOpen", async ev => {
      try {
        const url = ev && ev.url; if (!url || url.indexOf("login-callback") < 0) return;
        const q = url.split("?")[1] || ""; const code = new URLSearchParams(q).get("code");
        const c = Supa.client();
        if (code && c) await c.auth.exchangeCodeForSession(code);   // PKCE：用 code 換到 session
        const Browser = _cap("Browser"); if (Browser && Browser.close) { try { await Browser.close(); } catch (e) { /* */ } }
        onChange();
      } catch (e) { /* 交換失敗不影響 App */ }
    });
  }

  async function session() {
    const c = Supa.client(); if (!c) return null;
    const { data } = await c.auth.getSession();
    return data ? data.session : null;
  }

  async function signInGoogle() {
    const c = Supa.client(); if (!c) return;
    if (NATIVE) {
      // 原生：Google 擋 WebView 內登入，改用系統瀏覽器(Chrome Custom Tab)開，登完 deep link 回來
      const { data, error } = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: REDIRECT, skipBrowserRedirect: true } });
      if (error || !data || !data.url) { if (typeof toast === "function") toast(T("Google 登入開不起來，等一下再試")); return; }
      const Browser = _cap("Browser");
      if (Browser) await Browser.open({ url: data.url, presentationStyle: "popover" });
      else window.open(data.url, "_system");
      return;
    }
    await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  }

  // 寄送 Email 驗證碼（OTP）。全程留在 App，避免魔法連結在別的瀏覽器開、裝在主畫面的 App 登不進去。
  async function signInEmail(email) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return { error: error ? error.message : null };
  }

  // 用 6 位數驗證碼登入（在同一個 App context 完成 session）
  async function verifyEmailCode(email, token) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { error } = await c.auth.verifyOtp({ email, token, type: "email" });
    return { error: error ? error.message : null };
  }

  // 本機登出：只清本地 session，不等伺服器撤銷回應（避免網路慢/卡住，登出才會絲滑即時）
  async function signOut() {
    const c = Supa.client(); if (!c) return;
    // 先撤銷推播：push_subscriptions 以瀏覽器 endpoint 為鍵，不解除的話共用裝置上
    // 下一位使用者仍會收到前一位的社群通知
    try { if (typeof Push !== "undefined" && Push.isOn && await Push.isOn()) await Push.disable(); } catch (e) { /* 不擋登出 */ }
    try { if (typeof NativePush !== "undefined" && NativePush.available() && await NativePush.isOn()) await NativePush.disable(); } catch (e) { /* 不擋登出 */ }
    try { if (typeof Premium !== "undefined" && Premium.clearCache) Premium.clearCache(); } catch (e) { /* */ }   // 會員快取不可留給下一個人
    try { await c.auth.signOut({ scope: "local" }); } catch (e) { /* 仍視為已登出 */ }
    try { if (window._meUserReset) window._meUserReset(); } catch (e) { /* */ }   // 「我的」頁快取的登入者也要清掉
  }

  const esc = s => Supa.esc(s);

  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const onEnter = (el, fn) => el && el.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); fn(); } });

  function renderLogin(render) {
    const google = window.SOCIAL_GOOGLE
      ? `<button class="btn primary" id="authGoogle">${T("使用 Google 繼續")}</button><div class="auth-or">${T("或")}</div>` : "";
    render(`
      <div class="social-auth">
        <div class="auth-logo"><img src="icons/icon-192.png" alt="" width="64" height="64"></div>
        <h3>${T("加入山友社群")}</h3>
        <p class="auth-sub">${T("分享你的步道旅行，看看好友走過哪裡。")}</p>
        ${google}
        <input type="email" id="authEmail" class="auth-input" placeholder="${T("輸入 Email")}" inputmode="email" autocapitalize="off" autocomplete="email" enterkeyhint="send">
        <button class="btn ghost" id="authEmailBtn">${T("寄驗證碼給我")}</button>
        <div class="auth-msg" id="authMsg" role="alert"></div>
      </div>`);
    if (window.SOCIAL_GOOGLE) document.getElementById("authGoogle").addEventListener("click", signInGoogle);
    const btn = document.getElementById("authEmailBtn");
    const go = async () => {
      if (btn.disabled) return;
      const email = (document.getElementById("authEmail").value || "").trim();
      const msg = document.getElementById("authMsg");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = T("Email 好像打錯了"); msg.className = "auth-msg bad"; return; }
      btn.disabled = true; msg.className = "auth-msg"; msg.textContent = T("寄送中…");
      const { error } = await signInEmail(email);
      btn.disabled = false;
      if (error) { msg.textContent = T(Supa.errText(error)); msg.className = "auth-msg bad"; return; }
      renderCode(render, email);
    };
    btn.addEventListener("click", go);
    onEnter(document.getElementById("authEmail"), go);
  }

  // 第二步：輸入收到的 6 位數驗證碼
  function renderCode(render, email) {
    render(`
      <div class="social-auth">
        <h3>${T("輸入驗證碼")}</h3>
        <p class="auth-sub">${T("驗證碼寄出去了，收到後在這裡輸入就好。")}<br><b>${esc(email)}</b></p>
        <input id="authCode" class="auth-input auth-code" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="10" enterkeyhint="go">
        <button class="btn primary" id="authVerify">${T("登入")}</button>
        <div class="auth-msg" id="authMsg" role="alert"></div>
        <div class="auth-links"><button class="link-btn" id="authResend">${T("重新寄送")}</button><button class="link-btn" id="authBack">${T("換 Email")}</button></div>
      </div>`);
    const vb = document.getElementById("authVerify"), codeEl = document.getElementById("authCode");
    const verify = async () => {
      if (vb.disabled) return;
      const token = (codeEl.value || "").replace(/\s/g, "");
      const msg = document.getElementById("authMsg");
      if (!/^\d{4,10}$/.test(token)) { msg.textContent = T("驗證碼是一串數字"); msg.className = "auth-msg bad"; return; }
      vb.disabled = true; msg.className = "auth-msg"; msg.textContent = T("驗證中…");
      const { error } = await verifyEmailCode(email, token);
      vb.disabled = false;
      if (error) { msg.textContent = T(Supa.errText(error)); msg.className = "auth-msg bad"; return; }
      msg.className = "auth-msg ok"; msg.textContent = T("登入成功！");   // onAuthStateChange 會觸發 route() 進入註冊/個人頁
    };
    vb.addEventListener("click", verify);
    onEnter(codeEl, verify);
    // 重新寄送：60 秒冷卻（連按會被 Supabase 擋，還會回一串英文錯誤）
    const rs = document.getElementById("authResend");
    const cool = sec => {
      rs.disabled = true;
      const tick = () => { if (!document.body.contains(rs)) return; if (sec <= 0) { rs.disabled = false; rs.textContent = T("重新寄送"); return; } rs.textContent = `${T("重新寄送")}${ttParen(sec)}`; sec--; setTimeout(tick, 1000); };
      tick();
    };
    cool(60);
    rs.addEventListener("click", async () => {
      const msg = document.getElementById("authMsg"); msg.className = "auth-msg"; msg.textContent = T("重新寄送中…");
      const { error } = await signInEmail(email);
      msg.textContent = error ? T(Supa.errText(error)) : T("寄出去了，看一下信箱");
      if (!error) cool(60);
    });
    document.getElementById("authBack").addEventListener("click", () => renderLogin(render));
  }

  async function myProfile() { return await _fetchMyProfile(); }
  async function _fetchMyProfile() {
    const c = Supa.client(); if (!c) return null;
    const { data: u } = await Supa.meUser(); if (!u || !u.user) return null;
    const { data } = await c.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    return data || null;
  }

  // 檢查 handle 是否已被使用（RLS 允許登入者讀所有 profiles）
  async function handleTaken(h) {
    const c = Supa.client(); if (!c) return false;
    const { data, error } = await c.from("profiles").select("id").eq("handle", h).maybeSingle();
    if (error) return null;   // 查不到（離線等）→ 不知道，不能當成「可以用」
    return !!data;
  }

  async function createProfile({ handle, display_name, avatar_url, bio }) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { data: u } = await Supa.meUser(); if (!u || !u.user) return { error: "no-user" };
    const { error } = await c.from("profiles").insert({
      id: u.user.id, handle, display_name: display_name || null, avatar_url: avatar_url || null, bio: bio || null,
    });
    return { error: error ? error.message : null };
  }

  function renderOnboarding(render) {
    const c = Supa.client();
    let meta = {};
    if (c) Supa.meUser().then(({ data }) => {
      meta = (data && data.user && data.user.user_metadata) || {};
      const dn = document.getElementById("obName"); if (dn && !dn.value) dn.value = meta.full_name || meta.name || "";
    });
    render(`
      <div class="social-auth">
        <h3>${T("建立你的山友檔案")}</h3>
        <label class="ob-l" for="obHandle">${T("帳號（朋友用這個找到你）")}</label>
        <input id="obHandle" class="auth-input" placeholder="${T("例如 hiker_tim")}" autocapitalize="off" autocomplete="off" maxlength="20">
        <div class="auth-msg" id="obHandleMsg"></div>
        <label class="ob-l" for="obName">${T("顯示名稱")}</label>
        <input id="obName" class="auth-input" placeholder="${T("你的名字")}" maxlength="40">
        <label class="ob-l" for="obBio">${T("簡介（選填）")}</label>
        <input id="obBio" class="auth-input" placeholder="${T("一句話介紹自己")}" maxlength="150">
        <button class="btn primary" id="obSave">${T("完成，開始使用")}</button>
        <div class="auth-msg" id="obMsg"></div>
      </div>`);
    const hEl = document.getElementById("obHandle");
    const hMsg = document.getElementById("obHandleMsg");
    let t = null, lastOk = false, seq = 0;
    hEl.addEventListener("input", () => {
      if (/[A-Z]/.test(hEl.value)) { const p0 = hEl.selectionStart; hEl.value = hEl.value.toLowerCase(); try { hEl.setSelectionRange(p0, p0); } catch (e) { /* */ } }   // 大寫自動轉小寫
      clearTimeout(t); lastOk = false;
      const v = Handle.validate(hEl.value);
      if (!v.ok) { hMsg.textContent = T(v.msg); hMsg.className = "auth-msg bad"; return; }
      hMsg.textContent = T("檢查中…"); hMsg.className = "auth-msg";
      const my = ++seq;   // 打字很快時，晚回來的舊結果不能蓋掉新的（以前會把有人用的名字標成可以用）
      t = setTimeout(async () => {
        const taken = await handleTaken(v.handle);
        if (my !== seq) return;
        if (taken === null) { hMsg.textContent = T("現在查不到，等一下再試"); hMsg.className = "auth-msg bad"; }
        else if (taken) { hMsg.textContent = T("這個帳號名稱有人用了"); hMsg.className = "auth-msg bad"; }
        else { hMsg.textContent = T("可以用"); hMsg.className = "auth-msg ok"; lastOk = true; }
      }, 350);
    });
    document.getElementById("obSave").addEventListener("click", async () => {
      const v = Handle.validate(hEl.value);
      const msg = document.getElementById("obMsg");
      if (!v.ok) { msg.textContent = T(v.msg); return; }
      if (!lastOk) { msg.textContent = T("帳號名稱還沒確認可以用"); return; }
      const sb = document.getElementById("obSave"); if (sb.disabled) return; sb.disabled = true;
      msg.textContent = T("建立中…");
      const r = await createProfile({
        handle: v.handle,
        display_name: (document.getElementById("obName").value || "").trim(),
        avatar_url: ((meta && (meta.avatar_url || meta.picture)) || null),
        bio: (document.getElementById("obBio").value || "").trim(),
      });
      if (r.error) { sb.disabled = false; msg.textContent = /duplicate|unique/i.test(r.error) ? T("這個帳號名稱有人用了") : T(Supa.errText(r.error)); return; }
      onChange();   // profile 建好 → 重新路由到個人頁
    });
  }

  return { init, session, signInGoogle, signInEmail, verifyEmailCode, signOut, renderLogin, myProfile, _fetchMyProfile, handleTaken, createProfile, renderOnboarding };
})();
