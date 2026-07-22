// 社群分頁外殼與路由：未啟用 / 登入 / 註冊 / （登入後）動態·探索·搜尋·我的 子分頁。
const SocialUI = (() => {
  const $ = s => document.querySelector(s);
  let mounted = false, sub = "friends", myProf = null, subscribed = false;
  let pendingPost = null, _renderGen = 0;   // 渲染世代碼：擋掉切分頁後晚回來的非同步渲染（否則會蓋掉現在這頁）
  try { pendingPost = new URLSearchParams(location.search).get("post"); } catch (e) { }

  function render(html) { const b = $("#socialBody"); if (b) b.innerHTML = html; }

  async function onShow() {
    if (typeof Supa === "undefined" || !Supa.ready()) { render(`<div class="social-empty">社群功能尚未啟用（缺少 Supabase 設定）。</div>`); return; }
    if (!mounted) { mounted = true; if (typeof Auth !== "undefined") Auth.init(route); }
    route();
  }

  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("連線逾時")), ms))]); }

  async function route() {
    if (typeof Auth === "undefined") { render(`<div class="social-empty">社群模組載入失敗，請下拉重新整理。</div>`); return; }
    try {
      const sess = await withTimeout(Auth.session(), 10000);
      if (!sess) { window.__meAvatar = null; if (typeof TeamLive !== "undefined") TeamLive.stop(); Auth.renderLogin(render); return; }
      myProf = await withTimeout(Auth.myProfile(), 10000);
      if (!myProf) { Auth.renderOnboarding(render); return; }
      const m = (sess.user && sess.user.user_metadata) || {};
      window.__meAvatar = myProf.avatar_url || m.avatar_url || m.picture || null;   // 供記錄地圖的「我」標記（沒頭像退用 Google 照片）
      if (typeof Profiles !== "undefined") Profiles.syncMyStats(myProf.id);   // 上線即同步寵物進度供好友看
      shell();
    } catch (e) {
      render(`<div class="social-empty">載入失敗：${(e && e.message) || e}<br><br><button class="btn ghost" id="socialRetry">重試</button></div>`);
      const r = document.getElementById("socialRetry"); if (r) r.addEventListener("click", route);
    }
  }

  function shell() {
    if (typeof window.cloudAutoSync === "function") window.cloudAutoSync();   // 登入確認後自動把雲端紀錄同步下來（每 session 一次）
    if (!subscribed && typeof Notifs !== "undefined") { subscribed = true; Notifs.subscribe(updateBadge); }   // 訂閱一次：新通知即時更新紅點
    render(`
      <div class="social-subnav">
        ${tab("friends", "動態")}${tab("explore", "探索")}${tab("search", "搜尋")}${tab("notif", "通知")}${tab("me", "我的")}
      </div>
      <div id="subBody"></div>`);
    document.querySelectorAll(".sub-tab").forEach(b => b.addEventListener("click", () => { if (b.dataset.sub === sub) return; sub = b.dataset.sub; shell(); }));
    const myGen = ++_renderGen;   // 這次 shell 的世代；晚回來的舊渲染(myGen 過期)一律不寫入
    const into = html => { if (myGen !== _renderGen) return; const e = document.getElementById("subBody"); if (e) e.innerHTML = html; };
    // 本機隱藏清單以資料庫的檢舉紀錄為準（跨裝置撤回也會生效）。動態牆要等同步完再抓，
    // 否則會用舊的隱藏清單先濾一次 → 撤回了還是看不到那篇。
    const synced = (typeof Safety !== "undefined" && Safety.syncReportedCache)
      ? Safety.syncReportedCache().catch(() => {}) : Promise.resolve();
    if (sub === "friends") synced.then(() => Feed.render(into, "friends"));
    else if (sub === "explore") synced.then(() => Feed.render(into, "explore"));
    else if (sub === "search") Discover.render(into);
    else if (sub === "notif") { if (typeof Notifs !== "undefined") Notifs.render(into).then(updateBadge); }
    else if (sub === "me") Profiles.renderMe(into, myProf);
    updateBadge();
    // 登入後首次點開各社群分頁 → 一頁一張情境導覽小卡（導覽字串集中在 app.js）
    if (typeof window.ttCoachSocial === "function") setTimeout(() => window.ttCoachSocial(sub), 550);
    // 深連結：?post=<id> → 開啟該貼文（登入後才開，開一次後清掉網址參數）
    if (pendingPost && typeof PostView !== "undefined") {
      const pid = pendingPost; pendingPost = null;
      setTimeout(() => PostView.open(pid), 120);
      try { history.replaceState(null, "", location.pathname); } catch (e) { }
    }
  }
  function tab(id, label) {
    const badge = id === "notif" ? `<span class="nbadge" id="notifBadge"></span>` : "";
    return `<button class="sub-tab ${sub === id ? "on" : ""}" data-sub="${id}">${label}${badge}</button>`;
  }
  function setBadge(id, n) { const b = document.getElementById(id); if (b) { b.textContent = n > 0 ? (n > 9 ? "9+" : n) : ""; b.style.display = n > 0 ? "inline-block" : "none"; } }
  function updateBadge() {
    if (typeof Notifs === "undefined") return;
    Notifs.unreadCount().then(n => { setBadge("notifBadge", n); setBadge("socialNavBadge", n); });
  }
  // 不在社群分頁時也能顯示底部紅點：登入後就訂閱並更新一次
  async function bootBadge() {
    if (typeof Supa === "undefined" || !Supa.ready() || typeof Auth === "undefined" || typeof Notifs === "undefined") return;
    const sess = await Auth.session().catch(() => null); if (!sess) return;
    if (!subscribed) { subscribed = true; Notifs.subscribe(updateBadge); }
    updateBadge();
  }
  setTimeout(bootBadge, 1500);

  return { onShow, route, render };
})();
