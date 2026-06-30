// 認證流程：Google OAuth / Email 魔法連結、session 取得、profile 讀取、onboarding 建檔。
const Auth = (() => {
  let onChange = () => {};

  function init(cb) {
    onChange = cb || (() => {});
    const c = Supa.client(); if (!c) return;
    c.auth.onAuthStateChange(() => onChange());   // 登入/登出/回呼後重新路由
  }

  async function session() {
    const c = Supa.client(); if (!c) return null;
    const { data } = await c.auth.getSession();
    return data ? data.session : null;
  }

  async function signInGoogle() {
    const c = Supa.client(); if (!c) return;
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
    try { await c.auth.signOut({ scope: "local" }); } catch (e) { /* 仍視為已登出 */ }
  }

  function esc(s) { return (s || "").replace(/[<>&"]/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[ch])); }

  function renderLogin(render) {
    const google = window.SOCIAL_GOOGLE
      ? `<button class="btn primary" id="authGoogle">使用 Google 繼續</button><div class="auth-or">或</div>` : "";
    render(`
      <div class="social-auth">
        <div class="auth-logo">⛰️</div>
        <h3>加入山友社群</h3>
        <p class="auth-sub">分享你的步道旅行，看看好友走過哪裡。</p>
        ${google}
        <input type="email" id="authEmail" class="auth-input" placeholder="輸入 Email" inputmode="email" autocapitalize="off">
        <button class="btn ghost" id="authEmailBtn">寄送驗證碼</button>
        <div class="auth-msg" id="authMsg"></div>
      </div>`);
    if (window.SOCIAL_GOOGLE) document.getElementById("authGoogle").addEventListener("click", signInGoogle);
    document.getElementById("authEmailBtn").addEventListener("click", async () => {
      const email = (document.getElementById("authEmail").value || "").trim();
      const msg = document.getElementById("authMsg");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "請輸入有效的 Email"; return; }
      msg.textContent = "寄送中…";
      const { error } = await signInEmail(email);
      if (error) { msg.textContent = "寄送失敗：" + error; return; }
      renderCode(render, email);
    });
  }

  // 第二步：輸入收到的 6 位數驗證碼
  function renderCode(render, email) {
    render(`
      <div class="social-auth">
        <h3>輸入驗證碼</h3>
        <p class="auth-sub">驗證碼已寄到 ${esc(email)}。<b>直接在這個 App 輸入</b>就能登入這裡，不必切到瀏覽器。</p>
        <input id="authCode" class="auth-input" inputmode="numeric" autocomplete="one-time-code" placeholder="輸入驗證碼" maxlength="10">
        <button class="btn primary" id="authVerify">登入</button>
        <button class="btn ghost" id="authResend">重新寄送</button>
        <button class="btn ghost" id="authBack">換 Email</button>
        <div class="auth-msg" id="authMsg"></div>
      </div>`);
    document.getElementById("authVerify").addEventListener("click", async () => {
      const token = (document.getElementById("authCode").value || "").trim();
      const msg = document.getElementById("authMsg");
      if (!/^\d{4,10}$/.test(token)) { msg.textContent = "請輸入驗證碼（數字）"; return; }
      msg.textContent = "驗證中…";
      const { error } = await verifyEmailCode(email, token);
      if (error) { msg.textContent = "驗證失敗：" + error; return; }
      msg.textContent = "登入成功！";   // onAuthStateChange 會觸發 route() 進入註冊/個人頁
    });
    document.getElementById("authResend").addEventListener("click", async () => {
      const msg = document.getElementById("authMsg"); msg.textContent = "重新寄送中…";
      const { error } = await signInEmail(email);
      msg.textContent = error ? ("失敗：" + error) : "已重新寄出。";
    });
    document.getElementById("authBack").addEventListener("click", () => renderLogin(render));
  }

  async function myProfile() { return await _fetchMyProfile(); }
  async function _fetchMyProfile() {
    const c = Supa.client(); if (!c) return null;
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return null;
    const { data } = await c.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    return data || null;
  }

  // 檢查 handle 是否已被使用（RLS 允許登入者讀所有 profiles）
  async function handleTaken(h) {
    const c = Supa.client(); if (!c) return false;
    const { data } = await c.from("profiles").select("id").eq("handle", h).maybeSingle();
    return !!data;
  }

  async function createProfile({ handle, display_name, avatar_url, bio }) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "no-user" };
    const { error } = await c.from("profiles").insert({
      id: u.user.id, handle, display_name: display_name || null, avatar_url: avatar_url || null, bio: bio || null,
    });
    return { error: error ? error.message : null };
  }

  function renderOnboarding(render) {
    const c = Supa.client();
    let meta = {};
    if (c) c.auth.getUser().then(({ data }) => {
      meta = (data && data.user && data.user.user_metadata) || {};
      const dn = document.getElementById("obName"); if (dn && !dn.value) dn.value = meta.full_name || meta.name || "";
    });
    render(`
      <div class="social-auth">
        <h3>建立你的山友檔案</h3>
        <label class="ob-l">帳號 handle（給朋友搜尋你）</label>
        <input id="obHandle" class="auth-input" placeholder="例如 hiker_tim" autocapitalize="off" autocomplete="off">
        <div class="auth-msg" id="obHandleMsg"></div>
        <label class="ob-l">顯示名稱</label>
        <input id="obName" class="auth-input" placeholder="你的名字">
        <label class="ob-l">簡介（選填）</label>
        <input id="obBio" class="auth-input" placeholder="一句話介紹自己">
        <button class="btn primary" id="obSave">完成，開始使用</button>
        <div class="auth-msg" id="obMsg"></div>
      </div>`);
    const hEl = document.getElementById("obHandle");
    const hMsg = document.getElementById("obHandleMsg");
    let t = null, lastOk = false;
    hEl.addEventListener("input", () => {
      clearTimeout(t); lastOk = false;
      const v = Handle.validate(hEl.value);
      if (!v.ok) { hMsg.textContent = v.msg; hMsg.className = "auth-msg bad"; return; }
      hMsg.textContent = "檢查中…"; hMsg.className = "auth-msg";
      t = setTimeout(async () => {
        const taken = await handleTaken(v.handle);
        if (taken) { hMsg.textContent = "這個 handle 已被使用"; hMsg.className = "auth-msg bad"; }
        else { hMsg.textContent = "可以使用 ✓"; hMsg.className = "auth-msg ok"; lastOk = true; }
      }, 350);
    });
    document.getElementById("obSave").addEventListener("click", async () => {
      const v = Handle.validate(hEl.value);
      const msg = document.getElementById("obMsg");
      if (!v.ok) { msg.textContent = v.msg; return; }
      if (!lastOk) { msg.textContent = "請確認 handle 可用"; return; }
      msg.textContent = "建立中…";
      const r = await createProfile({
        handle: v.handle,
        display_name: (document.getElementById("obName").value || "").trim(),
        avatar_url: ((meta && (meta.avatar_url || meta.picture)) || null),
        bio: (document.getElementById("obBio").value || "").trim(),
      });
      if (r.error) { msg.textContent = "建立失敗：" + (/duplicate|unique/i.test(r.error) ? "handle 已被使用" : r.error); return; }
      onChange();   // profile 建好 → 重新路由到個人頁
    });
  }

  return { init, session, signInGoogle, signInEmail, verifyEmailCode, signOut, renderLogin, myProfile, _fetchMyProfile, handleTaken, createProfile, renderOnboarding };
})();
