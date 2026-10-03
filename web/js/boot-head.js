// 開機最先跑（<head> 同步載入）：繪製前套主題／字級，避免閃白；輕量錯誤記錄；CSP 擋下的東西也記進錯誤紀錄。
// 以前是 index.html 裡的 inline script；為了 CSP 不開 'unsafe-inline' 搬出來。
    // 主題＋字體大小：在繪製前套用，避免閃白/閃字級
    (function () {
      try {
        // 外觀只有 light／dark／sun 三種；舊設定（tt_vis 紅光／陽光、tt_theme=auto）在 app.js themeMode() 轉換，這裡先照同樣規則畫第一幀
        var th = localStorage.getItem("tt_theme"), vis = localStorage.getItem("tt_vis");
        if (vis === "red") th = "dark"; else if (vis === "sun") th = "sun";
        if (th === "auto") th = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
        if (th === "sun") document.documentElement.setAttribute("data-vis", "sun");
        if (th === "dark") document.documentElement.setAttribute("data-theme", "dark");
        // 字級四檔 1.2/1.35/1.5/1.65（整體再放大一級）。舊值遷移到最近的新檔，
        // 否則舊使用者會停在已不存在的字級、設定頁選項都不亮。
        var fs = localStorage.getItem("tt_fontscale");
        var MIG = { "1": "1.2", "1.15": "1.2", "1.3": "1.35", "1.45": "1.5" };
        if (!fs || MIG[fs]) { fs = (fs && MIG[fs]) || "1.2"; localStorage.setItem("tt_fontscale", fs); }
        document.documentElement.style.setProperty("--fs", fs);
        document.documentElement.toggleAttribute("data-fs-big", +fs >= 1.5);   // 特大/超大字：部分格狀版面改少欄
        document.documentElement.toggleAttribute("data-fs-mid", +fs >= 1.35);  // 大字以上：窄格（本月摘要 4 格）改 2×2
        // 社群功能開關（我的 → 外觀）：預設顯示；關掉才收起社群分頁、小隊、揪團等入口。開機就套，免得閃一下
        if (localStorage.getItem("tt_hide_social") === "1") document.documentElement.classList.add("hide-social");
        if (localStorage.getItem("tt_sim_notch") === "1") document.documentElement.classList.add("sim-notch");   // 測試面板：模擬動態島
      } catch (e) { /* */ }
    })();
    // #25 輕量錯誤記錄：存最近 20 筆於 localStorage，方便回報問題（window.ttErrors() 可查看）
    (function () {
      function log(msg) {
        try {
          const a = JSON.parse(localStorage.getItem("tt_errors") || "[]");
          a.unshift({ t: new Date().toISOString(), m: String(msg).slice(0, 300) });
          localStorage.setItem("tt_errors", JSON.stringify(a.slice(0, 20)));
        } catch (e) { /* */ }
      }
      window.addEventListener("error", e => log((e.message || "") + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno));
      window.addEventListener("unhandledrejection", e => log("Promise: " + (e.reason && e.reason.message || e.reason)));
      window.ttErrors = () => JSON.parse(localStorage.getItem("tt_errors") || "[]");
    })();
// 英文介面：字典（js/i18n/en.js）在這裡同步插入，比 i18n.js 早執行 → 開機第一個畫面就是英文，不會閃中文。
// 中文介面不載（以前 170 KB 英文字典內建在 i18n.js，每個人都要下載解析）；其他語言照舊由 i18n.js 按需載入。
try { if (localStorage.getItem("tt_lang") === "en") document.write('<script src="js/i18n/en.js"><\/script>'); } catch (e) { /* */ }
// CSP 擋下的連線／資源：記進錯誤紀錄（會跟著 client_errors 回報），漏列的網域才查得到
window.addEventListener("securitypolicyviolation", e => {
  try {
    const a = JSON.parse(localStorage.getItem("tt_errors") || "[]");
    a.unshift({ t: new Date().toISOString(), m: ("CSP " + e.violatedDirective + " " + (e.blockedURI || "")).slice(0, 300) });
    localStorage.setItem("tt_errors", JSON.stringify(a.slice(0, 20)));
  } catch (er) { /* */ }
});
