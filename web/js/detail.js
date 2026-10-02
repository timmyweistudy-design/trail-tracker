// 步道詳情頁（從 app.js 拆出，2026-10）：詳情面板、各分頁區塊（天氣、山頂天氣、海拔、生態、周邊…）、步道比較、分級說明。
// 一般 script，和 app.js 共用全域；載入順序在 map-ui.js 之後。
// ---------- 詳情面板 ----------
let _detailTrail = null, _detailBack = null;
// 生態：小黑蚊/蚊蟲警示 + 這個海拔帶常見動植物（離線）+ 選配的 iNaturalist 真實目擊。
// 每段可翻文字都獨立成一個文字節點——複合節點字典查不到會漏翻。
function ecologyHtml(t) {
  if (typeof Ecology === "undefined") return "";
  const r = Ecology.speciesFor(t);
  const alt = t.alt_low != null ? t.alt_low : t.alt_high;   // 小黑蚊在低海拔 → 用步道最低點最保守
  const env = (t.name || "") + (t.position || "") + tagsOf(t).join("");
  const risk = Ecology.biteRisk(alt, t.region, new Date(), env);
  const LV = { high: ["風險高", "eco-hi"], mid: ["風險中", "eco-mid"], low: ["風險低", "eco-lo"], none: ["幾乎無", "eco-no"] };
  const [lvTxt, lvCls] = LV[risk.level] || LV.none;
  const CATN = { mammal: ["paw", "哺乳類"], bird: ["bird", "鳥類"], insect: ["bug", "昆蟲"], herp: ["frog", "兩棲爬蟲"] };
  const SHOW = 6;   // 每類先列 6 個，其餘收起來（以前 30 多顆一次攤開）
  const cats = Ecology.CATS.map(k => {
    const arr = r.species[k] || []; if (!arr.length) return "";
    const [icon, nm] = CATN[k];
    const chip = sp => `<span class="eco-sp${Ecology.isPoison(sp) ? " eco-poison" : ""}">${Ecology.isPoison(sp) ? ic("alert") : ""}${escHtml(sp)}</span>`;
    const more = arr.length > SHOW ? `<button class="eco-more" type="button">+${arr.length - SHOW}</button><span class="eco-rest" hidden>${arr.slice(SHOW).map(chip).join("")}</span>` : "";
    return `<div class="eco-cat"><span class="eco-cat-h">${ic(icon)}<span>${nm}</span></span><span class="eco-chips">${arr.slice(0, SHOW).map(chip).join("")}${more}</span></div>`;
  }).join("");
  return `
    <div id="ecoBox" class="eco-box">
      <div class="eco-bite ${lvCls}">
        <div class="eco-bite-h">${ic("bug")}<span>小黑蚊・蚊蟲</span><span class="eco-lv">${lvTxt}</span></div>
        <ul class="eco-tips">${risk.tips.map(x => `<li>${x}</li>`).join("")}</ul>
      </div>
      <div class="eco-src">這個海拔常碰到的傢伙（不是這條步道的實際紀錄）</div>
      ${cats}
      <button class="btn ghost eco-nearby-btn" id="ecoNearbyBtn">${ic("search")}<span>看這附近的真實目擊</span></button>
      <div id="ecoNearbyBox" class="eco-nearby" hidden></div>
    </div>`;
}
function bindEcology(t) {
  document.querySelectorAll("#detailBody .eco-more").forEach(b => b.addEventListener("click", () => { const r = b.nextElementSibling; if (r) r.hidden = false; b.remove(); }));
  const enb = $("#ecoNearbyBtn");
  if (enb) enb.addEventListener("click", async () => {
    const box = $("#ecoNearbyBox"); if (!box) return;
    if (enb.dataset.done) { box.hidden = !box.hidden; return; }
    box.hidden = false;
    if (!navigator.onLine) { box.innerHTML = `<div class="eco-src">${ttT("需要網路才能看真實目擊")}</div>`; return; }
    enb.disabled = true;
    box.innerHTML = `<div class="food-loading"><span class="spin"></span>${ttT("查詢附近目擊中…")}</div>`;
    const obs = (typeof Ecology !== "undefined") ? await Ecology.nearbyObservations(t.lat, t.lon) : null;
    enb.disabled = false;
    if (!obs) { box.innerHTML = `<div class="eco-src">${ttT("這附近暫時沒有可顯示的目擊記錄")}</div>`; return; }
    enb.dataset.done = "1";
    box.innerHTML = `<div class="eco-src">${ttT("iNaturalist 附近 5 公里的真實觀察")}</div><div class="eco-obs">`
      + obs.map(o => `<div class="eco-ob">${o.thumb ? `<img src="${escHtml(o.thumb)}" loading="lazy" alt="">` : `<span class="eco-ob-noimg">${ic("search")}</span>`}<span>${escHtml(o.name)}</span></div>`).join("")
      + `</div>`;
  });
}
function currentDetailTrail() { return $("#detailSheet").classList.contains("show") ? _detailTrail : null; }

// 分享連結：只有真的是網站才給網址（iOS App 裡 location 是 capacitor://localhost，別人打不開）
function ttShareLink(query) {
  try {
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return null;
    return location.origin + location.pathname + (query || "");
  } catch (e) { return null; }
}

// ── 詳情頁各區塊 ──
function detailHeroHtml(t) {
  const fav = Store.isFav(t.id);
  return `<div class="detail-hero noimg" id="heroWrap">
      <div class="hero-cap">
        <h2>${escHtml(t.name)}</h2>
        <div class="badges">
          ${diffBadgeHtml(t)}
          ${t.family_friendly ? `<span class="badge family">${ttT("親子友善")}</span>` : ""}
          ${t.region ? `<span class="badge ghost">${escHtml(t.region)}</span>` : ""}
        </div>
      </div>
      <button class="hero-fav${fav ? " on" : ""}" id="favDetail" aria-pressed="${fav}" aria-label="${ttT("收藏")}">${STAR_SVG}</button>
    </div>`;
}
// 重點數字：固定 4 格（長度／爬升／時間／海拔或陡度），難度和縣市已在上方，不再重複
function detailStatsHtml(t) {
  const ascCached = (typeof Profile !== "undefined" && Profile.cachedGain) ? Profile.cachedGain(t.id) : null;
  const asc = ascCached != null ? ascCached : (t.ascent != null ? Math.round(t.ascent) : null);
  const ascEst = t.source !== "forestry" && ascCached == null;   // OSM 沿線推估、還沒用地形算過 → ≈
  const cells = [
    ["ruler", "長度", `${fmtKm(t.length_km)} km`],
    ["up", "累積爬升", `<span id="kvAscent">${asc != null ? `${ascEst ? `<span class="approx">≈</span>` : ""}${asc} m` : (geoOf(t) ? ttT("計算中…") : "—")}</span>`],
    ["clock", "所需時間", timeHtml(t) + myTimeHtml(t)],   // 走過幾趟之後，多一行「依你的腳程」
  ];
  if (t.alt_high != null && t.alt_low != null) cells.push(["mountain", "海拔範圍", `${t.alt_low}–${t.alt_high} m`]);
  else { const sl = slopeInfo(t); if (sl && sl.word) cells.push(["mountain", "坡度", `${ttT(sl.word)}<small> ${Math.round(sl.perKm)} m/km</small>`]); }
  return `<div class="statcard">${cells.map(([ico, l, v]) =>
    `<div class="stat"><div class="stat-h">${ic(ico)}<span>${ttT(l)}</span></div><div class="stat-v">${v}</div></div>`).join("")}</div>
    <div class="len-note" id="lenNote" hidden></div>`;
}
function detailMetaHtml(t) {
  const bits = [];
  if (t.pave) bits.push(escHtml(t.pave));
  if (t.best_season) bits.push(escHtml(t.best_season));
  if (t.transport?.car) bits.push(ttT("可開車"));
  if (t.transport?.m_bus || t.transport?.l_bus) bits.push(ttT("有公車"));
  return bits.length ? `<div class="det-meta"><div class="det-meta-l">${ttT("路面・季節・交通")}</div><div class="det-meta-v">${bits.map(b => `<span>${b}</span>`).join("・")}</div></div>` : "";
}
function detailGuideHtml(t) {
  if (!t.guide) return "";
  const g = String(t.guide).trim();
  // OSM 的「介紹」常只有一句「步道系統：地方級」→ 當成小註記，不當正文
  if (g.length < 40 && !/\n/.test(g)) return `<div class="det-meta det-meta-sm"><div class="det-meta-v">${escHtml(g)}</div></div>`;
  const tr = (typeof I18n !== "undefined" && I18n.lang() !== "zh")
    ? `<div class="pv-tr-row"><button class="link-btn" id="guideTranslate">${ic("translate")} ${ttT("翻譯年糕")}</button></div><div class="guide pv-cap-tr" id="guideTr" hidden></div>` : "";
  return `<div class="guide">${escHtml(g).replace(/\n/g, "<br>")}</div>${tr}`;
}
function detailOverviewHtml(t) {
  const nav = t.lat ? `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}` : "";
  const moreSearch = `https://www.google.com/search?q=${encodeURIComponent(t.name + " 步道")}`;
  // 標籤：「親子」上面已經有「親子友善」，不再重複
  const tags = tagsOf(t).filter(g => !(t.family_friendly && /親子/.test(g)));
  return `<div id="condLive">${conditionBanner(t)}</div>
    ${detailStatsHtml(t)}
    ${tags.length ? `<div class="tag-row">${tags.map(g => `<span class="tag">${escHtml(g)}</span>`).join("")}</div>` : ""}
    ${gradeExplain(t)}
    ${detailMetaHtml(t)}
    ${siblingHtml(t)}
    ${detailGuideHtml(t)}
    <div class="link-row flow det-acts">
      ${nav ? `<a class="link-btn" href="${nav}" target="_blank" rel="noopener">${ic("compass")} ${ttT("導航")}</a>` : ""}
      <a class="link-btn" href="${moreSearch}" target="_blank" rel="noopener">${ic("search")} ${ttT("查資訊")}</a>
      <button class="link-btn" id="btnShareTrail">${ic("share")} ${ttT("分享")}</button>
      <button class="link-btn social-only" id="btnEventTrail">${ic("calendar")} ${ttT("揪團")}</button>
      <button class="link-btn" id="btnDetMore">${ic("more")} ${ttT("更多")}</button>
    </div>
    <div id="activityBox" hidden></div>
    <div id="trailReportBox"></div>
    <div id="trailFeedBox"></div>`;
}
function detailRouteHtml(t) {
  const done = typeof offlineSets === "function" && offlineSets()["trail:" + t.id];
  return `<div class="section-title" id="secWx">${ic("sun")}${ttT("天氣（步道所在地）")}</div>
    <div id="weatherBox"><div class="food-loading"><span class="spin"></span>${ttT("查詢天氣中…")}</div></div>
    ${geoOf(t) ? `<div class="section-title" id="secElev">${ic("mountain")}${ttT("海拔剖面")}</div><div id="profileBox"><div class="food-loading"><span class="spin"></span>${ttT("計算海拔剖面中…")}</div></div>` : ""}
    ${wpListHtml(t)}
    <button class="btn ghost" id="btnOffline" style="margin-top:14px">${done ? `${ic("check")} ${ttT("已預載離線地圖")}<small>・${ttT("再按一次會補齊")}</small>` : `${ic("download")} ${ttT("預載此步道離線地圖")}`}</button>
    <div id="offlineBox" class="offline-box" hidden></div>`;
}
function detailNearbyHtml(t) {
  return `<div id="amenBox" class="amen-box"></div>
    <div class="section-title" id="secPoi">${ic("landmark")}${ttT("附近人文景點")}</div>
    <div id="poiBox">${skelCards(3)}</div>
    <div class="section-title" id="secFood">${ic("food")}${ttT("步道周邊美食")}</div>
    <div id="foodBox">${skelCards(3)}</div>
    ${nearbyStripHtml(t)}`;
}

// opts.from：從詳情頁裡的「同名路段／附近步道」跳過來 → 顯示「回到上一條」
async function openDetail(id, opts) {
  const t = TRAILS.find(x => x.id === id);
  if (!t) return;
  _detailBack = (opts && opts.from && _detailTrail && _detailTrail.id !== id) ? _detailTrail : null;
  _detailTrail = t;
  clearDetailObs();
  // 先開面板給回饋，再（首次）載入幾何
  $("#detailHero").innerHTML = "";
  $("#detailBody").innerHTML = `<div class="det-loading"><span class="spin"></span>${ttT("載入中…")}</div>`;
  $("#sheetMask").classList.add("show");
  $("#detailSheet").classList.add("show");
  $("#detailSheet").scrollTop = 0;
  $("#closeDetailBtn").focus({ preventScroll: true });
  await Promise.all([ensureGeo(t.region), ensureDetail()]);   // 幾何只載這條步道的縣市分片
  if (_detailTrail !== t) return;
  mergeDetail(t);                       // 併入 guide/entrances/交通等詳情欄位
  const credit = t.source === "forestry" ? ttT("資料來源：林業及自然保育署 開放資料") : ttT("資料來源：OpenStreetMap 貢獻者（社群步道，詳細資料有限）");
  $("#detailHero").innerHTML = detailHeroHtml(t);
  // 生態、周邊兩頁點到才建（以前一打開就把 4 頁 600 個元素全建好）
  $("#detailBody").innerHTML = `
    ${_detailBack ? `<button class="det-back" id="detBack">${ic("chevron")}<span>${ttT("回到")} ${escHtml(_detailBack.name)}</span></button>` : ""}
    <div class="detail-tabs" id="detailNav" role="tablist">
      <button data-tab="ov" class="on" role="tab">${ttT("概覽")}</button>
      <button data-tab="rt" role="tab">${ttT("路線")}</button>
      <button data-tab="ec" role="tab">${ttT("生態")}</button>
      <button data-tab="nb" role="tab">${ttT("周邊")}</button>
    </div>
    <div class="tabwrap">
      <section class="tabpane" data-pane="ov" role="tabpanel">${detailOverviewHtml(t)}</section>
      <section class="tabpane" data-pane="rt" role="tabpanel" hidden>${detailRouteHtml(t)}</section>
      <section class="tabpane" data-pane="ec" role="tabpanel" hidden></section>
      <section class="tabpane" data-pane="nb" role="tabpanel" hidden></section>
    </div>
    <div class="detail-credit">${credit}</div>
    <div class="detail-actionbar">
      <button class="btn primary" id="btnGoRecord">${ic("pin")}${ttT("在此步道開始記錄")}</button>
    </div>`;
  bindDetail(t);
  loadPhoto(t);
  loadWeather(t);
  loadElevation(t);
  loadTrailFeed(t);
  loadTrailActivity(t);
  if (typeof TrailReports !== "undefined") TrailReports.load(t);   // 山友路況回報（7 天內）
  drawDetailMap(t);
  // 首次點開步道詳情 → 情境導覽（等面板滑入穩定再跳；已關閉就不跳）
  if (typeof window.ttCoachTrail === "function") setTimeout(() => window.ttCoachTrail(!!geoOf(t)), 550);
}

function bindDetail(t) {
  const body = $("#detailBody");
  const back = $("#detBack"); if (back) back.addEventListener("click", () => openDetail(back._id || _detailBack.id));
  if (back) back._id = _detailBack.id;
  body.querySelectorAll(".sib-chip").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.sib, { from: true })));
  // 翻譯年糕：路況公告、介紹文（非中文介面）
  const trBtn = (btnId, outId, getSrc) => {
    const btn = $(btnId); if (!btn) return;
    btn.addEventListener("click", async () => {
      const out = $(outId); if (!out) return;
      if (!out.hidden) { out.hidden = true; btn.innerHTML = `${ic("translate")} ${ttT("翻譯年糕")}`; return; }
      if (out.dataset.done) { out.hidden = false; btn.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`; return; }
      btn.disabled = true; btn.textContent = ttT("翻譯中…");
      const src = getSrc();
      const tr = (typeof ttTranslate === "function" && src) ? await ttTranslate(src, ttTrTarget()) : null;
      btn.disabled = false;
      if (!tr) { btn.textContent = ttT("翻譯失敗，點此重試"); return; }
      out.textContent = tr; out.dataset.done = "1"; out.hidden = false;
      btn.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`;
    });
  };
  trBtn("#condTranslate", "#condTr", () => (t.condition && [t.condition.title, t.condition.content].filter(Boolean).join("\n")) || "");
  trBtn("#guideTranslate", "#guideTr", () => t.guide || "");
  // 分頁：生態／周邊第一次點到才建內容
  const navBtns = $("#detailNav").querySelectorAll("button");
  const panes = body.querySelectorAll(".tabpane");
  const built = {};
  const build = tab => {
    if (built[tab]) return; built[tab] = true;
    const pane = body.querySelector(`.tabpane[data-pane="${tab}"]`);
    if (tab === "ec") { pane.innerHTML = ecologyHtml(t); bindEcology(t); }
    if (tab === "nb") {
      pane.innerHTML = detailNearbyHtml(t);
      pane.querySelectorAll(".nearby-card").forEach(el => el.addEventListener("click", () => { if (el.dataset.id) openDetail(el.dataset.id, { from: true }); }));
      // Places 查詢（設施/美食/景點）較耗額度 → 滑到該區塊才查
      whenVisible($("#amenBox"), () => loadAmenities(t));
      whenVisible($("#poiBox"), () => loadAttractions(t));
      whenVisible($("#foodBox"), () => loadFood(t));
    }
  };
  const showTab = tab => {
    build(tab);
    navBtns.forEach(b => { b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
    panes.forEach(p => { p.hidden = p.dataset.pane !== tab; });
    const sheet = $("#detailSheet"), navTop = $("#detailNav").offsetTop;
    if (sheet.scrollTop > navTop) sheet.scrollTop = navTop;   // 對齊頁籤，避免切到較短分頁時捲過頭露白
  };
  navBtns.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  // 區塊可收合（沿線地標）
  body.querySelectorAll(".section-title.collapsible").forEach(hd => hd.addEventListener("click", () => {
    const collapsed = hd.classList.toggle("collapsed");
    hd.setAttribute("aria-expanded", !collapsed);
    const box = hd.nextElementSibling; if (box) box.hidden = collapsed;
  }));
  // 沿線地標：點清單一列 → 地圖跳到該地標並開泡泡
  body.querySelectorAll(".wp-row").forEach(b => b.addEventListener("click", () => {
    const la = +b.dataset.wplat, lo = +b.dataset.wplon;
    if (detailMap) { detailMap.setView([la, lo], 16); const mp = $("#detailMap"); if (mp) mp.scrollIntoView({ block: "center", behavior: "smooth" }); }
    detailWpLayer && detailWpLayer.eachLayer(m => { try { const ll = m.getLatLng(); if (Math.abs(ll.lat - la) < 1e-5 && Math.abs(ll.lng - lo) < 1e-5) setTimeout(() => m.openPopup(), 350); } catch (e) { /* */ } });
  }));
  $("#btnGoRecord").addEventListener("click", () => {
    closeDetail();
    document.querySelector('.tab[data-view="record"]').click();   // 會先清空 selectedTrailGeo
    selectTrailForRecord(t);                 // 路線疊圖、偏離判斷、沿線地標、行前小卡、可取消的選定列
  });
  const lnk = $("#lnkGradeAll");
  if (lnk) lnk.addEventListener("click", e => { e.preventDefault(); openGradeInfo(t.difficulty); });
  const offBtn = $("#btnOffline");
  if (offBtn) offBtn.addEventListener("click", () => downloadOffline(t, offBtn));
  const favD = $("#favDetail");
  if (favD) favD.addEventListener("click", () => {
    if (!Store.isFav(t.id) && !favAddAllowed()) return;
    const added = Store.toggleFav(t.id);
    favD.classList.toggle("on", added); favD.setAttribute("aria-pressed", added);
    if (added) { favD.classList.remove("pop"); void favD.offsetWidth; favD.classList.add("pop"); }
    toast(ttT(added ? "已加入收藏" : "已移除收藏"));
    const star = document.querySelector(`#trailList .fav-star[data-fav="${CSS.escape(t.id)}"]`);   // 列表上的星星同步
    if (star) { star.classList.toggle("on", added); star.setAttribute("aria-pressed", added); }
  });
  const shareT = $("#btnShareTrail");
  if (shareT) shareT.addEventListener("click", () => {
    const url = ttShareLink(`?trail=${encodeURIComponent(t.id)}`);
    const text = `${t.name}（${diffLabel(t)}${t.length_km ? " · " + fmtKm(t.length_km) + " km" : ""}）— 循徑拾光`;
    if (navigator.share) navigator.share(url ? { title: t.name, text, url } : { title: t.name, text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url ? text + "\n" + url : text).then(() => toast(ttT("複製好了")));
  });
  const evT = $("#btnEventTrail");
  if (evT) evT.addEventListener("click", () => { if (typeof Events !== "undefined") Events.open(t); else toast(ttT("社群尚未啟用")); });
  // 「更多」：加入比較、林業署原始頁（不常用，收起來）
  const more = $("#btnDetMore");
  if (more) more.addEventListener("click", async () => {
    const inSet = compareSet.has(t.id);
    const opts = [{ label: ttT(inSet ? "移出比較" : "加入比較"), value: "cmp", cls: "ghost" }];
    if (t.url) opts.push({ label: ttT("看官方原始頁"), value: "src", cls: "ghost" });
    opts.push({ label: ttT("取消"), value: null, cls: "primary" });
    const act = await ttChoice(escHtml(t.name), opts);
    if (act === "src") window.open(t.url, "_blank", "noopener");
    if (act === "cmp") {
      if (compareSet.has(t.id)) compareSet.delete(t.id);
      else { if (compareSet.size >= 3) { toast(ttT("最多比較 3 條")); return; } compareSet.add(t.id); }
      toast(ttT(compareSet.has(t.id) ? "已加入比較" : "已移出比較"));
      updateCompareBar();
    }
  });
}

function drawDetailMap(t) {
  setTimeout(() => {
    if (_detailTrail !== t) return;
    if (!detailMap) {
      detailMap = L.map("detailMap", { zoomControl: false });
      addBaseWithToggle(detailMap);
      addThreeD(detailMap, () => open3D(currentDetailTrail()));   // 「3D」鈕：開 MapLibre 3D 地形
      addFullscreen(detailMap);   // 全螢幕鈕（假全螢幕搬到 body，詳情 sheet 內也能正確覆蓋）
      detailOverlay = L.layerGroup().addTo(detailMap);
      detailPoiLayer = L.layerGroup().addTo(detailMap);
      detailWpLayer = L.layerGroup().addTo(detailMap);
    }
    detailOverlay.clearLayers();
    detailPoiLayer.clearLayers();
    drawWaypoints(detailWpLayer, t.waypoints);   // 沿線地標
    const geom = geoOf(t);
    if (geom && geom.length) {
      const lines = geom.map(seg => L.polyline(seg, { color: "#d2542e", weight: 4, opacity: .9 }));
      lines.forEach(l => l.addTo(detailOverlay));
      // 起點/終點標示（用最長段的端點；判斷環狀）
      const main = geom.reduce((a, b) => (b.length > a.length ? b : a), geom[0]);
      const start = main[0], end = main[main.length - 1];
      const loop = haversine({ lat: start[0], lon: start[1] }, { lat: end[0], lon: end[1] }) < 120;
      L.circleMarker(start, { radius: 7, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 })
        .addTo(detailOverlay).bindPopup(ttT(loop ? "起／終點（環狀）" : "起點"));
      if (!loop) L.circleMarker(end, { radius: 7, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 })
        .addTo(detailOverlay).bindPopup(ttT("終點"));
      detailMap.fitBounds(L.featureGroup(lines).getBounds(), { padding: [20, 20] });
    } else if (t.lat) {
      detailMap.setView([t.lat, t.lon], 14);
      (t.entrances || []).forEach(e => L.marker([e.lat, e.lon]).addTo(detailOverlay).bindPopup(escHtml(e.memo || ttT("步道入口"))));
    } else {
      detailMap.setView([23.7, 121], 7);
    }
    detailMap.invalidateSize();
  }, 120);
}

async function loadAmenities(t) {
  const box = $("#amenBox");
  if (!box) return;
  try {
    const items = await Amenities.nearby(t);
    if (_detailTrail !== t) return;                    // 使用者已切到別條步道 → 這批資料不是他要看的
    if (!items || !items.length) { box.hidden = true; return; }
    // 舊快取的分類名帶 emoji（🅿️ 停車）→ 拿掉，改用 SVG 圖示
    const AIC = { "停車": "parking", "廁所": "toilet", "超商": "store" };
    box.innerHTML = `<div class="amen-row">` + items.map(a => {
      const lb = String(a.label || "").replace(/^\S+\s+/, "");
      return `<span class="amen">${ic(AIC[lb] || "pin")}<b>${ttT(lb)}</b> ${(a.dist / 1000).toFixed(1)} km</span>`;
    }).join("") + `</div>`;
  } catch { box.hidden = true; }
}

async function loadPhoto(t) {
  const hero = $("#heroWrap");
  if (!hero) return;
  try {
    const items = await Photos.forTrailMulti(t, 5);     // [{url, credit}]，credit = 作者 · 授權（Wikimedia CC 合規）
    if (_detailTrail !== t) return;                     // 已切換步道 → 別把舊步道的照片貼到新面板
    if (!items || !items.length) return;                // 無照片：保留漸層等高線底
    const urls = items.map(it => it.url);
    hero.classList.remove("noimg");
    const car = document.createElement("div");
    car.className = "hero-carousel";
    car.innerHTML = items.map(it => `<img alt="${escHtml(t.name)}" src="${escHtml(it.url)}" loading="lazy" decoding="async">`).join("")
      + (items.length > 1 ? `<div class="hero-dots">${items.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div>` : "");
    hero.insertBefore(car, hero.firstChild);
    // CC 授權要求標作者＋授權：隨輪播顯示當張照片的 credit
    const creditEl = document.createElement("div");
    creditEl.className = "hero-credit";
    const setCredit = i => { creditEl.textContent = `© ${items[i].credit}`; };   // 下方的點點已經告訴人可以滑，不必再寫
    setCredit(0);
    hero.insertBefore(creditEl, hero.firstChild);
    car.querySelectorAll("img").forEach((im, idx) => {
      if (im.complete && im.naturalWidth) im.classList.add("loaded");
      else { im.addEventListener("load", () => im.classList.add("loaded")); im.addEventListener("error", () => im.classList.add("loaded")); }
      im.addEventListener("click", () => openLightbox(urls, idx));   // 點圖放大
    });
    if (items.length > 1) {
      const dots = car.querySelector(".hero-dots");
      car.addEventListener("scroll", () => {
        const i = Math.max(0, Math.min(items.length - 1, Math.round(car.scrollLeft / car.clientWidth)));
        dots.querySelectorAll("span").forEach((s, k) => s.classList.toggle("on", k === i));
        setCredit(i);
      }, { passive: true });
    }
  } catch { /* 無照片就維持漸層底 */ }
}

// 照片燈箱：全螢幕放大、可左右滑
function openLightbox(urls, start) {
  if (document.querySelector('[data-ov="lightbox"]')) return;   // 防連點疊層
  const ov = document.createElement("div");
  ov.className = "lightbox"; ov.dataset.ov = "lightbox";
  ov.innerHTML = `<button class="lb-close" aria-label="關閉">✕</button>
    <div class="lb-track">${urls.map(u => `<div class="lb-slide"><img loading="lazy" decoding="async" src="${u}" alt=""></div>`).join("")}</div>`;
  document.body.appendChild(ov);
  const track = ov.querySelector(".lb-track");
  track.scrollLeft = (start || 0) * track.clientWidth;
  const close = () => ov.remove();
  ov.querySelector(".lb-close").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov || e.target.classList.contains("lb-slide")) close(); });
  const esc = e => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } };
  document.addEventListener("keydown", esc);
}

async function loadElevation(t) {
  const box = $("#profileBox");
  if (!box) return;
  try {
    const p = await Profile.build(t.id, geoOf(t));
    if (_detailTrail !== t) return;                    // 已切換步道
    if (!p) { box.hidden = true; return; }
    // 地圖畫出來的路線和官方記載的長度差很多 → 說清楚為什麼兩個數字不一樣
    if (t.length_km && p.distKm && Math.abs(p.distKm - t.length_km) / t.length_km > 0.25) {
      const ln = $("#lenNote");
      if (ln) { ln.hidden = false; ln.innerHTML = `${ic("info")}<span>${ttT("地圖上的路線約")} ${fmtKm(p.distKm)} km，${ttT("和記載的")} ${fmtKm(t.length_km)} km ${ttT("不一樣：記載的常只算主線，地圖可能含支線或來回。")}</span>`; }
    }
    if (p.gain != null) {
      const kvA = $("#kvAscent"); if (kvA) kvA.textContent = p.gain + " m";   // 詳情頁即時覆蓋（用地形算的，比資料準）
      // 同步更新探索列表中該步道卡的累積爬升（不必重開 App）
      const sel = (window.CSS && CSS.escape) ? CSS.escape(t.id) : t.id;
      document.querySelectorAll(`#trailList .card[data-id="${sel}"] [data-card-asc]`).forEach(el => { el.textContent = "↑" + p.gain; });
    }
    box.innerHTML = `<div class="profile-wrap" id="profWrap">${p.svg}
        <div class="prof-cursor" id="profCursor"></div><div class="prof-tip" id="profTip"></div></div>
      <div class="profile-stat"><span>${ttT("最低")}<b>${p.min} m</b></span><span>${ttT("最高")}<b>${p.max} m</b></span><span>${ttT("累積爬升")}<b>↑${p.gain} m</b></span><span>${ttT("路線長")}<b>${fmtKm(p.distKm)} km</b></span></div>
      <div class="profile-legend"><span><i style="background:#4a8f55"></i>${ttT("緩")}</span><span><i style="background:#c39327"></i>${ttT("中")}</span><span><i style="background:#c0542f"></i>${ttT("陡")}</span><span class="pl-hint">${ttT("滑過看各點海拔")}</span></div>`;
    // 滑過/觸控顯示該點距離與海拔
    const wrap = $("#profWrap"), cur = $("#profCursor"), tip = $("#profTip");
    const move = clientX => {
      const r = wrap.getBoundingClientRect();
      const svgX = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * p.W;
      let best = p.samples[0];
      for (const s of p.samples) if (Math.abs(s.x - svgX) < Math.abs(best.x - svgX)) best = s;
      const pct = best.x / p.W * 100;
      cur.style.left = pct + "%"; cur.style.display = "block";
      tip.style.left = pct + "%"; tip.style.display = "block";
      tip.textContent = `${best.d.toFixed(2)} km · ${best.e} m`;
    };
    wrap.addEventListener("pointermove", e => move(e.clientX));
    wrap.addEventListener("pointerdown", e => move(e.clientX));
    wrap.addEventListener("pointerleave", () => { cur.style.display = "none"; tip.style.display = "none"; });
  } catch {
    box.innerHTML = `<div class="food-empty">${ttT("海拔剖面算不出來，要有網路")}</div>`;
  }
}

async function loadWeather(t) {
  const box = $("#weatherBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">${ttT("這條步道沒有座標，查不了天氣")}</div>`; return; }
  try {
    const d = await Weather.get(t.lat, t.lon);
    if (_detailTrail !== t) return;                    // 已切換步道 → 不要把舊步道的天氣寫進新面板
    const c = d.current, dd = d.daily;
    const [, txt] = Weather.desc(c.weather_code);
    const wd = i => i === 0 ? ttT("今天") : new Date(dd.time[i] + "T12:00").toLocaleDateString(ttLocale(), { weekday: "short" });
    // 最適出發日：降雨機率低 + 體感舒適(均溫近 22°C)
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < dd.time.length; i++) {
      const pp = dd.precipitation_probability_max[i] ?? 50;
      const avg = (dd.temperature_2m_max[i] + dd.temperature_2m_min[i]) / 2;
      // 舒適帶 16–26°C 不罰；過冷過熱加倍罰；降雨為主、≥70% 額外重罰
      const tempPen = avg < 16 ? (16 - avg) * 2 : avg > 26 ? (avg - 26) * 2 : 0;
      const score = pp * 1.3 + tempPen + (pp >= 70 ? 25 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    // 溫度曲線(最高溫)
    const tmax = dd.temperature_2m_max, lo = Math.min(...tmax), hi = Math.max(...tmax), span = (hi - lo) || 1;
    const W = 280, H = 44, pad = 6, n = tmax.length;
    const xy = tmax.map((v, i) => [pad + (W - 2 * pad) * i / (n - 1), pad + (H - 2 * pad) * (1 - (v - lo) / span)]);
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(" ");
    const dots = xy.map((p, i) => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${i === best ? 4 : 2.5}" fill="${i === best ? "#e8893b" : "var(--brand-mid)"}"/>`).join("");
    const allWet = dd.precipitation_probability_max.every(v => (v ?? 0) >= 60);   // 整週都很可能下雨 → 不硬挑「最適合」的一天
    const fc = dd.time.map((t2, i) => `<div class="wx-day${i === best && !allWet ? " best" : ""}"><div class="wx-d">${wd(i)}</div><div class="wx-e">${wxIcon(dd.weather_code[i])}</div>
        <div class="wx-t">${Math.round(dd.temperature_2m_min[i])}°/${Math.round(dd.temperature_2m_max[i])}°</div>
        <div class="wx-p">${ic("drop")}${dd.precipitation_probability_max[i] ?? "—"}%</div></div>`).join("");
    box.innerHTML = `<div class="wx-now">
        <span class="wx-now-e">${wxIcon(c.weather_code)}</span>
        <span class="wx-now-t">${Math.round(c.temperature_2m)}°C</span>
        <span class="wx-now-d"><span>${ttT(txt)}</span><span>${ttT("濕度")} ${c.relative_humidity_2m}%</span><span>${ttT("風")} ${Math.round(c.wind_speed_10m)} km/h</span></span>
      </div>
      ${allWet ? `<div class="wx-best wet">${ic("rain")}<span>${ttT("這週每天降雨機率都在 6 成以上，沒有特別適合的一天")}</span></div>`
        : `<div class="wx-best">${ic("calendar")}<span>${ttT("最適合出發")}：<b>${wd(best)}</b>（${ttT("降雨")} ${dd.precipitation_probability_max[best] ?? "—"}%・${Math.round(dd.temperature_2m_min[best])}–${Math.round(dd.temperature_2m_max[best])}°）</span></div>`}
      <svg class="wx-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line}" fill="none" stroke="var(--brand-mid)" stroke-width="2"/>${dots}</svg>
      <div class="wx-fc">${fc}</div>
      <div class="food-credit">${ttT("天氣資料：Open-Meteo · 7 日預報")}</div>
      <div id="summitWx"></div>`;
    loadSummitWeather(t);
  } catch {
    box.innerHTML = `<div class="food-empty">${ttT("天氣查不到，要有網路")}</div>`;
  }
}
// 山頂天氣：登山口天氣跟山頂可以差到 10 度。有海拔資料、而且山頂夠高（1,000 m 以上，或比登山口高 300 m 以上）才顯示。
// 分成清晨／中午／午後三段看接下來兩天半，並挑出要注意的：午後雷雨、體感很冷、稜線強風。
async function loadSummitWeather(t) {
  const box = $("#summitWx"); if (!box) return;
  const hi = t.alt_high, lo = t.alt_low;
  if (!hi || !(hi >= 1000 || (lo != null && hi - lo >= 300))) { box.innerHTML = ""; return; }
  try {
    const d = await Weather.summit(t.lat, t.lon, hi);
    if (_detailTrail !== t || !$("#summitWx")) return;
    const h = d.hourly, now = Date.now();
    const SEG = [["清晨", 5, 8], ["中午", 11, 13], ["午後", 14, 17]];
    const rows = [];
    for (let day = 0; day < 3 && rows.length < 5; day++) {
      for (const [lbl, a, b] of SEG) {
        const idx = h.time.map((x, i) => [x, i]).filter(([x]) => { const dt = new Date(x); const dd = Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 864e5); return dd === day && dt.getHours() >= a && dt.getHours() <= b && dt.getTime() + 3600e3 > now; }).map(([, i]) => i);
        if (!idx.length || rows.length >= 5) continue;
        const pick = k => idx.map(i => h[k][i]).filter(v => v != null);
        const temp = Math.round(Math.min(...pick("temperature_2m"))), feel = Math.round(Math.min(...pick("apparent_temperature")));
        const pop = Math.max(...pick("precipitation_probability")), gust = Math.round(Math.max(...pick("wind_gusts_10m")));
        const code = Math.max(...pick("weather_code"));
        rows.push({ day, lbl, temp, feel, pop, gust, code });
      }
    }
    if (!rows.length) { box.innerHTML = ""; return; }
    const dayName = n => n === 0 ? ttT("今天") : n === 1 ? ttT("明天") : ttT("後天");
    const warn = [];
    if (rows.some(r => r.code >= 95 && r.lbl !== "清晨")) warn.push(ttT("午後可能有雷雨，早出早歸"));
    const minFeel = Math.min(...rows.map(r => r.feel)); if (minFeel <= 5) warn.push(`${ttT("山頂體感最低")} ${minFeel}°C${ttSp()}${ttT("要帶保暖衣物")}`);
    const maxGust = Math.max(...rows.map(r => r.gust)); if (maxGust >= 45) warn.push(`${ttT("稜線陣風可達")} ${maxGust} km/h`);
    box.innerHTML = `<div class="smt">
      <div class="smt-h">${ic("mountain")}<span>${ttT("山頂天氣")}</span><small>${ttT("海拔")} ${hi.toLocaleString()} m</small></div>
      ${warn.length ? `<div class="smt-warn">${warn.map(w => `<div>${ic("alert")}<span>${w}</span></div>`).join("")}</div>` : ""}
      <div class="smt-rows">${rows.map(r => `<div class="smt-row"><span class="smt-when"><b>${dayName(r.day)}</b><span>${ttT(r.lbl)}</span></span><span class="smt-ic">${wxIcon(r.code)}</span>
        <span class="smt-t"><b>${r.temp}°</b><small>${ttT("體感")} ${r.feel}°</small></span><span class="smt-p">${ic("drop")}${r.pop}%</span><span class="smt-g">${ic("wind")}${r.gust}</span></div>`).join("")}</div>
      <div class="food-credit">${ttT("依山頂海拔修正的預報，僅供參考")}</div></div>`;
  } catch (e) { box.innerHTML = ""; }
}

// Google 回的分類名（中文）：中文介面照用；其他語言查字典，查不到就用通稱，不讓中文混在外文介面裡
function placeKind(kind, generic) {
  const k = String(kind || generic);
  if (typeof I18n === "undefined" || I18n.lang() === "zh") return escHtml(k);
  const tr = I18n.tx(k);
  return escHtml(tr || ttT(generic));
}
// 天氣代碼 → SVG 圖示（以前是 emoji，部分裝置顯示成方框）
function wxIcon(code) {
  const c = +code;
  const name = c === 0 ? "sun" : c <= 2 ? "cloudsun" : c === 3 ? "cloud" : c <= 48 ? "fog" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "snow" : c >= 95 ? "storm" : "rain";
  return ic(name, "wx-ic wx-" + name);
}
let _foodItems = [], _foodSort = "distance", _foodAll = false;
async function loadFood(t) {
  const box = $("#foodBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊美食</div>`; return; }
  box.innerHTML = `<div class="food-loading">尋找附近美食中…</div>`;
  try {
    const items = await Food.nearby(t);
    if (_detailTrail !== t) return;                    // 已切換步道 → 舊步道的美食不可以蓋到新面板
    _foodItems = items; _foodAll = false;
    plotPoi(_foodItems, "#c2683d", "food");
    renderFood();
  } catch (err) {
    box.innerHTML = `<div class="food-empty">美食查詢失敗，請稍後再試（需網路）</div>`;
  }
}
function foodStars(f) {
  if (!f.rating) return `<span class="food-rating none">尚無評分</span>`;
  return `<span class="food-rating">★ ${f.rating.toFixed(1)}<small> (${f.reviews.toLocaleString()})</small></span>`;
}
function renderFood() {
  const box = $("#foodBox");
  if (!box) return;
  if (!_foodItems.length) { box.innerHTML = `<div class="food-empty">附近 8 公里內查無餐飲（山區步道常見）</div>`; return; }
  const all = Food.sortItems(_foodItems, _foodSort);
  const items = _foodAll ? all : all.slice(0, 5);   // 先給 5 筆，周邊頁才不會長到滑不完
  box.innerHTML = `
    <div class="food-sort">排序
      <button class="food-sort-btn${_foodSort === "distance" ? " on" : ""}" data-fsort="distance">${ic("pin")}距離</button>
      <button class="food-sort-btn${_foodSort === "rating" ? " on" : ""}" data-fsort="rating">${ic("star")}星級</button>
    </div>
    <div class="food-list">${items.map(f => `
      <a class="food-item" href="${f.uri || "#"}" target="_blank" rel="noopener">
        <span class="food-kind">${placeKind(f.kind, "餐飲")}</span>
        <span class="food-name">${escHtml(f.name)}</span>
        ${foodStars(f)}
        <span class="food-dist">${(f.dist / 1000).toFixed(1)} km</span>
      </a>`).join("")}</div>
    ${all.length > items.length ? `<button class="more-btn" id="foodMore">${ttT("再看更多")}（${all.length - items.length}）</button>` : ""}
    <div class="food-credit"><i class="lg-dot" style="background:#c2683d"></i>已標在上方地圖・星級來自 Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _foodSort = b.dataset.fsort; renderFood(); }));
  const fm = box.querySelector("#foodMore"); if (fm) fm.addEventListener("click", () => { _foodAll = true; renderFood(); });
}

// 附近人文景點（歷史、廟宇、博物館、文化、觀光）
let _poiItems = [], _poiSort = "distance", _poiAll = false;
async function loadAttractions(t) {
  const box = $("#poiBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊景點</div>`; return; }
  try {
    const pois = await Attractions.nearby(t);
    if (_detailTrail !== t) return;                    // 已切換步道
    _poiItems = pois; _poiAll = false;
    plotPoi(_poiItems, "#3b6ea5", "poi");
    renderAttractions();
  } catch (err) {
    box.innerHTML = `<div class="food-empty">景點查詢失敗，請稍後再試（需網路）</div>`;
  }
}
function renderAttractions() {
  const box = $("#poiBox");
  if (!box) return;
  if (!_poiItems.length) { box.innerHTML = `<div class="food-empty">附近 12 公里內查無人文景點</div>`; return; }
  const all = Attractions.sortItems(_poiItems, _poiSort);
  const items = _poiAll ? all : all.slice(0, 5);
  box.innerHTML = `
    <div class="food-sort">排序
      <button class="food-sort-btn${_poiSort === "distance" ? " on" : ""}" data-psort="distance">${ic("pin")}距離</button>
      <button class="food-sort-btn${_poiSort === "rating" ? " on" : ""}" data-psort="rating">${ic("star")}評價</button>
    </div>
    <div class="poi-list">${items.map(p => `
      <a class="poi-item" href="${p.uri || "#"}" target="_blank" rel="noopener">
        <div class="poi-top">
          <span class="poi-kind">${placeKind(p.kind, "景點")}</span>
          <span class="poi-name">${escHtml(p.name)}</span>
          ${p.rating ? `<span class="poi-rating">★ ${p.rating.toFixed(1)}</span>` : ""}
        </div>
        ${p.summary ? `<div class="poi-sum">${escHtml(p.summary)}</div>` : ""}
        <div class="poi-dist">${(p.dist / 1000).toFixed(1)} km</div>
      </a>`).join("")}</div>
    ${all.length > items.length ? `<button class="more-btn" id="poiMore">${ttT("再看更多")}（${all.length - items.length}）</button>` : ""}
    <div class="food-credit"><i class="lg-dot" style="background:#3b6ea5"></i>已標在上方地圖・資料來自 Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _poiSort = b.dataset.psort; renderAttractions(); }));
  const pm = box.querySelector("#poiMore"); if (pm) pm.addEventListener("click", () => { _poiAll = true; renderAttractions(); });
}

// Premium：離線地圖免費 5 次，用完才需升級。回傳是否允許本次下載（允許則計入並提醒剩餘）。
// 非會員離線地圖：以容量（MB）計額度，一次大量下載也照實際大小扣，會員不限
const OFFLINE_FREE_MB = 10;
const TILE_EST_MB = 0.02;   // 估每張圖磚約 20 KB（顯示用；實際扣款以下載 bytes 為準）
function offlineMbUsed() { return +(localStorage.getItem("tt_offline_mb") || 0); }
function addOfflineMb(mb) { if (mb > 0) localStorage.setItem("tt_offline_mb", String(+(offlineMbUsed() + mb).toFixed(2))); }
function offlineAllow(tiles, silent) {
  if (typeof Premium !== "undefined" && Premium.isOn()) return true;   // 會員無限
  const need = (tiles ? tiles.length : 0) * TILE_EST_MB;
  const left = OFFLINE_FREE_MB - offlineMbUsed();
  if (need > left) {
    if (!silent) {
      toast(`免費離線地圖額度不足（剩 ${Math.max(0, left).toFixed(1)} MB，這次約需 ${need.toFixed(1)} MB），升級 Premium 無限下載`);
      if (typeof Premium !== "undefined") Premium.openUpgrade();
    }
    return false;
  }
  return true;
}

// Premium：免費收藏上限 20，會員無限。回傳是否可再加收藏。
const FAV_FREE = 20;
function favAddAllowed() {
  if (typeof Premium !== "undefined" && Premium.isOn()) return true;
  if (Store.getFavs().length >= FAV_FREE) {
    toast(`免費收藏上限 ${FAV_FREE} 條，升級 Premium 無限收藏`);
    if (typeof Premium !== "undefined") Premium.openUpgrade();
    return false;
  }
  return true;
}

// 預載此步道範圍的離線地圖圖磚
// 一鍵下載全台離線地圖（概覽，縮放 7–13；自動壓低 zmax 以控制張數）
async function downloadAllTaiwan() {
  const bbox = { n: 25.35, s: 21.85, e: 122.05, w: 119.95 };
  let zmax = 13;
  while (zmax > 9 && Offline.tileList(bbox, 7, zmax).length > 6000) zmax--;
  const tiles = Offline.tileList(bbox, 7, zmax);
  const btn = $("#btnAllOffline"), box = $("#allOfflineBox");
  // 確認文字講人話（以前寫「縮放 7–13」，而且整段沒翻譯）；按鈕文字分段翻譯、圖示不再被「下載中…」吃掉
  const mbTxt = (tiles.length * 0.02).toFixed(0);
  if (!(await ttConfirm(`${ttT("下載全台概覽地圖？")}\n${tiles.length} ${ttT("張圖磚")} · ≈ ${mbTxt} MB\n\n${ttT("離線也能看整個台灣的大範圍地圖；步道細節請到步道頁另外按「預載離線地圖」。下載要幾分鐘，請讓 App 開著。")}`, ttT("下載"), ttT("取消")))) return;
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.hidden = false; box.style.display = "block";
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${ic("globe")} ${ttT("下載中…")}`;
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `${ttT("下載全台地圖中…")} ${done}/${total}<div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb); saveOfflineSet("taiwan", { name: "全台概覽" });
    box.innerHTML = `${ic("check")} <span>${ttT("全台概覽地圖可以離線看了")}</span>${ttParen(`${r.ok}/${r.total} ${ttT("張圖磚")}`)}`;
    btn.innerHTML = `${ic("check")} ${ttT("已下載全台離線地圖")}`;
    refreshOfflineStatus();
  } catch {
    box.innerHTML = ttT("下載失敗，請確認網路後再試。");
    btn.disabled = false; btn.innerHTML = label;
  }
}
// 一鍵預載所有收藏步道的離線地圖
async function downloadFavOffline() {
  const favs = TRAILS.filter(t => Store.isFav(t.id) && t.lat);
  const btn = $("#btnFavOffline"), box = $("#favOfflineBox");
  if (!favs.length) { toast(ttT("還沒有收藏步道：先到步道頁按星星收藏，再回來一次預載")); return; }
  const seen = new Set(); let tiles = [];
  for (const t of favs) for (const k of trailTiles(t)) if (!seen.has(k)) { seen.add(k); tiles.push(k); }
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.hidden = false; box.style.display = "block";
  box.innerHTML = `${ttT("準備下載")} ${tiles.length} ${ttT("張圖磚")}（≈ ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${ic("download")} ${ttT("下載中…")}`;
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `${ttT("下載中…")} ${done}/${total}<div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb); favs.forEach(t => saveOfflineSet("trail:" + t.id, { name: t.name }));
    box.innerHTML = `${ic("check")} <span>${ttT("收藏的步道可以離線看地圖了")}</span>${ttParen(`${favs.length} ${ttT("條")} · ${r.ok}/${r.total} ${ttT("張圖磚")}`)}`;
    btn.innerHTML = `${ic("check")} ${ttT("已預載收藏")}`;
    refreshOfflineStatus();
  } catch {
    box.innerHTML = ttT("下載失敗，請確認網路後再試。");
    btn.disabled = false; btn.innerHTML = label;
  }
}
async function downloadOffline(t, btn) {
  if (!t.lat) { toast(ttT("這條步道沒有座標，下載不了地圖")); return; }
  const box = $("#offlineBox");
  // 底圖 + 高程圖磚（z13–14）：高程一起抓，山上沒訊號時爬升/下降校正與坡度著色才算得出來。
  // 高程圖磚數量比底圖少一個數量級（同範圍只需低倍），對額度影響很小。
  const tiles = trailTiles(t);
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.hidden = false;
  box.innerHTML = `${ttT("準備下載")} ${tiles.length} ${ttT("張圖磚")}（≈ ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  btn.disabled = true; btn.textContent = ttT("下載中…");
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `${ttT("下載離線地圖中…")} ${done}/${total}
        <div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb); saveOfflineSet("trail:" + t.id, { name: t.name });
    const miss = r.total - r.ok;
    box.innerHTML = miss ? `${ic("alert")} ${ttT("有些圖磚沒抓到")}（${miss}）・${ttT("再按一次會補齊")}` : `${ic("check")} ${ttT("好了，這條步道沒訊號也看得到地圖")}`;
    btn.disabled = false; btn.innerHTML = `${ic("check")} ${ttT("已預載離線地圖")}<small>・${ttT("再按一次會補齊")}</small>`;
  } catch {
    box.innerHTML = `${ic("alert")} ${ttT("沒下載完：網路斷了或手機空間不夠。再按一次會從斷掉的地方接著下載。")}`;
    btn.disabled = false; btn.innerHTML = `${ic("download")} ${ttT("預載此步道離線地圖")}`;
  }
}

function closeDetail() {
  clearDetailObs();
  $("#sheetMask").classList.remove("show");
  $("#detailSheet").classList.remove("show");
}
$("#sheetMask").addEventListener("click", closeDetail);
$("#closeDetailBtn").addEventListener("click", closeDetail);
// 下拉關閉手勢（拖曳握把往下滑關閉面板）
function makeSheetDraggable(sheet, closeFn) {
  const grip = sheet.querySelector(".grip"); if (!grip) return;
  let startY = null, dy = 0;
  grip.addEventListener("touchstart", e => { startY = e.touches[0].clientY; dy = 0; sheet.style.transition = "none"; }, { passive: true });
  grip.addEventListener("touchmove", e => { if (startY == null) return; dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  grip.addEventListener("touchend", () => {
    if (startY == null) return;
    sheet.style.transition = ""; sheet.style.transform = "";
    if (dy > 110) closeFn();
    startY = null;
  });
}
["detailSheet:closeDetail", "trackSheet:closeTrackReview", "filterSheet:closeFilter", "gradeSheet:closeGradeInfo"].forEach(pair => {
  const [id, fn] = pair.split(":");
  const el = document.getElementById(id);
  if (el) makeSheetDraggable(el, () => window[fn] && window[fn]());
});

// Esc 關閉最上層的面板（無障礙）
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if ($("#gradeSheet").classList.contains("show")) return closeGradeInfo();
  if ($("#filterSheet").classList.contains("show")) return closeFilter();
  if ($("#trackSheet").classList.contains("show")) return closeTrackReview();
  if ($("#detailSheet").classList.contains("show")) return closeDetail();
});

// 記錄頁（記錄中、行程結算、閃退復原）已拆到 js/record.js，在 app.js、explore.js 之後載入
// ---------- 步道比較 ----------
let compareSet = new Set();
function updateCompareBar() {
  let bar = document.getElementById("compareBar");
  if (!compareSet.size) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "compareBar"; bar.className = "compare-bar"; document.body.appendChild(bar); }
  bar.innerHTML = `<span>已選 <b>${compareSet.size}</b> 條比較</span>
    <button id="cmpClear">清除</button><button id="cmpGo" class="go"${compareSet.size < 2 ? " disabled" : ""}>比較</button>`;
  bar.querySelector("#cmpClear").onclick = () => { compareSet.clear(); updateCompareBar(); };
  bar.querySelector("#cmpGo").onclick = () => { if (compareSet.size >= 2) openCompareSheet(); };
}
function openCompareSheet() {
  if (document.querySelector('[data-ov="cmptrails"]')) return;   // 防連點疊層
  const ts = [...compareSet].map(id => TRAILS.find(t => t.id === id)).filter(Boolean);
  if (ts.length < 2) return;
  const row = (label, fn) => `<tr><th>${label}</th>${ts.map(t => `<td>${fn(t)}</td>`).join("")}</tr>`;
  const ov = document.createElement("div");
  ov.className = "pet-modal"; ov.dataset.ov = "cmptrails";
  ov.innerHTML = `<div class="pet-modal-card">
    <button class="sheet-close" id="cmpClose" aria-label="關閉">✕</button>
    <h2>步道比較</h2>
    <div class="cmp-wrap"><table class="cmp-table">
      ${row("步道", t => `<b class="cmp-nm">${escHtml(t.name)}</b>`)}
      ${row("難度", t => diffBadgeHtml(t))}
      ${row("長度", t => `<span class="nw">${fmtKm(t.length_km)} km</span>`)}
      ${row("累積爬升", t => t.ascent != null ? `<span class="nw">↑${Math.round(t.ascent)} m</span>` : "—")}
      ${row("所需時間", t => timeHtml(t))}
      ${row("親子友善", t => t.family_friendly ? "✓" : "—")}
      ${row("地區", t => t.region || "—")}
      ${row("主題", t => escHtml(tagsOf(t).slice(0, 3).join("、")) || "—")}
    </table></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector("#cmpClose").onclick = close;
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// ---------- 分級說明按鈕 ----------
$("#gradeMask").addEventListener("click", closeGradeInfo);
$("#closeGradeBtn").addEventListener("click", closeGradeInfo);
