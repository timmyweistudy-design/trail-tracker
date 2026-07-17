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
    const t = k => (typeof tx === "function" && tx(k)) || k;
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
      // 使用者取消 getPhoto 會 throw；一律當作取消，不打擾使用者
      return null;
    }
  }

  return { pickImage, isNative };
})();
if (typeof window !== "undefined") window.NativeCam = NativeCam;
if (typeof module !== "undefined" && module.exports) module.exports = NativeCam;
