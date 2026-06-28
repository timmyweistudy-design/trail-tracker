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

  async function route() {
    if (typeof Auth === "undefined") { render(`<div class="social-empty">載入中…</div>`); return; }
    const sess = await Auth.session();
    if (!sess) { Auth.renderLogin(render); return; }
    myProf = await Auth.myProfile();
    if (!myProf) { Auth.renderOnboarding(render); return; }
    shell();
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
