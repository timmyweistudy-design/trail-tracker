// 社群分頁外殼與路由：未啟用 / 登入 / 註冊 / （登入後）動態·探索·搜尋·我的 子分頁。
const SocialUI = (() => {
  const $ = s => document.querySelector(s);
  let mounted = false, sub = "friends", myProf = null;

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
      if (!sess) { Auth.renderLogin(render); return; }
      myProf = await withTimeout(Auth.myProfile(), 10000);
      if (!myProf) { Auth.renderOnboarding(render); return; }
      shell();
    } catch (e) {
      render(`<div class="social-empty">載入失敗：${(e && e.message) || e}<br><br><button class="btn ghost" id="socialRetry">重試</button></div>`);
      const r = document.getElementById("socialRetry"); if (r) r.addEventListener("click", route);
    }
  }

  function shell() {
    render(`
      <div class="social-subnav">
        ${tab("friends", "動態")}${tab("explore", "探索")}${tab("search", "搜尋")}${tab("me", "我的")}
      </div>
      <div id="subBody"></div>`);
    document.querySelectorAll(".sub-tab").forEach(b => b.addEventListener("click", () => { sub = b.dataset.sub; shell(); }));
    const into = html => { const e = document.getElementById("subBody"); if (e) e.innerHTML = html; };
    if (sub === "friends") Feed.render(into, "friends");
    else if (sub === "explore") Feed.render(into, "explore");
    else if (sub === "search") Discover.render(into);
    else if (sub === "me") Profiles.renderMe(into, myProf);
  }
  function tab(id, label) { return `<button class="sub-tab ${sub === id ? "on" : ""}" data-sub="${id}">${label}</button>`; }

  return { onShow, route, render };
})();
