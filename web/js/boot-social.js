// 社群模組延遲載入器（以前是 index.html 的 inline script；為了 CSP 搬出來，位置與執行時機不變）
// 社群模組延遲載入：378KB（supabase+20 支 social）不佔開機。順序注入（彼此有依賴），
// 只跑一次；切到社群分頁時等它載完，其餘時間開機後閒置 2 秒自動載（紅點/自動登入照常）。
window.loadSocial = (function () {
  const FILES = ["vendor/supabase/supabase.js", "js/social/supa.js", "js/social/handle.js",
    "js/social/media.js", "js/social/posts.js", "js/social/composer.js", "js/social/safety.js",
    "js/social/feed.js", "js/social/postview.js", "js/social/comments.js", "js/social/discover.js", "js/social/petsocial.js",
    "js/social/teamlive.js", "js/social/teams.js", "js/social/notifications.js", "js/social/push.js",
    "js/social/autocomplete.js", "js/social/events.js", "js/social/clubs.js", "js/social/lightbox.js", "js/social/auth.js",
    "js/social/profiles.js", "js/social/social-ui.js"];
  let p = null;
  return function () {
    if (!p) p = FILES.reduce((chain, f) => chain.then(() => new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = f;
      sc.onload = res; sc.onerror = res;   // 單檔失敗不卡整串（社群功能屆時自然降級）
      document.body.appendChild(sc);
    })), Promise.resolve());
    return p;
  };
})();
// App 一互動就搶第一個空檔背景載社群（原本延遲 2 秒→點社群會轉圈）：最多 600ms 內開始，不擋開機
window.addEventListener("load", () => {
  const go = () => window.loadSocial().then(() => { if (window.wireTeamLive) window.wireTeamLive(); });
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 600 }); else setTimeout(go, 250);
});
