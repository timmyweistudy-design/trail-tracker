// 進場畫面控制（緊接在 #splash 之後同步載入，比任何 defer 腳本都早跑）。
// 原生端：網頁 splash 畫出第一格後才把 iOS 原生啟動畫面關掉（@capacitor/splash-screen，fadeOut 0）——兩邊同色，看起來是同一個畫面。
// 原生設定是「自動關閉、最多 1.5 秒」：就算這支沒跑到也不會卡在啟動畫面。
(function () {
  var sp = document.getElementById("splash");
  if (!sp) return;
  function hideNative() {
    try { var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen; if (P && P.hide) P.hide({ fadeOutDuration: 0 }); } catch (e) { /* 網頁版沒有原生畫面 */ }
  }
  requestAnimationFrame(function () { requestAnimationFrame(hideNative); });   // 兩格之後＝網頁 splash 確定畫上去了
  var done = false;
  function finish() {
    if (done) return; done = true;
    sp.classList.add("sp-out");
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 480);
  }
  window.ttSplashFinish = finish;
  setTimeout(finish, 1200);
})();
