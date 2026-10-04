// 進場動畫期間的預載（一舉兩得）：最後載入的 defer 腳本，App 主程式都在了才跑。
// 必要（做完才讓 splash 收場，window.ttSplashReady＝true）：字型解碼、第一頁步道清單畫好。
// 預熱（動畫期間分段做，每段之間讓出主執行緒給動畫）：詳情資料、最可能點開那個縣市的路線形狀、夥伴頁天氣、前幾張步道照片解碼。
// 每一項都量耗時寫進 window.ttWarmup（測試與除錯面板看得到）；任何一項失敗都不影響開機。
(function () {
  const W = window.ttWarmup = { started: Math.round(performance.now()), steps: [] };
  if (document.getElementById("splash")) window.ttSplashReady = false;   // 有 splash 才需要等；沒有就照常
  const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  async function step(name, fn) {
    const t = performance.now();
    try { await fn(); W.steps.push({ name, ms: Math.round(performance.now() - t) }); }
    catch (e) { W.steps.push({ name, ms: Math.round(performance.now() - t), err: String(e && e.message || e).slice(0, 80) }); }
    await yieldFrame();
  }
  const timeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  // 使用者最可能點開的步道所在縣市：最近走過的 → 探索頁拿過的位置附近 → 清單第一張
  function likelyRegion() {
    try {
      const rec = (typeof realRecords === "function" ? realRecords() : []).find(r => r.trailId);
      const t = rec && TRAILS.find(x => x.id === rec.trailId); if (t && t.region) return t.region;
    } catch (e) { /* */ }
    try { const c = document.querySelector(".card[data-id], .jcard[data-id]"); const t = c && TRAILS.find(x => String(x.id) === c.dataset.id); if (t) return t.region; } catch (e) { /* */ }
    return "";
  }
  (async () => {
    // ── 必要 ──
    await step("fonts", () => timeout(Promise.all([document.fonts.load('400 16px "TaipeiSans"'), document.fonts.load('700 16px "TaipeiSans"')]), 1500));
    await step("first-list", () => timeout(new Promise(r => { (function chk() { if (document.querySelector(".card, .jcard")) r(); else setTimeout(chk, 50); })(); }), 1500));
    W.readyAt = Math.round(performance.now());
    window.ttSplashReady = true;
    // ── 預熱（splash 還在播的時候做；播完了也照樣做完，只是不再擋畫面） ──
    await step("detail-data", () => (typeof ensureDetail === "function" ? ensureDetail() : null));
    const reg = likelyRegion(); W.region = reg;
    await step("geo-" + (reg || "none"), () => (reg && typeof ensureGeo === "function" ? ensureGeo(reg) : null));
    await step("pet-weather", () => (typeof PetStage !== "undefined" ? timeout(PetStage.weather(), 2500) : null));
    await step("decode-photos", () => Promise.all([...document.querySelectorAll("#list img, .card img, .jcard img")].slice(0, 6).map(im => (im.decode ? im.decode().catch(() => { }) : null))));
    W.doneAt = Math.round(performance.now());
  })();
})();
