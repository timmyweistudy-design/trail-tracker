// 探索頁：搜尋、篩選與排序、步道卡片列表、地圖瀏覽（從 app.js 拆出來，2026-09-30）。
// 在 app.js 之後載入：用到它的 $、ic、escHtml、tagsOf、Store、地圖底圖等；彼此都是全域，照舊互相呼叫。
// 開機時的 buildFsRegion/buildCollections/buildPresets/render 也搬到這個檔的最後。
// 探索頁往下捲 → 頁首縮小（加遲滯：超過 90 才縮、回到 20 以內才展開，避免高度變動造成來回抖）
(function () {
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY, onExplore = !document.body.dataset.view || document.body.dataset.view === "explore";
      const compact = document.body.classList.contains("hdr-compact");   // 每次從 class 讀，切分頁時才不會跟實際狀態不同步
      const want = onExplore && (compact ? y > 20 : y > 90);
      if (want !== compact) {
        document.body.classList.toggle("hdr-compact", want);
        if (typeof setHeaderH === "function") setTimeout(setHeaderH, 230);   // 搜尋列吸頂位置跟著新的頁首高度走
      }
    });
  }, { passive: true });
})();
// ---------- 探索：篩選與列表 ----------
// 複選：同類用 OR、跨類用 AND；「全部」＝清空該類；再按一次取消
let activeFilters = new Set();   // fav, done, family, d1..d45, tag:*
let activeRegions = new Set();   // 地區（可複選）
let curQuery = "";

// 搜尋用的字串正規化：去空白、轉小寫、「台」一律當「臺」（資料寫臺北，大家習慣打台北——以前「台中」搜不到任何一條）
function nz(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, "").replace(/台/g, "臺"); }
// 每條步道的搜尋字串開機後只算一次（2939 條，每打一個字都重算太浪費）；英文地名字典晚載入，載到後要重算
function hayOf(t) {
  const names = typeof window !== "undefined" && window.TT_NAMES;
  if (t._hay != null && t._hayN === !!names) return t._hay;
  t._hayN = !!names;
  return (t._hay = nz(`${t.name} ${t.position || ""} ${t.region || ""} ${t.system || ""} ${tagsOf(t).join("")} ${(names && names[t.name]) || ""}`));
}
function setPressed(el, on) { el.classList.toggle("active", on); el.setAttribute("aria-pressed", on ? "true" : "false"); }
function syncFilterUI() {
  const none = activeFilters.size === 0;
  document.querySelectorAll("[data-filter]").forEach(c =>
    setPressed(c, c.dataset.filter === "all" ? none : activeFilters.has(c.dataset.filter)));
}
function syncRegionUI() {
  const none = activeRegions.size === 0;
  document.querySelectorAll("[data-region]").forEach(c =>
    setPressed(c, c.dataset.region === "all" ? none : activeRegions.has(c.dataset.region)));
}
function syncSortUI() { document.querySelectorAll("[data-sort]").forEach(c => setPressed(c, c.dataset.sort === curSort)); }
function syncRangeUI() {
  document.querySelectorAll("[data-len]").forEach(c => setPressed(c, +c.dataset.len === maxLen));
  document.querySelectorAll("[data-asc]").forEach(c => setPressed(c, +c.dataset.asc === maxAsc));
  $("#fsOpen").classList.toggle("active", filterOpen); $("#fsGeo").classList.toggle("active", filterGeo);
}
// 探索頁的全部篩選狀態集中在這兩支：重設、套用口袋路線、清除空結果都走同一條路，不會再各自漏同步某個欄位
const EXPLORE_DEFAULT = { filters: [], regions: [], sort: "default", open: false, geo: false, maxLen: 0, maxAsc: 0 };
function setExploreState(st, opts) {
  st = Object.assign({}, EXPLORE_DEFAULT, st || {});
  activeFilters = new Set(st.filters); activeRegions = new Set(st.regions);
  curSort = st.sort; filterOpen = !!st.open; filterGeo = !!st.geo; maxLen = st.maxLen || 0; maxAsc = st.maxAsc || 0;
  if (curSort === "distance" && !myLoc) curSort = "default";   // 不保存定位，沒位置就回預設
  if (curSort !== "distance") { myLoc = null; nearRadius = 0; $("#nearRow").hidden = true; }
  if (opts && opts.clearQuery) { curQuery = ""; $("#searchInput").value = ""; _toggleClear(); }
  if (opts && opts.clearScope) setMapScope(null);
  syncFilterUI(); syncRegionUI(); syncSortUI(); syncRangeUI();
  if (filterGeo) ensureGeo().then(() => { updateFilterDot(); render(); }); else { updateFilterDot(); render(); }
}
function toggleFilter(val) {
  if (val === "all") activeFilters.clear();
  else if (activeFilters.has(val)) activeFilters.delete(val);
  else activeFilters.add(val);
  syncFilterUI(); updateFilterDot(); render();
}
function toggleRegion(val) {
  if (val === "all") activeRegions.clear();
  else if (activeRegions.has(val)) activeRegions.delete(val);
  else activeRegions.add(val);
  syncRegionUI(); updateFilterDot(); render();
}
function setSort(val) {
  if (val === "distance") return setDistanceSort();   // 依距離需先定位，特別處理
  if (myLoc) { myLoc = null; nearRadius = 0; $("#nearRow").hidden = true; }   // 切換到其他排序→關閉附近
  curSort = (curSort === val) ? "default" : val;     // 再按一次取消（回預設）
  syncSortUI();
  updateFilterDot(); render();
}
// 依距離排序：取得定位後依與使用者的距離排序，並顯示半徑篩選列
function setDistanceSort() {
  if (curSort === "distance") {   // 再按一次→關閉
    curSort = "default"; myLoc = null; nearRadius = 0; $("#nearRow").hidden = true;
    syncSortUI();
    updateFilterDot(); render(); toast("已關閉依距離排序"); return;
  }
  if (!navigator.geolocation) { toast("此裝置不支援定位"); return; }
  toast("定位中…");
  navigator.geolocation.getCurrentPosition(
    pos => {
      myLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      curSort = "distance";
      syncSortUI();
      $("#nearRow").hidden = false;
      updateFilterDot(); render(); toast("已依距離排序");
    },
    () => toast("定位失敗，請允許定位權限"),
    { enableHighAccuracy: true, timeout: 10000 });
}
// 進階篩選啟用數量 → 篩選鈕上的小紅點
function updateFilterDot() {
  let n = activeFilters.size + activeRegions.size;
  if (curSort !== "default") n++;
  if (filterOpen) n++;
  if (filterGeo) n++;
  if (maxLen) n++;
  if (maxAsc) n++;
  if (mapScope) n++;
  const dot = $("#filterDot"), btn = $("#btnFilter");
  if (dot) { dot.hidden = !n; dot.textContent = n; }
  if (btn) btn.classList.toggle("active", n > 0);
  const fc = $("#fsCount"); if (fc) fc.textContent = curList ? curList.length : "";
}

// 精選主題輯：點一下套用一組篩選，快速探索
const COLLECTIONS = [
  // 「親子友善」已經在上面的快速篩選列，這裡不再重複一張卡
  { t: "古道巡禮", s: "走進歷史與人文", ic: "gate", f: ["tag:古道"], bg: "linear-gradient(135deg,#a06a3d,#7c4f2c)" },
  { t: "瀑布秘境", s: "清涼水景路線", ic: "drop", f: ["tag:瀑布"], bg: "linear-gradient(135deg,#2f7e8c,#1f5a66)" },
  { t: "海岸線", s: "看海聽濤", ic: "wave", f: ["tag:海景"], bg: "linear-gradient(135deg,#3b6ea5,#274d77)" },
  { t: "森林浴", s: "芬多精滿載", ic: "tree", f: ["tag:森林"], bg: "linear-gradient(135deg,#4a8f55,#2f6b3a)" },
  { t: "湖泊倒影", s: "靜謐水畔", ic: "lake", f: ["tag:湖泊"], bg: "linear-gradient(135deg,#3c7a8c,#285a69)" },
  { t: "輕鬆入門", s: "第一次健行", ic: "sprout", f: ["d1"], bg: "linear-gradient(135deg,#5aa06a,#3c7a4f)" },
  { t: "挑戰級", s: "進階者專屬", ic: "flame", f: ["d45"], bg: "linear-gradient(135deg,#c2683d,#9a4f2c)" },
];
// 依收藏/已完成步道的常見主題，推一個個人化分類
function favoriteTag() {
  const seen = TRAILS.filter(t => Store.isFav(t.id) || Store.trailLog(t.id).done);
  if (seen.length < 2) return null;
  const counts = {};
  seen.forEach(t => tagsOf(t).forEach(g => counts[g] = (counts[g] || 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 ? top[0] : null;
}
let _collList = [];
function buildCollections() {
  const box = $("#collections");
  if (!box) return;
  const ft = favoriteTag();
  _collList = ft ? [{ t: "為你推薦", s: `你常走「${ft}」`, ic: "star", f: ["tag:" + ft], bg: "linear-gradient(135deg,#c79a3d,#9a6f2c)" }, ...COLLECTIONS] : COLLECTIONS.slice();
  box.innerHTML = _collList.map((c, i) =>
    `<button class="coll-card" data-coll="${i}" style="background:${c.bg}">
       <span class="coll-art" aria-hidden="true">${ic(c.ic || "mountain")}</span>
       <span class="coll-ic" aria-hidden="true">${ic(c.ic || "mountain")}</span>
       <span class="coll-go" aria-hidden="true">${ic("chevron")}</span>
       <span class="coll-txt"><span class="coll-t">${c.t}</span><span class="coll-s">${c.s}</span></span></button>`).join("");
  box.querySelectorAll(".coll-card").forEach(b => b.addEventListener("click", () => {
    const c = _collList[+b.dataset.coll];
    setExploreState({ filters: c.f }, { clearQuery: true, clearScope: true });
    $("#trailList").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
// 預設瀏覽（無任何篩選/搜尋）才顯示精選輯，避免雜亂
function updateCollections() {
  const box = $("#collections");
  if (!box) return;
  const none = activeFilters.size === 0 && activeRegions.size === 0 && !curQuery && !mapOn;
  box.hidden = !none;
}

const REGION_GROUPS = [
  ["北部", ["基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"]],
  ["中部", ["苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣"]],
  ["南部", ["嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣"]],
  ["東部", ["花蓮縣", "臺東縣"]],
  ["離島", ["澎湖縣", "金門縣", "連江縣"]],
];
function buildFsRegion() {
  const have = new Set(TRAILS.map(t => t.region).filter(Boolean));
  const known = new Set(REGION_GROUPS.flatMap(g => g[1]));
  const rest = [...have].filter(r => !known.has(r)).sort();
  const chip = r => `<button class="chip" data-region="${escHtml(r)}" aria-pressed="false">${escHtml(r)}</button>`;
  const groups = REGION_GROUPS.map(([g, list]) => [g, list.filter(r => have.has(r))]).concat(rest.length ? [["其他", rest]] : [])
    .filter(([, list]) => list.length)
    .map(([g, list]) => `<div class="fs-rg"><span class="fs-rg-h">${g}</span>${list.map(chip).join("")}</div>`).join("");
  $("#fsRegion").innerHTML = `<div class="fs-rg"><button class="chip active" data-region="all" aria-pressed="true">全部</button>
    <button class="chip" id="fsNear">${ic("pin")} 我附近 10 km</button></div>` + groups;
  const nb = $("#fsNear");
  if (nb) nb.addEventListener("click", () => {
    if (curSort === "distance" && nearRadius === 10) { setDistanceSort(); return; }   // 再按一次＝關閉
    const go = () => { nearRadius = 10; document.querySelectorAll("#nearRow [data-radius]").forEach(x => x.classList.toggle("active", +x.dataset.radius === 10)); render(); };
    if (curSort === "distance" && myLoc) go(); else { setDistanceSort(); setTimeout(() => { if (myLoc) go(); }, 1200); }
  });
}

// 主列 + 篩選面板的難度/主題 chips（共用 data-filter，複選切換）
document.querySelectorAll("[data-filter]").forEach(c =>
  c.addEventListener("click", () => toggleFilter(c.dataset.filter)));
// 篩選面板事件委派（地區/排序）
$("#filterSheet").addEventListener("click", e => {
  const r = e.target.closest("[data-region]"); if (r) return toggleRegion(r.dataset.region);
  const s = e.target.closest("[data-sort]"); if (s) return setSort(s.dataset.sort);
});
$("#fsOpen").addEventListener("click", () => { filterOpen = !filterOpen; $("#fsOpen").classList.toggle("active", filterOpen); updateFilterDot(); render(); });
$("#fsGeo").addEventListener("click", () => {
  filterGeo = !filterGeo; $("#fsGeo").classList.toggle("active", filterGeo);
  if (filterGeo) ensureGeo().then(() => { updateFilterDot(); render(); });
  else { updateFilterDot(); render(); }
});
// 長度／爬升上限：改成選項（原本的滑桿預設停在最右邊「不限」，要往左拉才是限制，跟直覺相反）
$("#fsLen").addEventListener("click", e => { const c = e.target.closest("[data-len]"); if (!c) return; maxLen = +c.dataset.len; syncRangeUI(); updateFilterDot(); render(); });
$("#fsAsc").addEventListener("click", e => { const c = e.target.closest("[data-asc]"); if (!c) return; maxAsc = +c.dataset.asc; syncRangeUI(); updateFilterDot(); render(); });
$("#fsGrade").addEventListener("click", openGradeInfo);
$("#fsReset").addEventListener("click", () => { curSort = "default"; setExploreState(EXPLORE_DEFAULT, { clearScope: true }); });
$("#btnFilter").addEventListener("click", () => { updateFilterDot(); $("#filterMask").classList.add("show"); $("#filterSheet").classList.add("show"); $("#closeFilterBtn").focus({ preventScroll: true }); });
// 篩選預設組（口袋路線）
function getPresets() { try { return JSON.parse(localStorage.getItem("tt_presets")) || []; } catch { return []; } }
function savePresets(a) { localStorage.setItem("tt_presets", JSON.stringify(a)); }
function currentFilterState() { return { filters: [...activeFilters], regions: [...activeRegions], sort: curSort, open: filterOpen, geo: filterGeo, maxLen, maxAsc }; }
function applyPreset(p) { setExploreState(p); }
function buildPresets() {
  const ps = getPresets(), grp = $("#fsPresetGroup"), box = $("#fsPresets");
  if (!grp) return;
  grp.hidden = !ps.length;
  box.innerHTML = ps.map((p, i) => `<button class="chip preset" data-i="${i}">${escHtml(p.name)}<span class="px" data-del="${i}" aria-label="${ttT("刪除")}">${ic("x")}</span></button>`).join("");
  box.querySelectorAll(".chip.preset").forEach(b => b.addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    if (del) { const a = getPresets(); a.splice(+del.dataset.del, 1); savePresets(a); buildPresets(); return; }
    applyPreset(ps[+b.dataset.i]);
  }));
}
const PRESET_FREE = 3;
$("#fsSavePreset").addEventListener("click", () => {
  if (!activeFilters.size && !activeRegions.size && curSort === "default" && !filterOpen && !filterGeo && !maxLen && !maxAsc) { toast("先設定一些篩選再儲存"); return; }
  if (!(typeof Premium !== "undefined" && Premium.isOn()) && getPresets().length >= PRESET_FREE) {
    toast(`免費口袋路線上限 ${PRESET_FREE} 組，升級 Premium 無限`);
    if (typeof Premium !== "undefined") Premium.openUpgrade();
    return;
  }
  askInput({ title: "為這組篩選命名", value: "常用篩選", max: 10 }).then(name => {
    if (name == null) return;
    const a = getPresets(); a.push({ name: name.trim().slice(0, 10) || "常用", ...currentFilterState() }); savePresets(a);
    buildPresets(); toast("已存成口袋路線");
  });
});
function closeFilter() { $("#filterMask").classList.remove("show"); $("#filterSheet").classList.remove("show"); }
$("#filterMask").addEventListener("click", closeFilter);
$("#closeFilterBtn").addEventListener("click", closeFilter);
$("#fsApply").addEventListener("click", closeFilter);

let _searchTm;
// 最近搜尋（裝置本機，最多 8 筆）
function _recent() { try { return JSON.parse(localStorage.getItem("tt_recent") || "[]"); } catch { return []; } }
function _pushRecent(q) {
  q = (q || "").trim(); if (q.length < 1) return;
  try { const a = _recent().filter(x => x !== q); a.unshift(q); localStorage.setItem("tt_recent", JSON.stringify(a.slice(0, 8))); } catch (e) { /* */ }
}
function _toggleClear() { const b = $("#searchClear"); if (b) b.hidden = !$("#searchInput").value; }
$("#searchInput").addEventListener("input", e => {
  curQuery = e.target.value.trim();
  _toggleClear();
  buildSuggest(curQuery);
  clearTimeout(_searchTm); _searchTm = setTimeout(render, 180);   // 防抖，打字更順
});
$("#searchInput").addEventListener("focus", e => buildSuggest(e.target.value.trim()));
// 建議清單可用鍵盤上下選、Enter 開啟、Esc 收起
let _sugIdx = -1;
function _sugItems() { return [...$("#searchSuggest").querySelectorAll(".sug")]; }
function _sugMark() { _sugItems().forEach((b, i) => { b.classList.toggle("on", i === _sugIdx); b.setAttribute("aria-selected", i === _sugIdx ? "true" : "false"); }); }
$("#searchInput").addEventListener("keydown", e => {
  const box = $("#searchSuggest"), items = box.hidden ? [] : _sugItems();
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
    e.preventDefault(); _sugIdx = (_sugIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; _sugMark(); return;
  }
  if (e.key === "Escape") { _sugHide(); return; }
  if (e.key === "Enter") {
    if (_sugIdx >= 0 && items[_sugIdx]) { e.preventDefault(); items[_sugIdx].dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return; }
    _pushRecent(curQuery); $("#searchInput").blur();
  }
});
function _sugHide() { const box = $("#searchSuggest"); box.hidden = true; _sugIdx = -1; $("#searchInput").setAttribute("aria-expanded", "false"); }
function _sugShow() { $("#searchSuggest").hidden = false; _sugIdx = -1; $("#searchInput").setAttribute("aria-expanded", "true"); }
$("#searchClear").addEventListener("click", () => {
  const inp = $("#searchInput"); inp.value = ""; curQuery = ""; _toggleClear();
  buildSuggest(""); render(); inp.focus();
});
// 語音搜尋
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#searchMic"); if (!mic) return;
  if (!SR) { mic.hidden = true; return; }
  mic.addEventListener("click", () => {
    const r = new SR(); r.lang = (typeof ttLocale === "function" && ttLocale()) || "zh-TW"; r.interimResults = false; r.maxAlternatives = 1;   // 跟著介面語言辨識
    mic.classList.add("listening"); toast("請說出步道名稱…");
    r.onresult = e => {
      const txt = (e.results[0][0].transcript || "").replace(/[。，、？！\s]/g, "");
      $("#searchInput").value = txt; curQuery = txt; buildSuggest(txt); render();
    };
    r.onend = () => mic.classList.remove("listening");
    r.onerror = () => { mic.classList.remove("listening"); toast("語音辨識失敗，請再試一次"); };
    try { r.start(); } catch (e) { mic.classList.remove("listening"); }
  });
})();
$("#searchInput").addEventListener("blur", () => setTimeout(_sugHide, 150));
// 搜尋建議下拉：即時列出符合的步道名，點一下直接進詳情
function buildSuggest(q) {
  const box = $("#searchSuggest");
  const raw = q; q = nz(q);
  // 空查詢＋有最近搜尋 → 顯示「最近搜尋」清單（點一下帶入並搜尋）
  if (!q) {
    const rec = _recent();
    // 一句話搜尋的示範：沒有最近搜尋時也顯示，讓人知道可以整句打（js/nl-search.js）
    // 一句話搜尋只聽得懂中文和英文：其他語言顯示翻好的句子，但實際搜英文版
    const lg = typeof I18n !== "undefined" ? I18n.lang() : "zh", parsable = ["zh", "cn", "en"].includes(lg);
    const tips = [["台北 3 小時內 有瀑布", "Taipei waterfall under 3 hours"], ["宜蘭 親子 半天", "Yilan family half day"]].map(([z, e]) => [ttT(z), parsable ? ttT(z) : e]);
    box.innerHTML = (rec.length ? `<div class="sug-head">${ttT("最近搜尋")}<button class="sug-clear" id="sugClearRecent">${ttT("清除")}</button></div>` +
      rec.map(r => `<button class="sug" role="option" data-q="${escHtml(r)}">${ic("clock")}<span class="sug-n">${escHtml(r)}</span></button>`).join("") : "") +
      `<div class="sug-head">${ttT("也可以整句打")}</div>` + tips.map(([l, q]) => `<button class="sug sug-tip" role="option" data-q="${escHtml(q)}">${ic("sparkle")}<span class="sug-n">${escHtml(l)}</span></button>`).join("");
    _sugShow();
    const cb = box.querySelector("#sugClearRecent");
    if (cb) cb.addEventListener("mousedown", e => { e.preventDefault(); try { localStorage.removeItem("tt_recent"); } catch (x) { } _sugHide(); });
    box.querySelectorAll(".sug[data-q]").forEach(b => b.addEventListener("mousedown", e => {
      e.preventDefault(); const inp = $("#searchInput"); inp.value = b.dataset.q; curQuery = b.dataset.q; _toggleClear(); buildSuggest(b.dataset.q); render();
    }));
    return;
  }
  const hits = [];
  for (const t of TRAILS) {
    if (nz(t.name).includes(q)) hits.push(t);
    if (hits.length >= 30) break;
  }
  hits.sort((a, b) => (nz(a.name).startsWith(q) ? 0 : 1) - (nz(b.name).startsWith(q) ? 0 : 1));
  const top = hits.slice(0, 6);
  if (!top.length) { _sugHide(); return; }
  // 同名步道很多（120 組），第二欄用鄉鎮而不是只有縣市，才分得出是哪一條
  const dupe = new Set(top.filter((t, i) => top.findIndex(x => x.name === t.name) !== i).map(t => t.name));
  box.innerHTML = top.map(t => {
    const where = dupe.has(t.name) || TRAILS_DUP.has(t.name) ? (t.position || t.region || "") : (t.region || "");
    return `<button class="sug" role="option" data-id="${t.id}">${ic("pin")}<span class="sug-n">${hlMatch(t.name, raw)}</span><span class="sug-r">${escHtml(where)}</span></button>`;
  }).join("");
  _sugShow();
  box.querySelectorAll(".sug").forEach(b => b.addEventListener("mousedown", e => {
    e.preventDefault(); _sugHide(); _pushRecent($("#searchInput").value.trim()); openDetail(b.dataset.id);
  }));
}

// 把打中的字標出來（台／臺視為同一字；名字本身先跳脫）
function hlMatch(name, q) {
  const n = String(name || ""), k = nz(q);
  if (!k) return escHtml(n);
  const norm = n.replace(/台/g, "臺").toLowerCase();
  const i = norm.indexOf(k);
  if (i < 0) return escHtml(n);
  return escHtml(n.slice(0, i)) + "<mark>" + escHtml(n.slice(i, i + k.length)) + "</mark>" + escHtml(n.slice(i + k.length));
}
// 名稱重複的步道（OSM 常見：好幾條都叫「親山步道」）——卡片與建議清單要多顯示地點
const TRAILS_DUP = (() => { const c = {}; (typeof TRAILS !== "undefined" ? TRAILS : []).forEach(t => c[t.name] = (c[t.name] || 0) + 1); return new Set(Object.keys(c).filter(k => c[k] > 1)); })();
// 檢視模式：列表 / 地圖（分段控制）
document.querySelectorAll(".seg-btn[data-mode]").forEach(b => b.addEventListener("click", () => {
  const map = b.dataset.mode === "map";
  document.querySelectorAll(".seg-btn[data-mode]").forEach(x => x.classList.toggle("on", x === b));
  mapOn = map;
  $("#browseMap").hidden = !map;
  $("#trailList").hidden = map;
  document.querySelectorAll(".seg-btn[data-mode]").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false"));
  if (map) showBrowseMap(); else render();
}));

let myLoc = null;       // 使用者位置（附近排序用）
let pageSize = 60, shown = 0, curList = [];

let curSort = "default", filterOpen = false, filterGeo = false, nearRadius = 0, maxLen = 0, maxAsc = 0;   // 0 = 不限
function isClosed(t) { return t.condition && /暫停|封閉|關閉/.test(t.condition.status || ""); }
function matchDiff(f, t) { return f === "d45" ? t.difficulty >= 4 : t.difficulty === +f.slice(1); }
// render 期間快取收藏/步記，避免每張卡重複解析 localStorage
let _favSet = new Set(), _logCache = {};
function refreshCardCache() {
  try { _favSet = new Set(JSON.parse(localStorage.getItem("tt_favs") || "[]")); } catch { _favSet = new Set(); }
  try { _logCache = JSON.parse(localStorage.getItem("tt_log") || "{}"); } catch { _logCache = {}; }
}
const isFavC = id => _favSet.has(id);
const logC = id => _logCache[id] || {};
function matches(t) {
  // 地區（複選 OR）
  if (activeRegions.size && !activeRegions.has(t.region)) return false;
  if (filterOpen && isClosed(t)) return false;
  if (filterGeo && !geoOf(t)) return false;
  // 旗標（各自 AND）
  if (activeFilters.has("fav") && !isFavC(t.id)) return false;
  if (activeFilters.has("done") && !logC(t.id).done) return false;
  if (activeFilters.has("family") && !t.family_friendly) return false;
  if (activeFilters.has("rated4") && (logC(t.id).rating || 0) < 4) return false;
  if (maxLen && (t.length_km == null || t.length_km > maxLen)) return false;
  if (maxAsc && (ascVal(t) == null || ascVal(t) > maxAsc)) return false;
  if (nearRadius && myLoc) { if (!t.lat || haversine(myLoc, { lat: t.lat, lon: t.lon }) > nearRadius * 1000) return false; }
  if (mapScope && (!t.lat || t.lat < mapScope.s || t.lat > mapScope.n || t.lon < mapScope.w || t.lon > mapScope.e)) return false;
  // 難度（複選 OR）
  const diffs = [...activeFilters].filter(f => /^d\d/.test(f));
  if (diffs.length && !diffs.some(f => matchDiff(f, t))) return false;
  // 主題標籤（複選 OR）
  const tags = [...activeFilters].filter(f => f.startsWith("tag:")).map(f => f.slice(4));
  if (tags.length) { const tt = tagsOf(t); if (!tags.some(g => tt.includes(g))) return false; }
  if (curQuery) {
    if (_nl) {   // 一句話搜尋（js/nl-search.js）：拆成條件比對
      if (!NLSearch.match(t, _nl, estHours, slopeInfo)) return false;
      if (_nl.near && myLoc && (!t.lat || haversine(myLoc, { lat: t.lat, lon: t.lon }) > 25000)) return false;
    } else if (!hayOf(t).includes(_q)) return false;
  }
  return true;
}
// 一句話搜尋看懂的條件：列成一排小標籤，讓人知道結果是怎麼篩的
let _nl = null;
function renderNLBar() {
  const box = document.getElementById("nlBar"); if (!box) return;
  if (!_nl) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<span class="nl-h">${ic("sparkle")}${ttT("看懂了")}</span>${_nl.chips.map(([, l]) => `<span class="nl-chip">${escHtml(l)}</span>`).join("")}${_nl.words.map(w => `<span class="nl-chip nl-word">「${escHtml(w)}」</span>`).join("")}<button class="nl-x" id="nlClear">${ttT("清除")}</button>`;
  box.querySelector("#nlClear").addEventListener("click", () => { const inp = $("#searchInput"); inp.value = ""; curQuery = ""; _toggleClear(); render(); });
}

// 累積爬升：哪個數字最可信、它是怎麼來的（卡片、篩選、時間估算、陡度、詳情頁、比較表共用）
//   dem   ＝ 沿路線用地形圖算的真實累積爬升（scripts/compute-gain.mjs 預先算好）
//   range ＝ 林業署資料：其實是「最高 − 最低海拔」，不是累積爬升（路線圖不夠準時只能用這個）
//   est   ＝ 社群步道舊的粗估（沒有路線圖時）
// 林業署步道的路線圖是借 OSM 同名路線，長度跟官方差太多（< 0.75 或 > 1.5 倍）就可能畫到別段 → 不採用
function demTrusted(t) {
  if (t.dem_gain == null) return false;
  if (t.source !== "forestry") return true;
  const r = t.length_km && t.geo_km ? t.geo_km / t.length_km : 0;
  return r >= 0.75 && r <= 1.5;
}
function trailAscent(t) {
  if (demTrusted(t)) return { v: t.dem_gain, kind: "dem" };
  if (t.ascent == null) return null;
  return { v: Math.round(t.ascent), kind: t.source === "forestry" ? "range" : "est" };
}
function ascVal(t) { const a = trailAscent(t); return a ? a.v : null; }
// 環狀／單程：只在路線圖可信時說（頭尾相距 < 150 m＝環狀）
function routeShape(t) { return demTrusted(t) ? (t.loop ? "loop" : "oneway") : null; }
// 親子友善：林業署的是官方描述；社群步道是照名稱、難度、長度推估的
function familyLabel(t) { return t.family_friendly ? (t.source === "forestry" ? "親子友善" : "可能適合親子") : null; }

// 預估時間（全部步道都用同一套算，卡片和詳情頁才一致；官方「半天／一天」太粗，只在詳情頁當參考）
// 平路 3.5 km/h、每爬 500 m 多 1 小時（台灣郊山常用的保守抓法；Naismith 是 5 km/h＋600 m/h）
function estHours(t) {
  if (t.length_km == null) return null;
  const h = t.length_km / 3.5 + (ascVal(t) || 0) / 500;
  return h < 0.25 ? 0.25 : h;
}
function fmtHours(h) {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60 / 5) * 5} ${ttT("分鐘")}`;
  if (h > 10) return `${Math.max(2, Math.round(h / 8))} ${ttT("天")}`;   // 55 km 的林道不再寫「21 小時」，一天抓 8 小時
  return `${(Math.round(h * 2) / 2).toString()} ${ttT("小時")}`;
}
// 公里數：1 位小數、不到 1 公里給 2 位（原本 0.263、55.06、1.5 混在一起）
function fmtKm(km) {
  if (km == null) return "—";
  const v = km < 1 ? km.toFixed(2) : km < 100 ? km.toFixed(1) : String(Math.round(km));
  return v.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}
// 官方「建議時程」只在是短短一個時長時才用（有 2 條資料把整段路線說明塞在這欄）
function shortTour(t) { return t.tour && t.tour.length <= 8 && !/[，,。；]/.test(t.tour) ? t.tour : null; }
// 陡度（每公里爬升）：卡片和詳情頁共用同一套說法。超過 400 m/km 的多半是資料錯（例如 0.26 km 爬 240 m），不顯示
function slopeInfo(t) {
  const asc = ascVal(t);
  if (asc == null || !t.length_km) return null;
  const perKm = asc / t.length_km;
  if (perKm > 400) return { perKm, word: null, bad: true };
  const word = perKm < 40 ? "平緩" : perKm < 100 ? "有點坡" : perKm < 200 ? "會喘" : "很陡";
  return { perKm, word, level: perKm < 100 ? 0 : perKm < 200 ? 1 : 2 };
}
// 我走過幾次（render 期間共用 popularityScore 的快取）
function walkedTimes(id) {
  if (!_walkCount) { _walkCount = {}; Store.getRecords().forEach(r => { if (r.trailId != null && !r.sim) _walkCount[r.trailId] = (_walkCount[r.trailId] || 0) + 1; }); }
  return _walkCount[id] || 0;
}
// 難度字（去掉「(估)」）與徽章：卡片、詳情頁、附近步道、比較表共用同一套
function diffEst(t) { return /[（(]估[)）]/.test(t.difficulty_label || ""); }
function diffLabel(t) { return escHtml(String(t.difficulty_label || "").replace(/\s*[（(]估[)）]/, "")); }
// 估算的難度加 ≈（≈ 和難度字分開，翻譯才對得到）；雪季不是難度，另外用季節標籤
function diffBadgeHtml(t) {
  const d = t.difficulty || 0, est = diffEst(t);
  if (d === 6) return `<span class="badge snow">${ic("snow")} ${ttT("雪季限定")}</span>`;
  return `<span class="badge diff d${d}${est ? " est" : ""}"${est ? ` title="${ttT("難度是依長度和爬升估的")}"` : ""}><span class="lvl">${d}</span>${est ? `<span class="approx">≈</span>` : ""}<span>${diffLabel(t)}</span></span>`;
}
// 所需時間：官方短時程，否則用估算（加 ≈）
// 個人化預估時間：拿你自己的紀錄，比「用同一套公式算出來的時間」和「你實際花的時間」，取中位數當你的腳程係數。
// 至少 3 趟像樣的紀錄（1 km 以上、20 分鐘以上，不含模擬、上車）才給，不然寧可不說
let _paceCache = null;
function myPaceFactor() {
  const recs = (typeof realRecords === "function" ? realRecords() : []).filter(r => !r.sim && !r.vehicle && (r.distanceKm || 0) >= 1 && (r.elapsedMs || 0) >= 20 * 60000);
  const sig = recs.length + "|" + (recs[0] ? recs[0].id : "");
  if (_paceCache && _paceCache.sig === sig) return _paceCache.f;
  const ratios = recs.slice(0, 15).map(r => (r.elapsedMs / 3.6e6) / (r.distanceKm / 3.5 + (r.ascent || 0) / 500)).filter(x => isFinite(x) && x > 0.3 && x < 4).sort((a, b) => a - b);
  const f = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : null;
  _paceCache = { sig, f };
  return f;
}
function myHoursFor(t) { const f = myPaceFactor(), h = estHours(t); return f && h ? h * f : null; }
// 「依你的腳程 ≈ 3 小時 20 分」：只在差距明顯（10% 以上）時顯示，差不多就不多講
function myTimeHtml(t) {
  const mine = myHoursFor(t), base = estHours(t);
  if (!mine || !base || Math.abs(mine - base) / base < 0.1) return "";
  const m = Math.round(mine * 60 / 5) * 5, txt = mine > 10 ? fmtHours(mine) : (m < 60 ? `${m} ${ttT("分鐘")}` : `${Math.floor(m / 60)} ${ttT("小時")}${m % 60 ? ` ${m % 60} ${ttT("分")}` : ""}`);
  return `<div class="my-est">${ic("footprints")} <span>${ttT("依你的腳程")}</span> <b>≈ ${txt}</b></div>`;
}
function timeHtml(t) { return `<span class="approx">≈</span>${fmtHours(estHours(t))}`; }
function trailCard(t) {
  const d = t.difficulty || 0, closed = isClosed(t), snow = d === 6;
  const fav = isFavC(t.id), lg = logC(t.id), times = walkedTimes(t.id), done = lg.done || times > 0;
  const distKm = (myLoc && t.lat) ? haversine(myLoc, { lat: t.lat, lon: t.lon }) / 1000 : null;
  const asc = ascVal(t);
  // 三格永遠都在（沒資料就「—」），卡片高度才一致；單位跟著數字走
  const stats = [
    `<div class="jstat"><div class="jnum">${fmtKm(t.length_km)}<small>km</small></div><div class="jlbl">${ttT("距離")}</div></div>`,
    `<div class="jstat"><div class="jnum" data-card-asc>${asc != null ? `↑${asc}<small>m</small>` : "—"}</div><div class="jlbl">${ttT("爬升")}</div></div>`,
    `<div class="jstat"><div class="jnum jnum-sm">${timeHtml(t)}</div><div class="jlbl">${ttT("預估時間")}</div></div>`,
  ];
  // 地點：跨縣市的只顯示第一個＋「+1」，完整的放 title
  const pos = String(t.position || "—"), posParts = pos.split(/[；;]/).map(x => x.trim()).filter(Boolean);
  const posShow = posParts.length > 1 ? `${escHtml(posParts[0])} <b class="jloc-more">+${posParts.length - 1}</b>` : escHtml(pos);
  const dLabel = diffLabel(t), diffBadge = diffBadgeHtml(t);
  const sl = slopeInfo(t);
  const mine = done ? `<span class="badge mine">${ic("check")} ${times > 1 ? `${ttT("走過")} ${times} ${ttT("次")}` : ttT("走過")}${lg.rating ? ` · ${"★".repeat(lg.rating)}` : ""}</span>` : "";
  const nm = escHtml(t.name);
  const aria = `${t.name}，${fmtKm(t.length_km)} ${ttT("公里")}，${snow ? ttT("雪季限定") : dLabel}${closed ? "，" + t.condition.status : ""}${done ? "，" + ttT("走過") : ""}`;
  return `<div class="card jcard${closed ? " is-closed" : ""}" data-id="${t.id}" role="button" tabindex="0" aria-label="${escHtml(aria)}">
    <span class="jbar d${d}"></span>
    ${closed ? `<div class="jclosed">${ic("alert")} ${escHtml(t.condition.status)}</div>` : ""}
    <button class="fav-star${fav ? " on" : ""}" data-fav="${t.id}" aria-pressed="${fav}" aria-label="${ttT("收藏")} ${nm}">${STAR_SVG}</button>
    <h3 title="${nm}">${nm}</h3>
    <div class="jloc" title="${escHtml(pos)}">${ic("pin")}<span class="jloc-t">${posShow}</span></div>
    <div class="jstats">${stats.join('<span class="jstats-div"></span>')}</div>
    <div class="badges">
      ${distKm != null ? `<span class="badge near">${ic("compass")} ${distKm < 10 ? distKm.toFixed(1) : Math.round(distKm)} km</span>` : ""}
      ${diffBadge}
      ${mine}
      ${closed || !t.condition ? "" : `<span class="badge warn">${ic("alert")} ${escHtml(t.condition.status)}</span>`}
      ${sl && sl.level ? `<span class="badge slope s${sl.level}" title="${Math.round(sl.perKm)} m/km">${ttT(sl.word)}</span>` : ""}
      ${familyLabel(t) ? `<span class="badge family">${ttT(familyLabel(t))}</span>` : ""}
    </div>
  </div>`;
}

// 「熱門」排序分數：沒有全站造訪數，用「資料完整度＋可近性」當熱門度代理
// （官方建置、有路況監測、親子友善、交通便利、有季節/時程資訊、難度親民＝越熱門）
let _walkCount = null;
function popularityScore(t) {
  let s = 0;
  // 自己的偏好優先：評分、走過幾次、有沒有收藏（沒有全站熱門資料，這是「推薦」的主要依據）
  s += (logC(t.id).rating || 0) * 1.5 + Math.min(3, walkedTimes(t.id)) + (isFavC(t.id) ? 2 : 0);
  if (t.source === "forestry") s += 4;
  if (t.condition) s += 1;
  if (t.family_friendly) s += 2;
  if (t.tour) s += 1;
  if (t.best_season) s += 1;
  if (t.pave) s += 1;
  if (t.transport && (t.transport.car || t.transport.m_bus || t.transport.l_bus)) s += 1;
  s += (6 - (t.difficulty || 3)) * 0.5;   // 難度越低越大眾
  return s;
}
// 詳情頁「附近其他步道」：優先用座標找最近的，否則同縣市
// 地圖上的小碎段（< 0.5 km）和叫「健行步道」這種沒名字的不推薦：點進去都是同一條路的一小截
const _vagueName = /^(健行步道|步道|登山步道|登山路線|山徑|小徑|產業道路|林道)$/;
function nearbyTrails(t, n = 8) {
  const pool = TRAILS.filter(x => x.id !== t.id && x.name !== t.name && !(x.length_km != null && x.length_km < 0.5) && !_vagueName.test(x.name || ""));
  if (t.lat && t.lon) {
    const near = pool.filter(x => x.lat && x.lon)
      .map(x => ({ x, d: haversine({ lat: t.lat, lon: t.lon }, { lat: x.lat, lon: x.lon }) }))
      .filter(o => o.d <= 80000)
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map(o => Object.assign({ _distKm: o.d / 1000 }, o.x));
    if (near.length) return near;
  }
  return pool.filter(x => x.region && x.region === t.region).slice(0, n);
}
function nearbyStripHtml(t) {
  const list = nearbyTrails(t);
  if (!list.length) return "";
  const cards = list.map(x => {
    const d = x.difficulty || 0;
    const bits = [x.difficulty === 6 ? `<span>${ttT("雪季限定")}</span>` : `${diffEst(x) ? `<span class="approx">≈</span>` : ""}<span>${diffLabel(x)}</span>`];
    if (x.length_km != null) bits.push(`${fmtKm(x.length_km)} km`);
    const dist = x._distKm != null ? `<span class="nb-dist">${ic("compass")}${x._distKm.toFixed(x._distKm < 10 ? 1 : 0)} km</span>` : "";
    return `<button class="nearby-card" data-id="${x.id}"><span class="nb-bar d${d}"></span><span class="nb-name">${escHtml(x.name)}</span><span class="nb-meta">${bits.join(" · ")}</span>${dist}</button>`;
  }).join("");
  return `<div class="section-title" id="secNearby">${ic("compass")}${ttT("附近其他步道")}</div><div class="nearby-strip" id="nearbyBox">${cards}</div>`;
}

let _q = "";
function render() {
  refreshCardCache();
  _walkCount = null;
  _q = nz(curQuery);
  _nl = (curQuery && typeof NLSearch !== "undefined") ? NLSearch.parse(curQuery) : null;
  renderNLBar();
  curList = TRAILS.filter(matches);
  if (myLoc) curList.sort((a, b) =>
    (a.lat ? haversine(myLoc, { lat: a.lat, lon: a.lon }) : 9e9) -
    (b.lat ? haversine(myLoc, { lat: b.lat, lon: b.lon }) : 9e9));
  else if (curQuery && !_nl && curSort === "default") {
    // 搜尋相關度：名稱開頭命中 > 名稱包含 > 林務署官方優先 > 短的優先
    const q = _q;
    const score = t => {
      const n = nz(t.name);
      return (n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2) * 10 + (t.source === "forestry" ? 0 : 3);
    };
    curList.sort((a, b) => score(a) - score(b) || (a.length_km ?? 9e9) - (b.length_km ?? 9e9));
  }
  else if (curSort !== "default") {
    const ln = t => t.length_km == null ? 9e9 : t.length_km;
    const df = t => t.difficulty == null ? 99 : t.difficulty;
    // 最近走過：用紀錄裡各步道的最新日期
    let lastWalk = null;
    if (curSort === "recent") {
      lastWalk = new Map();
      for (const r of Store.getRecords()) {
        if (r.trailId == null || !r.date) continue;
        const k = String(r.trailId), d = String(r.date);
        if (!lastWalk.has(k) || d > lastWalk.get(k)) lastWalk.set(k, d);
      }
    }
    const cmp = {
      "length-asc": (a, b) => ln(a) - ln(b), "length-desc": (a, b) => ln(b) - ln(a),
      "diff-asc": (a, b) => df(a) - df(b), "diff-desc": (a, b) => df(b) - df(a),
      "rating-desc": (a, b) => (Store.trailLog(b.id).rating || 0) - (Store.trailLog(a.id).rating || 0),
      "name": (a, b) => a.name.localeCompare(b.name, "zh-Hant"),
      "recent": (a, b) => (lastWalk.get(String(b.id)) || "").localeCompare(lastWalk.get(String(a.id)) || "") || ln(a) - ln(b),
      "popular": (a, b) => popularityScore(b) - popularityScore(a) || ln(a) - ln(b),
    }[curSort];
    if (cmp) curList.sort(cmp);
  }
  $("#resultCount").textContent = `共 ${curList.length.toLocaleString("en-US")} 條步道`;
  updateFilterDot();
  updateCollections();
  if (mapOn) { showBrowseMap(); return; }
  shown = 0;
  if (_io) _io.disconnect();
  $("#trailList").innerHTML = "";
  if (!curList.length) {
    // 依「為什麼是空的」給對的話：收藏空/完成空要引導怎麼做，別一律說「找不到、清除篩選」
    let msg = "找不到符合的步道", hint = "試試清除篩選或換個關鍵字";
    if (activeFilters.has("fav")) { msg = "還沒有收藏的步道"; hint = "點步道卡右上的 ☆ 就能收藏"; }
    else if (activeFilters.has("done")) { msg = "還沒有完成的步道"; hint = "走完一條步道就會自動標記完成"; }
    $("#trailList").innerHTML = `<div class="empty">${EMPTY_ART}${msg}<br>
      <span style="font-size:12.5px">${hint}</span><br>
      <button class="chip" id="emptyReset" style="margin-top:14px">清除所有篩選</button></div>`;
    // 連搜尋字也一起清（以前只清篩選，關鍵字還在，按了還是 0 條，看起來像按鈕壞掉）
    $("#emptyReset").addEventListener("click", () => { curSort = "default"; setExploreState(EXPLORE_DEFAULT, { clearQuery: true, clearScope: true }); });
    return;
  }
  renderMore();
}

let _io = null;
function ensureObserver() {
  if (!_io) _io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) renderMore(); }, { rootMargin: "700px" });
  return _io;
}
// 卡片互動：整個清單只綁一次（事件委派），不再每張卡各綁 2～3 個監聽
function bindCards() {
  const L = $("#trailList"); if (!L || L._bound) return; L._bound = true;
  L.addEventListener("click", e => {
    const star = e.target.closest(".fav-star");
    if (star && L.contains(star)) {
      if (!Store.isFav(star.dataset.fav) && !favAddAllowed()) return;
      const added = Store.toggleFav(star.dataset.fav);
      star.classList.toggle("on", added); star.setAttribute("aria-pressed", added);
      if (added) { star.classList.remove("pop"); void star.offsetWidth; star.classList.add("pop"); }
      toast(ttT(added ? "已加入收藏" : "已移除收藏"));
      return;
    }
    const c = e.target.closest(".jcard"); if (c && L.contains(c)) openDetail(c.dataset.id);
  });
  L.addEventListener("keydown", e => {
    const c = e.target.closest && e.target.closest(".jcard");
    if (c && e.target === c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(c.dataset.id); }
  });
}
function renderMore() {
  const slice = curList.slice(shown, shown + pageSize);
  $("#trailList").insertAdjacentHTML("beforeend", slice.map(trailCard).join(""));
  shown += slice.length;
  bindCards();
  if (_io) _io.disconnect();
  const old = $("#listSentinel"); if (old) old.remove();
  if (shown < curList.length) {                       // 無限捲動：哨兵進入視窗即續載
    $("#trailList").insertAdjacentHTML("beforeend", `<div id="listSentinel" style="height:1px"></div>`);
    ensureObserver().observe($("#listSentinel"));
  }
}


function showBrowseMap() {
  if (!browseMap) {
    browseMap = L.map("browseMap", { zoomControl: true }).setView([23.8, 121], 7);
    addBaseWithToggle(browseMap);
    addCompass(browseMap);       // 指北針只在主頁面地圖
    addFullscreen(browseMap);    // 全螢幕也只在主頁面地圖（正常排版，假全螢幕可正確覆蓋）
    // 圖釘叢集：縮放時聚合，全台上千點也順暢
    browseLayer = (typeof L.markerClusterGroup === "function")
      ? L.markerClusterGroup({ maxClusterRadius: 50, chunkedLoading: true })
      : L.layerGroup();
    browseMap.addLayer(browseLayer);
    // 難度色彩圖例
    const lg = L.control({ position: "bottomright" });
    lg.onAdd = () => {
      const d = L.DomUtil.create("div", "map-legend");
      const rows = [[1, "輕鬆"], [2, "一般"], [3, "進階"], [4, "挑戰"], [5, "困難"]]
        .map(([n, l]) => `<span><i style="background:${DIFF_COLOR[n]}"></i>${l}</span>`).join("");
      d.innerHTML = `<b>難度</b>${rows}<span><i style="background:${DIFF_COLOR[6]}"></i>雪季</span><span><i style="background:#b3322a"></i>封閉</span>`;
      return d;
    };
    lg.addTo(browseMap);
    // 左下：這個範圍有幾條＋「列出這些」→ 切回列表只看地圖範圍內
    const cc = L.control({ position: "bottomleft" });
    cc.onAdd = () => {
      const d = L.DomUtil.create("div", "map-count");
      d.innerHTML = `<span>${ttT("範圍內")} <b>0</b> ${ttT("條")}</span><button class="mc-go">${ttT("列出這些")}</button>`;
      L.DomEvent.disableClickPropagation(d);
      d.querySelector(".mc-go").addEventListener("click", () => {
        const b = browseMap.getBounds();
        setMapScope({ s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() });
        const lb = document.querySelector('.seg-btn[data-mode="list"]'); if (lb) lb.click();
        updateFilterDot();
      });
      return d;
    };
    cc.addTo(browseMap);
  }
  // 視野虛擬化：只建目前地圖範圍內的 marker；平移/縮放時再增減（省物件、上千點也順、且不再有 1500 上限漏步道）
  if (!browseMoveBound) {
    browseMap.on("moveend zoomend", () => { clearTimeout(browseMoveTimer); browseMoveTimer = setTimeout(renderBrowseMarkers, 90); });
    browseMoveBound = true;
  }
  // 換篩選：清掉不在新清單的舊 marker（其餘 renderBrowseMarkers 會 diff 處理）
  const ids = new Set(curList.map(t => t.id));
  for (const [id, mk] of browseMarkers) { if (!ids.has(id)) { browseLayer.removeLayer(mk); browseMarkers.delete(id); } }
  // 先框住整個篩選結果（用座標，不需建 marker），fitBounds 觸發的 moveend 會接著只渲染視野內的點
  const bounds = curList.filter(t => t.lat).map(t => [t.lat, t.lon]);
  // 沒怎麼篩選（全台幾千條）時框台灣本島＋澎湖：金門馬祖也算進去的話會連福建沿海一起框，台灣只剩一小角。
  // 金馬的點照樣在地圖上，只是不影響初始鏡頭；篩選後（如選金門縣）才依結果框。
  const TW_MAIN = [[21.85, 119.3], [25.35, 122.05]];
  setTimeout(() => { browseMap.invalidateSize(); if (bounds.length > 300) browseMap.fitBounds(TW_MAIN, { padding: [10, 10] }); else if (bounds.length) browseMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 }); renderBrowseMarkers(); }, 80);
}
function _browseMarker(t) {
  const closed = isClosed(t);
  const col = closed ? "#b3322a" : (DIFF_COLOR[t.difficulty] || "#888");
  const mk = L.marker([t.lat, t.lon], { icon: pinIcon(col, closed ? "!" : (t.difficulty ?? "")) });
  mk.bindPopup(() => mapPopupHtml(t, col, closed), { className: "trail-pop", minWidth: 210, maxWidth: 250, autoPanPaddingTopLeft: [16, 70], autoPanPaddingBottomRight: [60, 20] });   // 避開右上角指北針/全螢幕鈕
  mk.on("popupopen", e => { const a = e.popup.getElement().querySelector(".popup-go"); if (a) a.addEventListener("click", ev => { ev.preventDefault(); openDetail(t.id); }); });
  return mk;
}
function mapPopupHtml(t, col, closed) {
  const bits = [];
  if (t.length_km != null) bits.push(`${t.length_km} km`);
  if (ascVal(t) != null) bits.push(`↑${ascVal(t)} m`);
  bits.push(t.tour ? escHtml(t.tour) : fmtHours(estHours(t)));
  return `<div class="mp">
    <div class="mp-h"><span class="mp-lv" style="background:${col}">${t.difficulty ?? ""}</span><b>${escHtml(t.name)}</b></div>
    <div class="mp-loc">${escHtml(t.position || t.region || "")}</div>
    <div class="mp-stats">${bits.filter(Boolean).join("・")}</div>
    ${closed ? `<div class="mp-warn">${ic("alert")} ${escHtml(t.condition.status)}</div>` : ""}
    <a href="#" class="popup-go mp-go">${ttT("看這條步道")} ${ic("chevron")}</a></div>`;
}
// 地圖範圍篩選：地圖上看到哪裡，就只列哪裡的步道（列表上方會有一顆可取消的標籤）
let mapScope = null;
function setMapScope(b) {
  mapScope = b;
  const el = $("#mapScope"); if (!el) return;
  el.hidden = !b;
  el.innerHTML = b ? `<span>${ic("map")} ${ttT("只看地圖範圍內")}</span><button class="ms-x" aria-label="${ttT("取消")}">${ic("x")}</button>` : "";
  const x = el.querySelector(".ms-x"); if (x) x.addEventListener("click", () => { setMapScope(null); updateFilterDot(); render(); });
}
function updateMapCount() {
  const c = document.querySelector("#browseMap .map-count"); if (!c || !browseMap) return;
  const b = browseMap.getBounds(); let n = 0;
  for (const t of curList) if (t.lat && b.contains([t.lat, t.lon])) n++;
  c.querySelector("b").textContent = n.toLocaleString("en-US");
}
function renderBrowseMarkers() {
  updateMapCount();
  if (!browseMap || !browseLayer) return;
  const b = browseMap.getBounds().pad(0.35);   // 視野外擴 35%，平移時邊緣不會空
  const visible = new Set();
  let n = 0;
  for (const t of curList) {
    if (!t.lat || !b.contains([t.lat, t.lon])) continue;
    visible.add(t.id);
    if (!browseMarkers.has(t.id)) { const mk = _browseMarker(t); browseMarkers.set(t.id, mk); browseLayer.addLayer(mk); }
    if (++n >= 2500) break;   // 保險上限（>全部步道數，全覽時不漏；縮放進去時視野自然culling到數百）
  }
  for (const [id, mk] of browseMarkers) { if (!visible.has(id)) { browseLayer.removeLayer(mk); browseMarkers.delete(id); } }
}

// 附近半徑篩選（依距離排序開啟後出現）
$("#nearRow").querySelectorAll("[data-radius]").forEach(b => b.addEventListener("click", () => {
  nearRadius = +b.dataset.radius;
  $("#nearRow").querySelectorAll("[data-radius]").forEach(x => x.classList.toggle("active", x === b));
  render();
}));


// ---------- 開機 ----------
buildFsRegion();
buildCollections();
buildPresets();
render();
