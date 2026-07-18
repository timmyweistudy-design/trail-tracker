// 原生相機／相簿選取（NativeCam）。
// 問題：iOS 的 WKWebView 用 <input type="file" accept="image/*"> 走「拍照」路徑會黑畫面（已知限制），
//       且系統選單語言跟手機系統走（會出現英文），無法從網頁控制。
// 解法：在原生 App（Capacitor）改走官方 Camera 外掛——原生相機不會黑、選單標籤可翻譯；
//       純網頁（含無此外掛的環境）維持 <input type="file">，行為不變。
// 注意：不要叫 Media——那個名字已被 social/media.js（壓縮/上傳）佔用，且 social 是延遲載入，
//       記錄時的隨手拍用不到；本模組開機就載入。
const NativeCam = (() => {
  function cam() {
    const w = window;
    return (w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform()
      && w.Capacitor.Plugins && w.Capacitor.Plugins.Camera) ? w.Capacitor.Plugins.Camera : null;
  }
  const isNative = () => !!cam();

  // 選一張照片（相機或相簿，原生選單）。回傳：
  //   File      → 成功
  //   null      → 使用者取消／失敗（呼叫端安靜結束）
  //   undefined → 非原生環境（呼叫端請改用 <input type="file"> 後備）
  async function pickImage(tx) {
    const Cam = cam();
    if (!Cam) return undefined;
    // 用 ttT（中文模式回原中文、其他語言才翻）；不要直接用 tx——tx 在中文模式會回英文，
    // 會讓相機選單標籤/權限提示在中文介面變成英文。
    const t = k => {
      try { if (typeof window.ttT === "function") return window.ttT(k); } catch (_) { /* */ }
      return (typeof tx === "function" && tx(k)) || k;
    };
    try {
      const photo = await Cam.getPhoto({
        source: "PROMPT",               // 讓使用者選「拍照」或「從相簿選」（原生選單）
        resultType: "dataUrl",
        quality: 82,
        allowEditing: false,
        correctOrientation: true,       // 依 EXIF 轉正，避免上傳後躺著
        saveToGallery: false,
        presentationStyle: "fullscreen",
        // 標籤翻成 App 介面語言（修「三個英文選項」）
        promptLabelHeader: t("選擇照片"),
        promptLabelPhoto: t("從相簿選"),
        promptLabelPicture: t("拍照"),
        promptLabelCancel: t("取消"),
      });
      if (!photo || !photo.dataUrl) return null;
      const blob = await (await fetch(photo.dataUrl)).blob();
      const fmt = (photo.format || "jpeg").toLowerCase();
      const ext = fmt === "jpg" ? "jpg" : fmt;
      return new File([blob], `snap_${Date.now()}.${ext}`, { type: blob.type || "image/jpeg" });
    } catch (e) {
      const msg = (e && (e.message || e.errorMessage)) || String(e);
      // 使用者自己取消（"User cancelled photos app" 等）→ 安靜結束，不打擾
      if (/cancel/i.test(msg)) return null;
      // 權限被拒（"User denied access to camera/photos"）：iOS 不會再跳詢問，只能去設定開 → 給友善中文引導
      if (/denied|permission|not authorized|授權|權限/i.test(msg)) {
        try { if (typeof window.toast === "function") window.toast(t("相機／相簿權限已關閉，請到 iOS「設定」開啟")); } catch (_) { /* */ }
        return null;
      }
      // 其他非預期錯誤：把原因顯示出來（否則像「按了沒反應」無從除錯）＋記進 tt_errors 自動上傳
      try { if (typeof window.toast === "function") window.toast("相機開啟失敗：" + msg); } catch (_) { /* */ }
      try {
        const a = JSON.parse(localStorage.getItem("tt_errors") || "[]");
        a.unshift({ t: new Date().toISOString(), stage: "camera.getPhoto", msg: String(msg).slice(0, 300) });
        localStorage.setItem("tt_errors", JSON.stringify(a.slice(0, 50)));
      } catch (_) { /* */ }
      return null;
    }
  }

  return { pickImage, isNative };
})();
if (typeof window !== "undefined") window.NativeCam = NativeCam;
if (typeof module !== "undefined" && module.exports) module.exports = NativeCam;
