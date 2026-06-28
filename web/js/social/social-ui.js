// 社群分頁外殼與路由：依登入/註冊狀態渲染對應畫面。Phase 1 路由：未啟用 / 登入 / 註冊 / 個人頁。
const SocialUI = (() => {
  const $ = s => document.querySelector(s);
  let mounted = false;

  function render(html) { const b = $("#socialBody"); if (b) b.innerHTML = html; }

  // 分頁第一次顯示時呼叫
  async function onShow() {
    if (typeof Supa === "undefined" || !Supa.ready()) {
      render(`<div class="social-empty">社群功能尚未啟用（缺少 Supabase 設定）。</div>`);
      return;
    }
    if (!mounted) { mounted = true; if (typeof Auth !== "undefined") Auth.init(route); }
    route();
  }

  // 依目前 session / profile 決定畫面
  async function route() {
    if (typeof Auth === "undefined") { render(`<div class="social-empty">載入中…</div>`); return; }
    const sess = await Auth.session();
    if (!sess) { Auth.renderLogin(render); return; }
    const prof = await Auth.myProfile();
    if (!prof) { Auth.renderOnboarding(render); return; }
    if (typeof Profiles !== "undefined") Profiles.renderMe(render, prof);
    else render(`<div class="social-empty">嗨 @${prof.handle}</div>`);
  }

  return { onShow, route, render };
})();
