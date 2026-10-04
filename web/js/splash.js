// 進場畫面控制（緊接在 #splash 之後同步載入，比任何 defer 腳本都早跑）。
// 1. 原生端：網頁 splash 畫出第一格後才把 iOS 原生啟動畫面關掉（@capacitor/splash-screen，fadeOut 0）——兩邊同色，看起來是同一個畫面。
//    原生設定是「自動關閉、最多 1.5 秒」：就算這支沒跑到也不會卡在啟動畫面。
// 2. 時長看情況（實測 App 0.65 秒就能用，不刻意拖時間）：
//    今天第一次開＝完整版約 2.4 秒；同一天再開＝精簡版約 1.2 秒；減少動態效果＝靜態 0.6 秒；從背景切回來不會重載頁面，所以不播。
//    結束條件：動畫播完「而且」App 準備好（window.ttSplashReady），最長 3.5 秒一定收場；點一下畫面立刻跳過。
// 3. 收場：logo 飛到標題列 logo 的位置（同一個 logo 變過去），背景和字淡出。
// 自動化測試瀏覽器（navigator.webdriver）預設走精簡且不等，免得每個測試多等；要測完整版設 localStorage tt_splash_test=1。
(function () {
  var sp = document.getElementById("splash");
  if (!sp) return;
  var t0 = performance.now();
  function hideNative() {
    try { var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen; if (P && P.hide) P.hide({ fadeOutDuration: 0 }); } catch (e) { /* 網頁版沒有原生畫面 */ }
  }
  requestAnimationFrame(function () { requestAnimationFrame(hideNative); });   // 兩格之後＝網頁 splash 確定畫上去了

  var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* */ }
  var test = false; try { test = localStorage.getItem("tt_splash_test") === "1"; } catch (e) { /* */ }
  var bot = !!navigator.webdriver && !test;
  var today = new Date(); today = today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
  var mode = "full";
  try { if (localStorage.getItem("tt_splash_day") === today) mode = "compact"; localStorage.setItem("tt_splash_day", today); } catch (e) { /* */ }
  if (test && localStorage.getItem("tt_splash_mode")) mode = localStorage.getItem("tt_splash_mode");
  if (reduce) mode = "static";
  if (bot) mode = "compact";
  sp.dataset.mode = mode;
  if (mode !== "static") sp.classList.add("sp-anim");
  if (mode === "compact") sp.classList.add("sp-compact");
  var MIN = bot ? 0 : mode === "full" ? 2400 : mode === "compact" ? 1200 : 600, CAP = bot ? 400 : 3500;

  var done = false;
  function finish(fast) {
    if (done) return; done = true;
    sp.dataset.endedAt = Math.round(performance.now() - t0);
    // logo 飛到標題列 logo（FLIP：算兩個位置的差，用 transform 動，不掉格）
    var mark = sp.querySelector(".sp-mark"), target = document.querySelector(".app-header .brand-mark");
    if (mark && target && !fast && mode !== "static") {
      var a = mark.getBoundingClientRect(), b = target.getBoundingClientRect();
      if (b.width > 0) mark.style.transform = "translate(" + (b.left - a.left) + "px," + (b.top - a.top) + "px) scale(" + (b.width / a.width) + ")";
    }
    sp.classList.add("sp-out");
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); try { window.dispatchEvent(new Event("tt-splash-done")); } catch (e) { /* */ } }, fast ? 300 : 600);
  }
  window.ttSplashFinish = finish;
  // App 準備好了沒：預載排程（第 3 階段）會設 window.ttSplashReady＝true；沒有排程時以 load 事件為準
  function ready() { return window.ttSplashReady === true || (window.ttSplashReady === undefined && document.readyState === "complete"); }
  (function tick() {
    if (done) return;
    var el = performance.now() - t0;
    if ((el >= MIN && ready()) || el >= CAP) finish(false);
    else setTimeout(tick, 60);
  })();
  // 點一下畫面＝跳過（也接鍵盤，方便測試與外接鍵盤）
  sp.addEventListener("pointerdown", function () { finish(true); });
  document.addEventListener("keydown", function k(e) { if (!done && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) { finish(true); } document.removeEventListener("keydown", k); });
})();
