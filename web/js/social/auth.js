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

  async function signInEmail(email) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    return { error: error ? error.message : null };
  }

  async function signOut() { const c = Supa.client(); if (c) await c.auth.signOut(); }

  function renderLogin(render) {
    render(`
      <div class="social-auth">
        <div class="auth-logo">⛰️</div>
        <h3>加入山友社群</h3>
        <p class="auth-sub">分享你的步道旅行，看看好友走過哪裡。</p>
        <button class="btn primary" id="authGoogle">使用 Google 繼續</button>
        <div class="auth-or">或</div>
        <input type="email" id="authEmail" class="auth-input" placeholder="輸入 Email 收登入連結" inputmode="email">
        <button class="btn ghost" id="authEmailBtn">寄送登入連結</button>
        <div class="auth-msg" id="authMsg"></div>
      </div>`);
    document.getElementById("authGoogle").addEventListener("click", signInGoogle);
    document.getElementById("authEmailBtn").addEventListener("click", async () => {
      const email = (document.getElementById("authEmail").value || "").trim();
      const msg = document.getElementById("authMsg");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "請輸入有效的 Email"; return; }
      msg.textContent = "寄送中…";
      const { error } = await signInEmail(email);
      msg.textContent = error ? ("寄送失敗：" + error) : "已寄出！請到信箱點連結登入。";
    });
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

  return { init, session, signInGoogle, signInEmail, signOut, renderLogin, myProfile, _fetchMyProfile, handleTaken, createProfile, renderOnboarding };
})();
