// 「我的」分頁：個人資料、足跡統計、月曆、行程列表、設定（離線地圖／備份／語言…）
// 從 app.js 拆出；靠 app.js 的全域工具（$、ttT、ic、toast、Store…），載入順序在 app.js 之後。

// ---------- 我的 ----------
function loadProfile() {
  const p = Store.getProfile();
  if (p.weight) $("#pfWeight").value = p.weight;
  if (p.height) $("#pfHeight").value = p.height;
  if (p.pack) $("#pfPack").value = p.pack;
}
// 個人資料：以前身高填 999 也存、體重填 0 默默變 60，步數卡路里全歪 → 超出範圍直接講哪一格
// 錯誤訊息直接放在填錯的那一格下面、格子標紅並把游標帶過去（以前訊息掉在最下面，看不出是哪格）
$("#btnSaveProfile").addEventListener("click", () => {
  const w = $("#pfWeight").value.trim(), h = $("#pfHeight").value.trim(), pk = $("#pfPack").value.trim();
  const W = w === "" ? 60 : +w, H = h === "" ? 170 : +h, P = pk === "" ? 0 : +pk;
  const checks = [["#pfWeight", W, 20, 200, "體重要在 20–200 公斤之間"], ["#pfHeight", H, 100, 220, "身高要在 100–220 公分之間"], ["#pfPack", P, 0, 40, "背包重量要在 0–40 公斤之間"]];
  const err = $("#pfErr");
  document.querySelectorAll("#view-me .field.bad").forEach(f => f.classList.remove("bad"));
  const badC = checks.find(([, v, lo, hi]) => !(v >= lo && v <= hi));
  if (badC) {
    const inp = $(badC[0]), fld = inp.closest(".field");
    if (fld) { fld.classList.add("bad"); if (err) fld.after(err); }
    if (err) { err.textContent = ttT(badC[4]); err.hidden = false; }
    inp.focus(); return;
  }
  if (err) err.hidden = true;
  Store.saveProfile({ weight: W, height: H, pack: P });
  const b = $("#btnSaveProfile"); b.textContent = ttT("存好了"); b.classList.add("saved");   // 按鈕上直接給回饋，不用 toast 蓋住畫面
  setTimeout(() => { b.textContent = ttT("儲存"); b.classList.remove("saved"); }, 1600);
});
["#pfWeight", "#pfHeight", "#pfPack"].forEach(s => { const i = $(s); if (i) i.addEventListener("input", () => { const f = i.closest(".field"); if (f) f.classList.remove("bad"); }); });
$("#btnExportGpxAll").addEventListener("click", async () => {   // 全部行程的路線檔
  if (!_proGate()) return;   // PRO：批次匯出全部路線檔
  const r = await GPX.exportAll(await Store.allFull());
  if (!r) toast(ttT("尚無行程可下載")); else if (r === "saved") toast(ttT("已下載全部行程路線檔"));   // 叫出分享單就不再多講「已下載」（按取消也會講）
});
// 資料整批換掉後（雲端還原／匯入備份／自動同步）每個看得到的區塊重畫一次（以前三個地方各寫一串）
function ttRefreshAll() {
  ["renderHistory", "render", "initTheme", "renderPet", "renderQuests", "renderBadges", "renderStats", "loadProfile", "renderSyncStatus"]
    .forEach(n => { try { const f = window[n]; if (typeof f === "function") f(); } catch (e) { /* 個別區塊未載入時略過 */ } });
}
// 登入者查一次就好：開機時備份、同步、錯誤上報會在幾秒內各查一次。
// 只快取「有登入」的結果（沒登入不快取，不然剛登入幾秒內按備份會被說成還沒登入）
let _muP = null, _muT = 0;
function _meUser() {
  if (_muP && Date.now() - _muT < 5000) return _muP;
  const p = Supa.meUser();
  p.then(r => { if (r && r.data && r.data.user) { _muP = p; _muT = Date.now(); } else _muP = null; }, () => { _muP = null; });
  return p;
}
window._meUserReset = () => { _muP = null; };   // 登出時清掉（Auth.signOut 會呼叫）
// App 版本（sw.js 裡的快取版號）：診斷報告和錯誤上報共用，只抓一次
let _verP = null;
function appVersion() {
  return _verP || (_verP = fetch("./sw.js", { cache: "no-store" }).then(r => r.text()).then(t => (t.match(/trail-tracker-(v\d+)/) || [])[1] || "").catch(() => { _verP = null; return ""; }));
}

async function refreshOfflineStatus() {
  const el = $("#offlineStatus");
  if (!el) return;
  // 快取上限控管 5 分鐘做一次就夠（以前每次切到「我的」都跑）
  if (Offline.enforceCap && Date.now() - (refreshOfflineStatus._capAt || 0) > 300000) { refreshOfflineStatus._capAt = Date.now(); Offline.enforceCap().catch(() => { }); }
  const n = await Offline.savedCount(), mb = await Offline.usageMB();
  el.textContent = n ? `${ttT("已下載的離線地圖")}${ttColon()}${n} ${ttT("張圖磚")}` : ttT("還沒下載任何離線地圖");
  const pe = $("#btnPackExport"); if (pe) pe.disabled = !n;   // 還沒下載任何地圖就沒東西可以打包
  const q = $("#offlineQuota");
  renderOfflineSets();
  if (q) {
    if (typeof Premium !== "undefined" && Premium.isOn()) q.innerHTML = mb != null ? `${ttT("這個 App 在手機上佔用")} ${mb.toFixed(0)} MB` : "";
    else { const left = Math.max(0, OFFLINE_FREE_MB - offlineMbUsed()); q.innerHTML = `<span>${ttT("免費額度")}</span>${ttColon()}<span>${ttT("剩")}</span> <b>${left.toFixed(1)}</b> / ${OFFLINE_FREE_MB} MB <span>${ttT("（含記錄時預載）")}</span><div class="oq-up-line"><a class="oq-up" id="oqUp">${ttT("升級 Premium 無限下載")}</a></div>`; const up = $("#oqUp"); if (up) up.addEventListener("click", () => { if (typeof Premium !== "undefined") Premium.openUpgrade(); }); }
  }
  // #9 收藏一鍵預載：按鈕即時顯示可下載的收藏數（（N）為語言中性），沒有收藏就淡化提示
  const fb = $("#btnFavOffline");
  if (fb && !fb.disabled) {
    const favN = TRAILS.filter(t => Store.isFav(t.id) && t.lat).length;
    let sp = fb.querySelector(".fav-n");
    if (!sp) { sp = document.createElement("span"); sp.className = "fav-n"; fb.appendChild(sp); }
    sp.textContent = favN ? ttParen(favN) : "";
    fb.classList.toggle("op-btn-dim", favN === 0);
  }
}
// 「我的」設定區：點分類標題展開/收合；展開哪幾個記起來，下次進來不用一直重點
(function () {
  const heads = [...document.querySelectorAll("#view-me .set-head")];
  let open = []; try { open = JSON.parse(localStorage.getItem("tt_set_open")) || []; } catch (e) { /* */ }
  heads.forEach((h, i) => {
    h.setAttribute("aria-expanded", open.includes(i) ? "true" : "false");
    if (open.includes(i)) h.parentElement.classList.add("open");
    h.addEventListener("click", () => {
      const on = h.parentElement.classList.toggle("open");
      h.setAttribute("aria-expanded", on ? "true" : "false");
      const cur = heads.map((x, j) => x.parentElement.classList.contains("open") ? j : -1).filter(j => j >= 0);
      try { localStorage.setItem("tt_set_open", JSON.stringify(cur)); } catch (e) { /* */ }
    });
  });
  // 頁內跳轉
  document.querySelectorAll("#view-me [data-jump]").forEach(b => b.addEventListener("click", () => {
    const t = document.getElementById(b.dataset.jump); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
})();
// ── 已下載的離線地圖：一條一條列出來，可以單獨刪 ──
// 只記「怎麼算出圖磚」（步道 id／範圍＋縮放），不存上千個網址；刪的時候重算，別條還用得到的圖磚不刪
function offlineSets() { try { return JSON.parse(localStorage.getItem("tt_offline_sets")) || {}; } catch (e) { return {}; } }
function saveOfflineSet(key, meta) { const s = offlineSets(); s[key] = Object.assign({ at: Date.now() }, meta); try { localStorage.setItem("tt_offline_sets", JSON.stringify(s)); } catch (e) { /* */ } }
function trailTiles(t) {
  const bbox = Offline.bboxFor(t), { zmin, zmax } = Offline.planZoom(bbox);
  return [...Offline.tileList(bbox, zmin, zmax), ...Offline.tileListUrl(bbox, 13, 14, _TERR_URL)];
}
function setTiles(key) {
  if (key === "taiwan") { const bbox = { n: 25.35, s: 21.85, e: 122.05, w: 119.95 }; let z = 13; while (z > 9 && Offline.tileList(bbox, 7, z).length > 6000) z--; return Offline.tileList(bbox, 7, z); }
  const t = TRAILS.find(x => "trail:" + x.id === key); return t ? trailTiles(t) : [];
}
function renderOfflineSets() {
  const box = $("#offlineSets"); if (!box) return;
  const sets = offlineSets(), keys = Object.keys(sets).sort((a, b) => (sets[b].at || 0) - (sets[a].at || 0));
  // 沒下載過：上面狀態列已經寫「還沒下載任何離線地圖」，這區整個收起來，不重複講一次
  const head = $("#offlineSetsHead"); box.hidden = !keys.length; if (head) head.hidden = !keys.length;
  const sig = (typeof I18n !== "undefined" ? I18n.lang() : "") + JSON.stringify(keys.map(k => [k, sets[k].at]));
  if (box._sig === sig) return;   // 清單沒變就不重畫
  box._sig = sig;
  if (!keys.length) { box.innerHTML = ""; return; }
  box.innerHTML = keys.map(k => `<div class="op-set"><span class="op-set-n">${escHtml(k === "taiwan" ? ttT("全台概覽") : sets[k].name || k)}</span><span class="op-set-m">${new Date(sets[k].at).toLocaleDateString(ttLocale(), { month: "numeric", day: "numeric" })}</span><button class="op-set-x" data-set="${escHtml(k)}" aria-label="${ttT("刪除")}">${ic("trash")}</button></div>`).join("");
  box.querySelectorAll(".op-set-x").forEach(b => b.addEventListener("click", async () => {
    const k = b.dataset.set, sets = offlineSets();
    if (!(await ttConfirm(`${ttT("刪掉這份離線地圖？")}\n${k === "taiwan" ? ttT("全台概覽") : sets[k].name}`, ttT("刪除"), ttT("取消")))) return;
    const keep = new Set(); Object.keys(sets).filter(x => x !== k).forEach(x => setTiles(x).forEach(u => keep.add(u)));
    await Offline.removeTiles(setTiles(k).filter(u => !keep.has(u)));
    delete sets[k]; try { localStorage.setItem("tt_offline_sets", JSON.stringify(sets)); } catch (e) { /* */ }
    refreshOfflineStatus(); toast(ttT("刪掉了"));
  }));
}
$("#btnDiag").addEventListener("click", async () => {
  const errs = (window.ttErrors ? window.ttErrors() : []);
  const g = fn => { try { const v = fn(); return (v == null ? "?" : v); } catch (e) { return "?"; } };
  const ver = await appVersion(), sw = ver ? "trail-tracker-" + ver : "?";
  let tiles = "?"; try { if (typeof Offline !== "undefined" && Offline.cachedCount) tiles = await Offline.cachedCount(); } catch (e) { /* */ }
  let login = "未登入"; try { if (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) { const { data } = await _meUser(); if (data && data.user) login = "已登入"; } } catch (e) { /* */ }
  const pro = g(() => (typeof Premium !== "undefined" && Premium.isOn()) ? "PRO" : "免費");
  const recN = g(() => Store.getRecords().length);
  const doneN = g(() => (Store.doneCount ? Store.doneCount() : "?"));
  const favN = g(() => TRAILS.filter(t => Store.isFav(t.id)).length);
  const lang = g(() => (typeof I18n !== "undefined" ? I18n.lang() : "zh"));
  const theme = g(() => localStorage.getItem("tt_theme") || "light");
  const fs = g(() => localStorage.getItem("tt_fontscale") || "1.2");
  const lsKB = g(() => Math.round(Object.keys(localStorage).reduce((s, k) => s + ((localStorage.getItem(k) || "").length + k.length), 0) / 1024));
  const os = g(() => (navigator.userAgent.match(/iPhone|iPad|Android|Windows|Macintosh|Linux/) || ["?"])[0]);
  const swState = g(() => (navigator.serviceWorker && navigator.serviceWorker.controller) ? "已控制" : "未控制");
  const L = [
    "循徑拾光 診斷報告",
    "時間 " + new Date().toLocaleString(ttLocale()),
    "SW版本 " + sw + " " + swState,
    "裝置 " + innerWidth + "x" + innerHeight + " @" + (window.devicePixelRatio || 1) + "x " + (navigator.onLine ? "線上" : "離線"),
    "系統 " + os,
    "語言 " + lang + " 主題 " + theme + " 字級 " + fs,
    "帳號 " + login + " " + pro,
    "小隊 " + g(() => { if (typeof TeamLive === "undefined" || !TeamLive.status) return "模組未載"; const s = TeamLive.status(); return s.on ? ("輪詢" + (s.poll ? "OK" : "失敗") + "/回報" + (s.push ? "OK" : "失敗") + " · 在線 " + s.members + " · 隊長" + (s.leader ? "有" : "無")) : "未連線"; }),
    "步道 " + TRAILS.length + " 紀錄 " + recN + " 完成 " + doneN + " 收藏 " + favN,
    "離線圖磚 " + tiles + " 本機資料 " + lsKB + "KB",
    "近期錯誤 " + errs.length,
    (errs.slice(0, 10).map(e => "· " + ((e.t || "") + "").slice(5, 16) + " " + e.m).join("\n") || "（無）"),
  ];
  const info = L.join("\n");
  const act = await ttChoice(info, [{ label: ttT("關閉"), value: null, cls: "ghost" }, { label: ttT("存成檔案"), value: "file", cls: "ghost" }, { label: ttT("複製"), value: "copy", cls: "primary" }]);
  if (act === "copy" && navigator.clipboard) navigator.clipboard.writeText(info).then(() => toast(ttT("複製好了"))).catch(() => {});
  if (act === "file") saveBlob(new Blob([info], { type: "text/plain" }), `trail-tracker-diag-${new Date().toLocaleDateString("sv-SE")}.txt`, "Diagnostics");
});
$("#btnFootMap").addEventListener("click", () => { if (!_proGate()) return; openFootprintMap(); });
$("#btnPeaks").addEventListener("click", () => { if (typeof Peaks !== "undefined") Peaks.open(); });
$("#btnAllOffline").addEventListener("click", downloadAllTaiwan);
$("#btnFavOffline").addEventListener("click", downloadFavOffline);

// Premium：雲端備份 / 還原（跨裝置）
async function cloudClient() {
  if (typeof Supa === "undefined" || !Supa.ready()) { toast(ttT("社群尚未啟用")); return null; }
  const c = Supa.client(); const { data: u } = await _meUser();
  if (!u || !u.user) {
    // 自用模式把社群分頁藏起來了，直接帶去登入畫面，別叫人去找一個看不到的分頁
    if (socialHidden()) { toast(ttT("先登入，才能備份到雲端")); const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }
    else toast(ttT("請先到社群分頁登入"));
    return null;
  }
  return { c, uid: u.user.id };
}
async function cloudBackupNow(silent) {
  const x = await cloudClient(); if (!x) return false;
  // 同一支手機切換多個帳號時：localStorage 是共用的，但雲端備份是「每個帳號一列」。
  // 若本機資料屬於「別的帳號」（tt_data_uid≠目前登入），直接備份會用 A 的資料蓋掉 B 的雲端備份。
  // 自動備份→直接跳過保護；手動備份→先警告確認。
  const owner = (() => { try { return localStorage.getItem("tt_data_uid"); } catch (e) { return null; } })();
  if (owner && owner !== x.uid) {
    if (silent) return false;   // 自動：絕不覆蓋別的帳號的雲端
    const go = await ttConfirm(ttT("這台手機上的資料是另一個帳號的。繼續的話，會用這份資料蓋掉你現在登入帳號的雲端備份。"), ttT("蓋掉雲端備份"), ttT("取消"), { danger: true });
    if (!go) return false;
  }
  try {
    if (!silent) toast(ttT("備份到雲端中…"));
    const { error } = await x.c.from("backups").upsert({ user_id: x.uid, data: Store.exportAll(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (!error) { try { localStorage.setItem("tt_data_uid", x.uid); localStorage.setItem("tt_last_sync", String(Date.now())); } catch (e) { /* */ } try { renderSyncStatus(); } catch (e) { /* */ } }   // 本機資料歸屬＝目前帳號
    // 錯誤原文（常是英文技術訊息）換成白話
    if (!silent) toast(error ? ttT("備份失敗") + ttColon() + ttT(Supa.errText(error.message)) : ttT("已備份到雲端"));
    return !error;
  } catch (e) { if (!silent) toast(ttT("備份失敗") + ttColon() + ttT(Supa.errText(e && e.message))); return false; }
}
// 每趟走完自動雲端備份（靜默，失敗不打擾）——資料安全不鎖付費：任何登入者都自動備份
async function autoCloudBackup() {
  try {
    if (typeof Supa === "undefined" || !Supa.ready()) return;
    const { data: u } = await _meUser();
    if (!u || !u.user) return;   // 沒登入就沒雲端備份（改用匯出備份檔）
    // 離線送出佇列：離線或失敗→標記待備份，回線自動補送（資料安全不因當下沒網路而漏）
    if (typeof navigator !== "undefined" && navigator.onLine === false) { try { localStorage.setItem("tt_backup_pending", "1"); } catch (e) { } return; }
    if (await cloudBackupNow(true)) { try { localStorage.removeItem("tt_backup_pending"); } catch (e) { } toast(ttT("這趟已經備份到雲端")); }
    else { try { localStorage.setItem("tt_backup_pending", "1"); } catch (e) { } }
  } catch (e) { try { localStorage.setItem("tt_backup_pending", "1"); } catch (_) { } }
}
// 回線自動補送待備份（離線時走完的行程，恢復連線就補傳雲端）
function _retryPendingBackup() { try { if (localStorage.getItem("tt_backup_pending") === "1" && navigator.onLine) setTimeout(autoCloudBackup, 1500); } catch (e) { } }
if (typeof window !== "undefined") { window.addEventListener("online", _retryPendingBackup); setTimeout(_retryPendingBackup, 4000); }   // 回線時＋開機後各試一次
// 同步累積里程/寵物到雲端 profile：好友比較讀 profiles.total_km，走完就更新才不會過時
async function syncMyStatsToCloud() {
  try {
    if (typeof Supa === "undefined" || !Supa.ready() || typeof Profiles === "undefined") return;
    const { data: u } = await _meUser();
    if (u && u.user) await Profiles.syncMyStats(u.user.id);
  } catch (e) { /* 靜默；社群模組未載入或未登入就略過 */ }
}
if (typeof window !== "undefined") window.syncMyStatsToCloud = syncMyStatsToCloud;
// 自動雲端「拉取」：登入後把雲端備份自動同步下來，讓同一帳號換裝置／網頁版就看得到彼此的紀錄。
// （原本只有自動「上傳」沒有自動「下載」→ 換平台像空的，要手動按還原。）安全策略：
//   本機沒紀錄(全新裝置/平台) → 完整還原（含寵物/成就/設定）；本機已有紀錄 → 只聯集紀錄/收藏(不倒退寵物)。
//   本機資料屬別的帳號 → 略過（交手動還原，避免混帳號）。每個 session 只跑一次。
let _cloudSyncDone = false;
async function cloudAutoSync() {
  if (_cloudSyncDone) return;
  try {
    if (typeof Supa === "undefined" || !Supa.ready()) return;   // 社群未載入/未設定 → 之後再試
    const c = Supa.client(); const { data: u } = await _meUser();
    if (!u || !u.user) return;                                   // 未登入 → 不標記完成，登入後會再觸發
    const uid = u.user.id;
    const owner = (() => { try { return localStorage.getItem("tt_data_uid"); } catch (e) { return null; } })();
    if (owner && owner !== uid) { _cloudSyncDone = true; return; }   // 本機是別帳號的資料 → 不自動拉
    const { data, error } = await c.from("backups").select("data, updated_at").eq("user_id", uid).maybeSingle();
    if (error) return;                                           // 查詢失敗 → 不標記，下次再試
    _cloudSyncDone = true;
    const localReal = (Store.getRecords() || []).filter(r => !r.sim).length;
    if (!data || !data.data) {                                   // 雲端還沒備份 → 本機有資料就上傳當種子
      if (localReal > 0) autoCloudBackup();
      return;
    }
    const before = (Store.getRecords() || []).length;
    if (localReal === 0) Store.importAll(data.data, "merge");    // 全新裝置：完整還原
    else Store.cloudMergeRecords(data.data);                     // 已有資料：只安全聯集紀錄
    try { localStorage.setItem("tt_data_uid", uid); localStorage.setItem("tt_last_sync", String(Date.now())); } catch (e) { /* */ }
    const added = (Store.getRecords() || []).length - before;
    ttRefreshAll();
    if (added > 0 && typeof toast === "function") toast(ttT("雲端上的紀錄同步下來了"));
    // 本機有雲端沒有的紀錄 → 反向補上傳，讓另一端也拉得到（雙向匯流）
    if (localReal > 0) autoCloudBackup();
  } catch (e) { /* 靜默：同步失敗不影響使用 */ }
}
if (typeof window !== "undefined") {
  window.cloudAutoSync = cloudAutoSync;
  // 開機：社群載完（含持久化 session）後試一次；未登入則等登入流程再觸發
  if (window.loadSocial) window.loadSocial().then(() => setTimeout(cloudAutoSync, 1200));
}
// 節流上傳：收藏／改名／步道完成／寵物進化等「小變動」也自動備份，讓雲端隨時是最新（不只每趟走完）。
// debounce 10 秒把連續變動併成一次，避免狂點收藏就狂上傳。
let _bkTimer = null;
function scheduleCloudBackup() {
  try { if (typeof Supa === "undefined") return; } catch (e) { return; }
  clearTimeout(_bkTimer);
  _bkTimer = setTimeout(() => { try { autoCloudBackup(); } catch (e) { /* */ } }, 10000);
}
if (typeof window !== "undefined") window.scheduleCloudBackup = scheduleCloudBackup;
// 回到前景時再自動拉一次（換裝置/擱著很久再打開就看得到最新），但 5 分鐘內剛同步過就不重拉。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  let last = 0; try { last = +(localStorage.getItem("tt_last_sync") || 0) || 0; } catch (e) { /* */ }
  if (Date.now() - last < 5 * 60000) return;
  _cloudSyncDone = false;                       // 允許本 session 再拉一次
  setTimeout(cloudAutoSync, 800);
});
// 設定頁「資料備份」區顯示上次同步時間，讓使用者安心（＝雲端是最新的）
function renderSyncStatus() {
  const el = $("#syncStatus"); if (!el) return;
  let last = 0; try { last = +(localStorage.getItem("tt_last_sync") || 0) || 0; } catch (e) { /* */ }
  if (!last) { el.textContent = ""; return; }
  const s = Math.max(1, Math.round((Date.now() - last) / 1000));
  el.textContent = ttT("上次同步") + ttColon() + ttAgo(s);
}
if (typeof window !== "undefined") window.renderSyncStatus = renderSyncStatus;
// 雲端備份/還原：資料安全，任何登入者可用（不鎖 Premium）
const _cbk = $("#btnCloudBackup");
if (_cbk) _cbk.addEventListener("click", () => cloudBackupNow(false));
const _crs = $("#btnCloudRestore");
if (_crs) _crs.addEventListener("click", async () => {
  const x = await cloudClient(); if (!x) return;
  try {
    const { data, error } = await x.c.from("backups").select("data, updated_at").eq("user_id", x.uid).maybeSingle();
    if (error) { toast(ttT("還原失敗") + ttColon() + ttT(Supa.errText(error.message))); return; }
    if (!data) { toast(ttT("雲端還沒有備份，先按「雲端備份」")); return; }
    const when = new Date(data.updated_at).toLocaleString(ttLocale());
    const mode = await askRestoreMode(`${ttT("雲端備份")}${ttColon()}${when}`);
    if (!mode) return;
    Store.importAll(data.data, mode);
    try { localStorage.setItem("tt_data_uid", x.uid); } catch (e) { /* */ }   // 本機資料歸屬＝還原來源帳號
    ttRefreshAll();
    toast(ttT("從雲端還原好了"));
  } catch (e) { toast(ttT("還原失敗") + ttColon() + ttT(Supa.errText(e && e.message))); }
});
// 還原方式：合併（預設）或完全取代；選完全取代要再確認一次（以前一按就整份蓋掉，也沒說兩種差在哪）
async function askRestoreMode(title) {
  const mode = await ttChoice(`${title}\n\n${ttT("合併：保留這台手機上的紀錄，把備份裡的加進來。")}\n${ttT("完全取代：這台手機的資料整份換成備份的內容。")}`, [
    { label: ttT("取消"), value: null, cls: "ghost" },
    { label: ttT("完全取代"), value: "replace", cls: "ghost danger" },
    { label: ttT("合併"), value: "merge", cls: "primary" },
  ]);
  if (mode !== "replace") return mode;
  return (await ttConfirm(ttT("完全取代會刪掉這台手機上、備份裡沒有的紀錄。確定嗎？"), ttT("完全取代"), ttT("取消"), { danger: true })) ? "replace" : null;
}
// 本機備份檔：匯出 JSON 自己保管（不需登入、不需網路）／匯入還原
const _fbk = $("#btnFileBackup");
// 清除本機所有資料（先建議匯出備份；兩道確認）
const _wipe = $("#btnWipeLocal");
// 登入中只清本機沒用：重開後雲端自動同步看到本機是空的，會整份還原回來 → 清除時一併登出這台手機
if (_wipe) _wipe.addEventListener("click", async () => {
  if (!(await ttConfirm(ttT("會刪掉這台手機上的行程、夥伴、成就、設定，並登出這台手機。建議先按「匯出備份檔」。"), ttT("下一步"), ttT("取消")))) return;
  if (!(await ttConfirm(ttT("最後確認：真的全部清掉？雲端備份不會刪，之後登入會再同步回來。"), ttT("全部清掉"), ttT("取消"), { danger: true }))) return;
  try { if (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) { if (typeof Auth !== "undefined" && Auth.signOut) await Auth.signOut(); else await Supa.client().auth.signOut({ scope: "local" }); } } catch (e) { /* 登出失敗也照清 */ }
  try { await Store.clearRecords(); } catch (e) { /* */ }   // 要等封存清完再重整，不然會被自動救援救回來
  try { Object.keys(localStorage).filter(k => k.startsWith("tt_") && !["tt_lang", "tt_fontscale", "tt_theme"].includes(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* */ }
  location.reload();
});
if (_fbk) _fbk.addEventListener("click", () => {
  try {
    const blob = new Blob([JSON.stringify(Store.exportAll())], { type: "application/json" });
    saveBlob(blob, `${["zh", "cn"].includes(I18n.lang()) ? "循徑拾光備份" : "gather-the-trail-backup"}_${todayStr()}.json`, "Gather the Trail backup")
      .then(r => { if (r === "saved") toast(ttT("已匯出備份檔，請妥善保存")); });   // 叫出分享單時由分享單自己回饋，按取消不會再說「已匯出」
  } catch (e) { toast(ttT("匯出失敗，再試一次")); }
});
const _frs = $("#btnFileRestore"), _fri = $("#fileRestoreInput");
if (_frs && _fri) {
  _frs.addEventListener("click", () => _fri.click());
  _fri.addEventListener("change", () => {
    const f = _fri.files && _fri.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const data = JSON.parse(rd.result);
        if (!data || (!data.records && !data.pet && !data.v)) { toast(ttT("這不是有效的備份檔")); _fri.value = ""; return; }
        const mode = await askRestoreMode(ttT("匯入備份檔"));
        if (!mode) { _fri.value = ""; return; }
        Store.importAll(data, mode);
        ttRefreshAll();
        toast(ttT("備份檔還原好了"));
      } catch (e) { toast(ttT("匯入失敗：檔案可能損壞")); }
      _fri.value = "";
    };
    rd.readAsText(f);
  });
}
if (typeof Premium !== "undefined") { setTimeout(() => Premium.refresh().then(() => { try { applyPalette(); applyProColor(); } catch (e) { /* */ } }), 1500); Premium.handleReturn(); }   // 啟動後同步會員狀態→重套主題配色/徽章色 + 處理結帳返回
if (typeof window !== "undefined") setTimeout(() => { try { if (typeof Reminders !== "undefined") Reminders.syncAll(); } catch (e) { /* */ } }, 3500);   // 開機重排健行提醒（有開才會排）

// 前端錯誤自動上報（phase19）：把 index.html 記到 localStorage 的錯誤批次上傳，
// 開發者才能主動發現問題。已上傳的用時間戳記號避免重複；未登入/未跑 SQL 都靜默略過。
async function reportClientErrors() {
  try {
    if (typeof Supa === "undefined" || !Supa.ready()) return;
    const errs = JSON.parse(localStorage.getItem("tt_errors") || "[]");
    const lastSent = localStorage.getItem("tt_errors_sent") || "";
    const fresh = errs.filter(e => e.t > lastSent).slice(0, 10);
    if (!fresh.length) return;
    const c = Supa.client(); const { data: u } = await _meUser();
    if (!u || !u.user) return;
    const ver = await appVersion();
    const rows = fresh.map(e => ({ user_id: u.user.id, message: e.m, app_ver: ver, ua: navigator.userAgent.slice(0, 200), happened_at: e.t }));
    const { error } = await c.from("client_errors").insert(rows);
    if (!error) localStorage.setItem("tt_errors_sent", fresh[0].t);   // errs 由新到舊，第一筆最新
  } catch (e) { /* 靜默 */ }
}
setTimeout(reportClientErrors, 6000);
// 舊版的離線地圖和瀏覽快取混在一起：第一次開新版時整批搬到「下載的離線地圖」獨立快取（只做一次）
setTimeout(() => { try { if (typeof Offline !== "undefined" && Offline.migrate) Offline.migrate().then(() => Offline.cleanupPreload && Offline.cleanupPreload()); } catch (e) { /* */ } }, 5000);

// 進階分析：整頁 PRO（與年度回顧一致）
const _aBtn = $("#btnAnalytics");
if (_aBtn) _aBtn.addEventListener("click", () => { if (!_proGate()) return; ensureScript("js/analytics.js").then(() => { if (typeof openAnalytics === "function") openAnalytics(); }); });
// 年度回顧（PRO）
// openYearReview 住在延遲載入的 js/analytics.js：沒先 ensureScript 就直接呼叫，使用者若沒開過
// 「進階分析」，這顆按鈕會 ReferenceError 然後完全沒反應（不會有任何錯誤畫面）。
const _yBtn = $("#btnYearReview");
if (_yBtn) _yBtn.addEventListener("click", () => { if (!_proGate()) return; ensureScript("js/analytics.js").then(() => { if (typeof openYearReview === "function") openYearReview(); }); });
// 離線地圖包：把快取圖磚打包成單一檔案（備份/給另一台裝置匯入，不必重新下載，也不占下載額度）
const _pkBox = $("#packBox");
function _pkMsg(html) { if (_pkBox) { _pkBox.hidden = false; _pkBox.innerHTML = html; } }
$("#btnPackExport").addEventListener("click", async () => {
  if (!_proGate()) return;   // PRO 限定
  if (typeof ttBusy === "function" && ttBusy("packexp", 4000)) return;
  const n = await Offline.cachedCount();
  if (!n) { toast(ttT("尚未下載任何離線地圖")); return; }
  _pkMsg(ttT("打包離線地圖中…"));
  try {
    const r = await Offline.exportPack((done, total) => { if (done % 200 === 0) _pkMsg(`${ttT("打包離線地圖中…")} ${done}/${total}`); });
    if (!r) { _pkMsg(ttT("尚未下載任何離線地圖")); return; }
    const zh = (typeof I18n === "undefined") || ["zh", "cn"].includes(I18n.lang());   // 檔名：中文介面用中文，其他語言一律英文
    const how = await saveBlob(r.blob, (zh ? "循徑拾光離線地圖" : "gather-the-trail-maps") + ".ttmap", "Gather the Trail offline maps");
    const info = `${r.count} ${ttT("張圖磚")} · ${(r.bytes / 1048576).toFixed(1)} MB`;
    _pkMsg(`${ic("check")} <span>${ttT(how === "saved" ? "地圖包存好了" : "地圖包做好了")}</span>${ttColon()}${info}`);
  } catch (e) { _pkMsg(ttT("匯出失敗，再試一次")); }
});
$("#btnPackImport").addEventListener("click", () => { if (!_proGate()) return; $("#packFile").click(); });
$("#packFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  _pkMsg(ttT("匯入離線地圖中…"));
  try {
    const n = await Offline.importPack(f, (done, total) => { if (done % 200 === 0) _pkMsg(`${ttT("匯入離線地圖中…")} ${done}/${total}`); });
    _pkMsg(`${ic("check")} <span>${ttT("匯入好了，離線也看得到")}</span>${ttColon()}${n} ${ttT("張圖磚")}`);
    refreshOfflineStatus();
  } catch (err) { _pkMsg(ttT("這不是有效的離線地圖包（.ttmap）")); }
});
$("#btnClearTiles").addEventListener("click", async () => {
  if (await ttConfirm(ttT("清除所有下載的離線地圖？之後在山上沒訊號就看不到地圖了。"), ttT("清除"), ttT("取消"), { danger: true })) {
    await Offline.clear();
    try { localStorage.removeItem("tt_offline_sets"); } catch (e) { /* */ }
    refreshOfflineStatus();
    toast(ttT("已清除離線地圖"));
  }
});


// #5 本月摘要：一眼看到本月里程／次數／連續天數／最長單次，日常回訪動機（免費，進階分析仍為 PRO）
// 健行日曆：像月曆一樣的「當月」視圖（日一二三四五六），走過的日子依里程著色、今日圈記；每月自動更新。
function hikeHeatmapHtml() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const byDay = {};
  realRecords().forEach(r => { const dt = new Date(r.date); if (dt.getFullYear() === y && dt.getMonth() === m) { const d = dt.getDate(); byDay[d] = (byDay[d] || 0) + (r.distanceKm || 0); } });
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();   // 0=週日
  const todayDom = now.getDate();
  const loc = (typeof ttLocale === "function") ? ttLocale() : undefined;
  const wd = [];
  for (let i = 0; i < 7; i++) wd.push(new Intl.DateTimeFormat(loc, { weekday: "narrow" }).format(new Date(2023, 0, 1 + i)));   // 2023-01-01 = 週日
  const title = now.toLocaleDateString(loc, { year: "numeric", month: "long" });
  let active = 0;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-c cal-blank"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const km = byDay[d] || 0;
    const lvl = km <= 0 ? 0 : Math.min(10, Math.ceil(km / 1.5));   // 每 1.5km 一級，共 10 級深淺
    if (km > 0) active++;
    const tip = km > 0 ? ` title="${km.toFixed(1)} km"` : "";
    // 有走的日子可以點：下面的列表只看那天
    cells.push(km > 0 ? `<button class="cal-c cal-l${lvl}${d === todayDom ? " cal-today" : ""}" data-calday="${y}-${m}-${d}"${tip} aria-label="${d}・${km.toFixed(1)} km"><span>${d}</span></button>`
      : `<div class="cal-c cal-l0${d === todayDom ? " cal-today" : ""}"><span>${d}</span></div>`);
  }
  return `<div class="hm-wrap cal-wrap">
    <div class="hm-head"><span class="hm-title">${ic("calendar")} ${title}</span><span class="hm-stat">${ttCount(active, "day").replace(/^(\d+)/, "<b>$1</b>")}</span></div>
    <div class="cal-wd">${wd.map(w => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells.join("")}</div>
    <div class="cal-leg"><span>${ttT("走得少")}</span><i class="cal-ramp"></i><span>${ttT("走得多")}</span></div>
  </div>`;
}
function renderMonthSummary() {
  const box = $("#meMonth"); if (!box) return;
  const recs = realRecords();
  const now = new Date();
  const mo = recs.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const moKm = mo.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const moTrips = mo.length;
  const streak = (typeof daysStreak === "function") ? daysStreak() : 0;
  const longest = recs.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  const cell = (v, l, hot) => `<div class="mo-cell${hot ? " hot" : ""}"><div class="mo-v">${v}</div><div class="mo-l">${l}</div></div>`;
  const moHtml = `<div class="mo-summary">
    <div class="mo-head">${ic("calendar")} <b>${ttT("本月摘要")}</b></div>
    <div class="mo-grid">
      ${cell(moKm.toFixed(1), ttT("本月里程") + " km")}
      ${cell(moTrips, ttT("本月次數"))}
      ${cell(streak, ttT("連續天數"), streak >= 2)}
      ${cell(longest.toFixed(1), ttT("最長單次") + " km")}
    </div>
    ${recs.length ? hikeHeatmapHtml() : ""}
  </div>`;
  if (box._last === moHtml) return;   // 沒變就不重畫
  box._last = moHtml; box.innerHTML = moHtml;
  box.querySelectorAll("[data-calday]").forEach(b => b.addEventListener("click", () => {
    const [yy, mm, dd] = b.dataset.calday.split("-").map(Number);
    histDay = histDay && histDay.getTime() === new Date(yy, mm, dd).getTime() ? null : new Date(yy, mm, dd);
    renderHistory(); const h = $("#histHead"); if (h && histDay) h.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
// 年底橫幅：12 月～1 月「你的 2026 山行故事出爐了」（那一年至少 3 趟；按過 × 就收起來到明年）
function storyYear() {
  const d = new Date(), m = d.getMonth();
  try { if (localStorage.getItem("tt_story_force") === "1") return d.getFullYear(); } catch (e) { /* 測試面板：不分月份都顯示橫幅 */ }
  return m === 11 ? d.getFullYear() : m === 0 ? d.getFullYear() - 1 : null;
}
function openStory(year) {
  if (!_proGate()) return;
  ensureScript("js/analytics.js").then(() => ensureScript("js/year-story.js")).then(() => { if (typeof YearStory !== "undefined") YearStory.open(year); });
}
function renderStoryBanner() {
  const box = $("#meStory"); if (!box) return;
  const y = storyYear();
  let hid = null; try { hid = localStorage.getItem("tt_story_x"); } catch (e) { /* */ }
  const n = y ? realRecords().filter(r => +localYear(r.date) === y).length : 0;
  if (!y || n < 3 || hid === String(y)) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="story-banner"><button class="sb-open" id="sbOpen"><span class="sb-yr">${y}</span><span class="sb-t"><b>${ttT("你的 %d 山行故事出爐了").replace("%d", y)}</b><small>${ttT("一頁一頁看這一年，每頁都能存成限動圖")}</small></span><span class="sb-play">${ic("play")}</span></button><button class="sb-x" id="sbX" aria-label="${ttT("關閉")}">${ic("x")}</button></div>`;
  $("#sbOpen").addEventListener("click", () => openStory(y));
  $("#sbX").addEventListener("click", () => { try { localStorage.setItem("tt_story_x", String(y)); } catch (e) { /* */ } box.innerHTML = ""; });
}
function renderStats() {
  const box = $("#meStats");
  renderMonthSummary();
  renderStoryBanner();
  if (!box) return;
  const recs = realRecords();   // 成就統計不計入模擬
  // 「走過的步道」＝真實紀錄裡出現過幾條不同步道（和進階分析同一個定義；自由路線不算）
  const walked = new Set(recs.filter(r => r.trailId || (r.trailName && r.trailName !== "自由路線")).map(r => r.trailId || r.trailName)).size;
  // 各欄取「終身統計」與「現存紀錄合計」較大者（舊紀錄被容量保護砍掉也不縮水）
  const lf = (Store.life && Store.life()) || {};
  const km = Math.max(recs.reduce((s, r) => s + (r.distanceKm || 0), 0), lf.km || 0);
  const asc = Math.max(recs.reduce((s, r) => s + (r.ascent || 0), 0), lf.asc || 0);
  const kcal = Math.max(recs.reduce((s, r) => s + (r.kcal || 0), 0), lf.kcal || 0);
  const ms = Math.max(recs.reduce((s, r) => s + (r.elapsedMs || 0), 0), lf.ms || 0);
  const hrs = ms / 3.6e6;
  const cell = (to, pre, dec, l) => `<div class="mstat"><div class="mv" data-to="${to}" data-pre="${pre}" data-dec="${dec}">${pre}0</div><div class="ml">${l}</div></div>`;
  const html = `<div class="mstat-grid">
    ${cell(Math.max(recs.length, lf.trips || 0), "", 0, "出行次數")}
    ${cell(km, "", 1, "總里程 km")}
    ${cell(asc, "↑", 0, "總爬升 m")}
    ${cell(hrs, "", 1, "總時數 小時")}
    ${cell(kcal, "", 0, "總卡路里")}
    ${cell(walked, "", 0, "走過的步道")}
  </div>`;
  if (box._last === html) return;   // 數字沒變：不重畫、不重播跳動動畫（以前每次切到「我的」都重跑一次）
  box._last = html; box.innerHTML = html;
  box.querySelectorAll(".mv").forEach(countUp);
}
// 數字成長動畫（尊重減少動態）
function countUp(el) {
  const to = parseFloat(el.dataset.to) || 0, pre = el.dataset.pre || "", dec = +el.dataset.dec || 0;
  const fmt = v => pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString());
  // 大數字（含千分位/小數/前綴）會擠爆方框 → 依最終字串長度縮小字級
  const finalLen = fmt(to).length;
  el.classList.toggle("mv-lg", finalLen >= 7 && finalLen < 9);
  el.classList.toggle("mv-xl", finalLen >= 9);
  el.style.setProperty("--n", finalLen);   // CSS 依「字數 × 格寬」算字級：放得下就原尺寸，放不下才縮（見 style.css 數字格）
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to); return; }
  const dur = 750, t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(to * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
const HIST_PAGE = 8;       // 一次顯示幾筆，避免行程太多把頁面拉很長
let histShown = HIST_PAGE, histDay = null;
function _histDate(d) {
  return new Date(d).toLocaleString(ttLocale(), { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function renderHistory(keepShown) {
  renderStats();   // 夥伴卡在「夥伴」頁，這裡不再順手重畫
  const all = Store.getRecords();
  const wrap = $("#historyList");
  const gpxAll = $("#btnExportGpxAll");
  if (gpxAll) gpxAll.hidden = !all.length;
  const tools = $("#histTools"); if (tools) tools.hidden = all.length < 6;   // 紀錄少不需要搜尋
  const toolsOn = all.length >= 6;   // 工具列藏起來時，搜尋字和「不看模擬」也不生效（不然模擬那趟會被藏著又取消不了）
  if (!all.length) {
    wrap.innerHTML = `<div class="empty">${EMPTY_ART}${ttT("還沒有走過的路")}<br><span style="font-size:12.5px">${ttT("第一趟走完，會出現在這裡")}</span><br>
      <button class="btn primary" id="histGoRec" style="max-width:220px;margin:14px auto 0">${ic("pin")} ${ttT("去記錄")}</button></div>`;
    const g = $("#histGoRec"); if (g) g.addEventListener("click", () => document.querySelector('.tab[data-view="record"]').click());
    return;
  }
  // 篩選：搜尋字、不看模擬、只看某一天（月曆點進來）
  const q = toolsOn ? (($("#histSearch") || {}).value || "").trim().toLowerCase() : "", hideSim = toolsOn && !!($("#histHideSim") || {}).checked;
  // 搜尋同時比對原名和翻譯後的名字（英文介面打 Nan'ao 也找得到南澳古道）
  const hay = r => { const nm = r.trailName || "自由路線"; return (nm + " " + ttT(nm)).toLowerCase(); };
  const sameDay = r => { const d = new Date(r.date); return histDay && d.getFullYear() === histDay.getFullYear() && d.getMonth() === histDay.getMonth() && d.getDate() === histDay.getDate(); };
  const recs = all.filter(r => (!hideSim || !r.sim) && (!q || hay(r).includes(q)) && (!histDay || sameDay(r)));
  const flt = $("#histFilter");
  if (flt) {
    flt.hidden = !histDay;
    if (histDay) { flt.innerHTML = `<span>${ic("calendar")} ${histDay.toLocaleDateString(ttLocale(), { month: "long", day: "numeric", weekday: "short" })}</span><button class="ms-x" id="histDayX" aria-label="${ttT("取消")}">${ic("x")}</button>`; $("#histDayX").addEventListener("click", () => { histDay = null; renderHistory(); }); }
  }
  if (!recs.length) { wrap.innerHTML = `<div class="empty" style="padding:24px">${ttT("找不到符合的行程")}</div>`; return; }
  if (!keepShown) histShown = HIST_PAGE;          // 重新進入頁面→收合回前 8 筆
  const shownRecs = recs.slice(0, histShown);
  // 月份小標：各月總計先算好一次（以前每個小標都重掃全部紀錄）
  const monthKey = r => { const d = new Date(r.date); return d.getFullYear() + "-" + d.getMonth(); };
  const mTot = {};
  // 月份小計只算真的走的（模擬不算），跟上面的統計、年度卡同一套算法
  for (const r of recs) { const k = monthKey(r); const o = mTot[k] || (mTot[k] = { n: 0, km: 0 }); if (r.sim) continue; o.n++; if (isFootRec(r)) o.km += r.distanceKm || 0; }
  let _curMonth = null;
  wrap.innerHTML = shownRecs.map(r => {
    let head = "";
    const mk = monthKey(r);
    if (mk !== _curMonth) {
      _curMonth = mk;
      const label = new Date(r.date).toLocaleDateString(ttLocale(), { year: "numeric", month: "long" });
      head = `<div class="hist-month"><span class="hm-name">${label}</span><span class="hm-meta">${ttCount(mTot[mk].n, "trip")} · ${mTot[mk].km.toFixed(1)} km</span></div>`;
    }
    const noKm = r.vehicle;   // 上車自動結束：這趟不算里程 → 數字劃掉，不再一邊寫不計、一邊秀 6.20 km
    return head + `
    <button class="hist-card${r.sim ? " is-sim" : ""}" data-id="${r.id}">
      <div class="top">
        <b>${escHtml(r.trailName || "自由路線")}${r.sim ? ` <span class="sim-tag">${ttT("模擬")}</span>` : ""}${noKm ? ` <span class="sim-tag">${ttT("上車了・不算")}</span>` : ""}</b>
        <span class="date">${_histDate(r.date)}</span>
      </div>
      <div class="row">
        <span>${ic("ruler")}<b${noKm ? ' class="strike"' : ""}>${r.distanceKm.toFixed(1)}</b> km</span>
        <span>${ic("clock")}<b>${fmtDurShort((typeof movingOf === "function" && movingOf(r)) || r.elapsedMs)}</b></span>
        ${r.ascent ? `<span>${ic("mountain")}<b>↑${r.ascent}</b> m</span>` : ""}
        ${r.kcal ? `<span>${ic("fire")}<b>${Math.round(r.kcal)}</b> ${ttT("大卡")}</span>` : ""}
      </div>
      <span class="hist-go" aria-hidden="true">${ic("chevron")}</span>
    </button>`;
  }).join("")
    + (recs.length > histShown
      ? `<button class="btn ghost hist-more" id="histMore">${ttT("看更早的")}${ttParen(recs.length - histShown)}</button>`
      : (recs.length > HIST_PAGE ? `<button class="btn ghost hist-more" id="histLess">${ttT("收合")}</button>` : ""));
  // 點整張卡看回顧（路線檔、改名、刪除都在回顧頁裡）；以前每張卡兩顆按鈕，26 趟就 52 顆
  wrap.querySelectorAll(".hist-card").forEach(b => b.addEventListener("click", async () => {
    const rec = await Store.fullRecord(b.dataset.id);   // 軌跡被容量保護精簡過就到封存撈完整版
    if (rec) openTrackReview(rec);
  }));
  const more = $("#histMore"); if (more) more.addEventListener("click", () => { histShown += HIST_PAGE; renderHistory(true); });
  const less = $("#histLess"); if (less) less.addEventListener("click", () => { histShown = HIST_PAGE; renderHistory(true); $("#historyList").scrollIntoView({ behavior: "smooth", block: "start" }); });
}
{ let _hs; const hs = $("#histSearch"); if (hs) hs.addEventListener("input", () => { clearTimeout(_hs); _hs = setTimeout(() => renderHistory(), 200); }); }
{ const hc = $("#histHideSim"); if (hc) { try { hc.checked = localStorage.getItem("tt_hist_hidesim") === "1"; } catch (e) { /* */ } hc.addEventListener("change", () => { try { localStorage.setItem("tt_hist_hidesim", hc.checked ? "1" : "0"); } catch (e) { /* */ } renderHistory(); }); } }


loadProfile();
