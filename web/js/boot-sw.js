// Service Worker 更新橫幅＋離線橫幅（以前是 index.html 結尾的 inline script；為了 CSP 搬出來）
// Service Worker：偵測新版本 → 顯示更新橫幅；點擊後讓新版接手並重載
if ("serviceWorker" in navigator) {
  let _swReg = null, _refreshing = false;
  // 第一次安裝時 SW 會接手頁面（controllerchange）——那不是「換新版」，不該重載。
  // 以前不分青紅皂白都重載：每個第一次來的人頁面會在 1～2 秒後自己重新整理一次（點到一半的東西不見、進場動畫播兩次）。
  const _hadController = !!navigator.serviceWorker.controller;
  window.addEventListener("load", async () => {
    try {
      _swReg = await navigator.serviceWorker.register("sw.js");
      const showIfWaiting = w => w && w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) {
          const b = document.getElementById("updateBanner"); if (b) b.style.display = "block";
        }
      });
      if (_swReg.waiting && navigator.serviceWorker.controller) {
        const b = document.getElementById("updateBanner"); if (b) b.style.display = "block";
      }
      _swReg.addEventListener("updatefound", () => showIfWaiting(_swReg.installing));
      // PWA 常駐不重載 → 定期＋回前景時主動檢查新版，否則橫幅永遠不會出現
      setInterval(() => { _swReg.update().catch(() => { /* 沒訊號／背景時檢查新版失敗：下次再查（以前 try 接不到 Promise 失敗，iPhone 上一直記成錯誤） */ }) }, 30 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") { _swReg.update().catch(() => { }) }
      });
    } catch (e) { /* */ }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_refreshing || !_hadController) return; _refreshing = true; location.reload();
  });
  document.getElementById("updateBanner").addEventListener("click", () => {
    const b = document.getElementById("updateBanner"); b.style.display = "none";
    if (_swReg && _swReg.waiting) _swReg.waiting.postMessage("skipWaiting");
    else location.reload();
  });
}
// 離線狀態橫幅
(function () {
  const nb = document.getElementById("netBanner");
  const upd = () => { nb.style.display = navigator.onLine ? "none" : "block"; };
  window.addEventListener("online", upd); window.addEventListener("offline", upd); upd();
})();
