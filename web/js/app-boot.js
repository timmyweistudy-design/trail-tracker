// 開機與導覽（從 app.js 拆出，2026-10）：啟動流程、路況更新、深連結、語言選擇、主導覽、情境導覽、點擊回饋、測試面板入口。
// 一般 script，和 app.js 共用全域；必須在 app.js / map-ui.js / detail.js / appearance.js 之後載入（這裡的程式一載入就會執行）。
// ---------- 啟動 ----------
// 進場畫面由 js/splash.js 控制（時間、跳過、預載、收場）
// 量測 header 高度供搜尋列吸頂用
function setHeaderH() { const h = document.querySelector(".app-header"); if (h) document.documentElement.style.setProperty("--hdr-h", h.offsetHeight + "px"); }
setHeaderH(); window.addEventListener("load", setHeaderH); window.addEventListener("resize", setHeaderH);
initTheme();
if (localStorage.getItem("tt_pet_stage") === null) localStorage.setItem("tt_pet_stage", petStageIndex(totalKm()));   // 既有里程不誤觸進化提示
// loadProfile() 移到 me.js 最後；探索列表的第一次 render() 在 explore.js 最後
// 資料自動救援：localStorage 紀錄被清空（iOS 清快取/儲存）但 IndexedDB 封存還在 → 回填
(async () => {
  try {
    if (typeof Store === "undefined" || !Store.recoverFromArchive) return;
    const n = await Store.recoverFromArchive();
    if (n > 0) {
      try { renderHistory(); render(); renderStats && renderStats(); } catch (e) { /* */ }
      if (typeof toast === "function") toast(`已從本機封存救回 ${n} 筆行程紀錄`);
    }
  } catch (e) { /* */ }
})();
// 即時路況（若有設定代理）→ 抓最新並重繪
// 即時路況：啟動先抓一次；之後每次回到前景且距上次更新超過 10 分鐘再抓一次，保持新鮮
// 收藏的步道路況變了：講一聲（最多講兩條，其餘合成一句）。測試面板也用這個模擬
function announceCondChanges(ch) {
  ch.slice(0, 2).forEach((c, i) => setTimeout(() => toast(`${ttT("你收藏的")}${ttSp()}${ttQuote(ttT(c.t.name))}${ttColon()}${c.now ? ttT(c.now) : ttT("恢復開放了")}`), 1500 + i * 2600));
  if (ch.length > 2) setTimeout(() => toast(`${ttT("其他收藏步道的路況也有變，到步道頁看看")} (+${ch.length - 2})`), 1500 + 2 * 2600);
}
function refreshConditions() {
  if (typeof Conditions === "undefined") return;
  Conditions.refresh(TRAILS).then(r => {
    if (!r || !r.ok) return;
    if (typeof render === "function") render();   // 重繪列表（解除/新增封閉標記）；路況回來得比 explore.js 載入還快時，explore.js 自己第一次畫就會用到新路況
    announceCondChanges(r.changes || []);
    const t = currentDetailTrail && currentDetailTrail();
    if (t) { const el = document.getElementById("condLive"); if (el) el.innerHTML = conditionBanner(t); }   // 詳情頁開著就更新橫幅
  });
}
// 先套用本機存的最新一份（山上沒網路也是最後一次抓到的路況），再上網抓新的
try { if (typeof Conditions !== "undefined" && Conditions.restore(TRAILS) && typeof render === "function") render(); } catch (e) { /* */ }
refreshConditions();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - (Conditions.lastUpdated() || 0) > 600000) refreshConditions();
});
// 深連結路由：?trail=id → 開該步道；?post=id → 開該貼文。網頁靠 location.search；原生 App 靠
// Capacitor App 的 appUrlOpen（Universal Link / App Link / 自訂 scheme 進來的網址都走這裡）。
function routeDeepLink(search) {
  try {
    const q = new URLSearchParams(search || "");
    const id = q.get("trail");
    if (id && typeof TRAILS !== "undefined" && TRAILS.some(t => t.id === id)) { setTimeout(() => openDetail(id), 200); return; }
    const view = q.get("view");   // 主畫面小工具／鎖定畫面卡片點進來：切到那個分頁
    if (view && /^(explore|record|pet|me|social)$/.test(view)) { const b = document.querySelector(`.tab[data-view="${view}"]`); if (b) setTimeout(() => b.click(), 100); return; }
    const guard = q.get("guard");   // 留守通知（推播）→ 開那趟行程的狀態
    if (guard) {
      const go = () => { if (typeof Guardian !== "undefined") Guardian.openPlan(guard); };
      if (window.loadSocial) window.loadSocial().then(go, go); else go();
      return;
    }
    const post = q.get("post");
    if (post) {
      const go = () => { const b = document.querySelector('.tab[data-view="social"]'); if (b) b.click(); setTimeout(() => { if (typeof PostView !== "undefined") PostView.open(post); }, 500); };
      if (typeof SocialUI !== "undefined") go(); else if (window.loadSocial) window.loadSocial().then(go);
    }
  } catch (e) { /* */ }
}
routeDeepLink(location.search);   // 開機網址參數（網頁分享／PWA）
if (typeof window !== "undefined") window.routeDeepLink = routeDeepLink;
// 原生：App 在前景/背景被深連結喚醒 → 解析網址參數路由（需搭配 iOS Associated Domains / Android App Links，見 docs/deep-links.md）
(function () {
  try {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && App.addListener) App.addListener("appUrlOpen", d => { try { if (d && d.url) routeDeepLink(new URL(d.url).search); } catch (e) { /* */ } });
  } catch (e) { /* */ }
})();


// 首次進 App 先問語言（新用戶：尚未選語言且未看過導覽）。每語言用自身名稱顯示，選完 set() 會重載。
// 具名函式：DEBUG 面板可重新呼叫預覽。force=true 略過「已選過」判斷。
function langGate(force) {
  if (document.querySelector(".lang-gate")) return;
  const chosen = (() => { try { return localStorage.getItem("tt_lang"); } catch (e) { return null; } })();
  const onboarded = (() => { try { return localStorage.getItem("tt_onboarded_v2"); } catch (e) { return null; } })();
  if (!force && (chosen || onboarded || new URLSearchParams(location.search).get("trail"))) return;
  const ov = document.createElement("div");
  ov.className = "lang-gate";
  ov.innerHTML = `<div class="lang-gate-card">
    <div class="lang-gate-head">
      <div class="lang-gate-mark"><svg class="tt-logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="35" cy="12" r="5" fill="#f3e9c6"/><path d="M3 41 17 22l14 19Z" fill="#2f6b47"/><path d="M13 41 27 15l16 26Z" fill="#43905f"/><path d="m27 15-3.6 6.7L27 20l3.7 1.8Z" fill="#f4f1e6"/><path d="m17 22-2.3 3.2 2.3-.9 2.4 1Z" fill="#f4f1e6"/><path d="M27.5 21c-4.5 5-6.5 11-4.5 20" stroke="#e2b85c" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg></div>
      <h2>選擇語言 · Language</h2>
      <p>循徑拾光 · Gather the Trail</p>
    </div>
    <div class="lg-fs-label">字體大小 · Text size</div>
    <div class="lg-fs" id="lgFs" aria-label="Text size">
      <button class="lg-fs-opt" data-fs="1.2" aria-label="A"><span style="font-size:15px">A</span></button>
      <button class="lg-fs-opt" data-fs="1.35" aria-label="A"><span style="font-size:19px">A</span></button>
      <button class="lg-fs-opt" data-fs="1.5" aria-label="A"><span style="font-size:24px">A</span></button>
      <button class="lg-fs-opt" data-fs="1.65" aria-label="A"><span style="font-size:29px">A</span></button>
    </div>
    <input type="search" class="lang-search" id="lgSearch" placeholder="Search · 搜尋" autocomplete="off">
    <div class="lang-list" id="lgList">${TT_LANGS.map(([c, f, n, sub]) =>
      `<button class="lang-item" data-lg="${c}" data-search="${(n + " " + sub + " " + c).toLowerCase()}"><span class="flag">${f}</span><span class="names"><span class="native">${n}</span>${n === sub ? "" : ` <span class="sub">${sub}</span>`}</span></button>`).join("")}</div>
    <div class="lang-ai-note">除了中文，其他語言是 AI 翻譯，可能有不自然的地方 · Languages other than Chinese are AI-translated and may read a little unnaturally</div>
  </div>`;
  // 字體大小：第一眼就能調，選了立刻套用（langGate 的字也跟著放大，年長者馬上有回饋）
  const curFs = (() => { try { return localStorage.getItem("tt_fontscale") || "1.2"; } catch (e) { return "1.2"; } })();
  ov.querySelectorAll(".lg-fs-opt").forEach(b => {
    b.classList.toggle("on", b.dataset.fs === curFs);
    b.addEventListener("click", () => {
      try { localStorage.setItem("tt_fontscale", b.dataset.fs); } catch (e) { /* */ }
      document.documentElement.style.setProperty("--fs", b.dataset.fs); document.documentElement.toggleAttribute("data-fs-big", +b.dataset.fs >= 1.5); document.documentElement.toggleAttribute("data-fs-mid", +b.dataset.fs >= 1.35);
      ov.querySelectorAll(".lg-fs-opt").forEach(x => x.classList.toggle("on", x === b));
    });
  });
  const lgs = ov.querySelector("#lgSearch");
  if (lgs) lgs.addEventListener("input", () => {
    const q = lgs.value.trim().toLowerCase();
    ov.querySelectorAll("#lgList .lang-item").forEach(b => { b.style.display = (!q || b.dataset.search.includes(q)) ? "" : "none"; });
  });
  ov.querySelectorAll("[data-lg]").forEach(b => b.addEventListener("click", () => {
    const code = b.dataset.lg;
    try {
      if (code === "zh") { localStorage.setItem("tt_lang", "zh"); ov.remove(); onboarding(); }  // 中文＝原文，不需重載
      else if (typeof I18n !== "undefined") I18n.set(code);   // 其他語言：set() 存 tt_lang 後重載，導覽即以該語言顯示
    } catch (e) { ov.remove(); onboarding(); }
  }));
  document.body.appendChild(ov);
}
langGate();

// #22 首次使用導覽：聚光燈式，真的帶使用者點過每個分頁、在真的按鈕上跳說明（為年長者設計）。
// 先引導社群登入（可略過），再逐頁介紹。長句 >40 字會跳過 i18n 檢查（比照舊導覽）。
// 導覽說明框：放在目標上方或下方「放得下」的那一邊，不蓋住正在介紹的東西；兩邊都放不下才貼螢幕邊緣
function ttPlaceTip(tip, r) {
  const cs = getComputedStyle(document.documentElement);
  const st = parseFloat(cs.getPropertyValue("--safe-t")) || 0, sb = parseFloat(cs.getPropertyValue("--safe-b")) || 0;
  const H = window.innerHeight, th = tip.offsetHeight, gap = 14;
  const above = r.top - gap - (st + 8), below = H - sb - 8 - (r.bottom + gap);
  if (below >= th && (below >= above || above < th)) tip.style.top = (r.bottom + gap) + "px";
  else if (above >= th) tip.style.top = (r.top - gap - th) + "px";
  else if (r.top + r.height / 2 < H * 0.5) tip.style.bottom = `calc(24px + var(--safe-b, 0px))`;
  else tip.style.top = `calc(var(--safe-t, 0px) + 84px)`;   // 避開動態島
}
function onboarding(force, opts) {
  opts = opts || {};
  const KEY = "tt_onboarded_v2", RESUME = "tt_tour_resume";
  if (!force && (localStorage.getItem(KEY) || new URLSearchParams(location.search).get("trail"))) return;
  if (!localStorage.getItem("tt_lang")) return;   // 尚未選語言 → 等語言選擇覆蓋層先處理
  if (document.querySelector(".tour")) return;     // 防重複開

  // 翻譯：預設 ttT（中文回原文、其他語言翻）；DEBUG 中/英預覽用 previewLang 直接查該語言字典（不必切語言重載）
  const previewLang = opts.previewLang;
  // 預覽的語言字典還沒載（英文也是按需載入了）→ 先載再重開，否則預覽會整段是中文
  if (previewLang && previewLang !== "zh" && typeof I18n !== "undefined" && I18n.tables && !I18n.tables()[previewLang] && I18n.ensure && !opts._loaded) {
    I18n.ensure(previewLang, () => onboarding(force, Object.assign({}, opts, { _loaded: true }))); return;
  }
  let T;
  if (previewLang === "zh") T = s => s;
  else if (previewLang && typeof I18n !== "undefined" && I18n.tables) { const D = (I18n.tables()[previewLang] || {}).D || {}; T = s => D[s] || s; }
  else T = (typeof ttT === "function") ? ttT : (s => s);
  const steps = [
    { center: true, e: ic("mountain"), h: "嗨，歡迎來到循徑拾光", p: "花 30 秒帶你逛一圈，隨時可以跳過。" },
    { view: "social", sel: ".social-auth", e: ic("users"), h: "要雲端備份嗎？",
      p: "登入之後，每趟走完都會自動備份，換手機也不怕。現在不想弄就按「先略過」。", login: true },
    { view: "explore", sel: "#searchInput", e: ic("search"), h: "找步道",
      p: "打名字、地區，或「瀑布」「古道」這種關鍵字都行。" },
    { view: "explore", sel: ".toolbar .seg, .toolbar", e: ic("map"), h: "清單或地圖",
      p: "想用清單滑、還是在地圖上挑，這裡切。上面那排是幫你整理好的主題。" },
    { view: "explore", sel: "#trailList .card", e: ic("book"), h: "點進去看細節",
      p: "難度、路況、天氣、海拔、會遇到什麼動物、走完去哪吃，都在裡面。" },
    { view: "record", sel: "#btnStart", e: ic("pin"), h: "記錄健行",
      p: "出發按「開始」就好。鎖螢幕、山裡沒訊號，照樣記得到。" },
    { view: "record", sel: ".rec-tools", e: ic("shield"), h: "安全工具",
      p: "「留守人」幫你設預計下山時間，超時會通知家人朋友；「求救卡」一頁就有座標和 112。" },
    { view: "pet", sel: "#petCard", e: ic("paw"), h: "你的山林夥伴",
      p: "一顆蛋，靠你走路長大。果實靠走路和每日任務賺，每天餵一次；點牠、長按抱抱，「手冊」裡會記下你們的日記。" },
    { view: "pet", sel: "#petJourney", e: ic("map"), h: "夥伴的旅行",
      p: "每走完一條步道，夥伴帶回一張明信片；走過新的地區，地圖會亮起來，還會解鎖當地配件。" },
    { view: "pet", sel: "#petBadges", e: ic("medal"), h: "成就",
      p: "里程、爬升、連續天數達標就解鎖勳章。拿到就是你的，不會不見。" },
    { view: "me", sel: "#meMonth", e: ic("calendar"), h: "我的足跡",
      p: "這個月走了幾天、幾公里，一眼看完；往下是全部走過的路。" },
    { view: "me", sel: "#meLinks", e: ic("target"), h: "分析與回顧",
      p: "進階分析、年度回顧、足跡地圖和登頂收集冊都在這一排。" },
    { view: "me", sel: ".set-zone-title", e: ic("sliders"), h: "設定",
      p: "字太小、想換深色、要備份資料，往下找這裡。" },
    { center: true, e: ic("sparkle"), h: "逛完了", p: "挑一條步道，出門走走吧。", last: true },
  ].map(s => ({ ...s, h: T(s.h), p: T(s.p) }));

  // 起始步：opts.startAt（登入後續播）或續播旗標；否則從頭
  let i = opts.startAt != null ? opts.startAt : (+(localStorage.getItem(RESUME) || 0) || 0);
  try { localStorage.removeItem(RESUME); } catch (e) { /* 續播點已消費 */ }
  if (i < 0 || i >= steps.length) i = 0;   // 越界保護（步數改動時）
  const ov = document.createElement("div"); ov.className = "tour";
  const spot = document.createElement("div"); spot.className = "tour-spot";
  const tip = document.createElement("div"); tip.className = "tour-tip";
  ov.appendChild(spot); ov.appendChild(tip);
  document.body.appendChild(ov);

  const done = () => { try { localStorage.setItem(KEY, "1"); localStorage.removeItem(RESUME); } catch (e) { /* */ } ov.remove(); };
  // 登入後續播：記住下一步、移除導覽讓使用者登入；同頁登入(Email 驗證碼)偵測到就續播，Google 重載則靠開機續播
  function isSignedIn() {
    try { const c = (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) ? Supa.client() : null; if (!c) return Promise.resolve(false); return c.auth.getSession().then(({ data }) => !!(data && data.session && data.session.user)).catch(() => false); }
    catch (e) { return Promise.resolve(false); }
  }
  function loginThenResume() {
    const step = i + 1;
    try { localStorage.setItem(RESUME, String(step)); } catch (e) { /* */ }
    ov.remove();   // 讓出畫面給登入表單（已在社群分頁）
    let n = 0;
    const iv = setInterval(async () => {
      if (document.querySelector(".tour") || ++n > 120) { clearInterval(iv); return; }   // 已由別處續播 / ~3 分放棄（靠開機續播兜底）
      if (await isSignedIn()) { clearInterval(iv); onboarding(true, { startAt: step, previewLang }); }
    }, 1500);
  }
  const findTarget = sel => {
    for (const s of (sel || "").split(",")) { const el = document.querySelector(s.trim()); if (el && el.offsetParent !== null) return el; }
    return null;
  };
  // 定位聚光燈＋說明框。r=目標矩形；r=null → 整螢幕均勻變暗、說明置中（找不到目標或抓到整頁容器時）。
  function place(r) {
    if (!r) { spot.style.width = spot.style.height = "0px"; spot.style.top = "50%"; spot.style.left = "50%"; }
    else {
      const pad = 8;
      spot.style.top = (r.top - pad) + "px"; spot.style.left = (r.left - pad) + "px";
      spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
    }
    // 說明框放在目標上方或下方放得下的那邊（ttPlaceTip）；都放不下才貼螢幕邊緣，大字體也不超出、按鈕永遠可點
    tip.classList.toggle("center", !r); tip.style.top = tip.style.bottom = "";
    if (r) ttPlaceTip(tip, r);
  }
  function renderTip(st) {
    const dots = steps.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("");
    const btns = st.login
      ? `<button class="btn primary" id="tourLogin">${T("去登入")}</button><button class="info-link" id="tourNext" style="display:block;margin:10px auto 0">${T("先略過，繼續介紹")}</button>`
      : `<button class="btn primary" id="tourNext">${st.last ? T("開始探索") : T("下一步")}</button>`;
    const skipAll = st.last ? "" : `<button class="info-link tour-skipall" id="tourSkipAll">${T("跳過導覽")}</button>`;   // 明確的「跳過整個導覽」
    tip.innerHTML = `${st.last ? "" : `<button class="tour-skip" id="tourSkip" aria-label="${T("跳過導覽")}">✕</button>`}`
      + `<div class="tour-emoji">${st.e}</div><h3>${st.h}</h3><p>${st.p}</p>`
      + `<div class="tour-dots">${dots}</div>${btns}${skipAll}`;
    const nx = tip.querySelector("#tourNext"); if (nx) nx.addEventListener("click", () => { if (st.last) done(); else { i++; show(); } });
    const sk = tip.querySelector("#tourSkip"); if (sk) sk.addEventListener("click", done);
    const sa = tip.querySelector("#tourSkipAll"); if (sa) sa.addEventListener("click", done);
    const lg = tip.querySelector("#tourLogin"); if (lg) lg.addEventListener("click", loginThenResume);   // 登入完成後續播
  }
  async function show() {
    const st = steps[i];
    renderTip(st);                                   // 先把內容畫出來（切分頁/等目標時也看得到）
    place(null);                                      // 先置中（避免等目標時殘留上一步的聚光燈位置）
    if (st.view) { const tb = document.querySelector(`.tab[data-view="${st.view}"]`); if (tb && !tb.classList.contains("active")) tb.click(); }
    let target = null;
    if (st.sel && !st.center) {                      // 等目標出現（社群/寵物非同步渲染），最多等 ~2 秒
      for (let k = 0; k < 16 && !target; k++) { target = findTarget(st.sel); if (!target) await new Promise(r => setTimeout(r, 130)); }
    }
    let r = null;
    if (target) {
      try { target.scrollIntoView({ block: "center" }); } catch (e) { /* */ }
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));   // 等捲動＋版面穩定再量，框才準
      if (steps[i] !== st) return;                   // 使用者已前進 → 別覆蓋新步驟
      const rr = target.getBoundingClientRect();
      const huge = rr.width > window.innerWidth * 0.92 && rr.height > window.innerHeight * 0.8;   // 抓到整頁容器 → 不框
      if (!huge && rr.width > 4 && rr.height > 4) r = rr;
    }
    place(r);
    if (r && target) [350, 900].forEach(ms => setTimeout(() => { if (steps[i] !== st || !target.isConnected) return; const q = target.getBoundingClientRect(); if (Math.abs(q.top - r.top) > 2 || Math.abs(q.left - r.left) > 2 || Math.abs(q.height - r.height) > 2) { r = q; place(q); } }, ms));   // 目標畫面可能還在跑進場動畫／內容剛長出來 → 第一次量會偏，稍後再量兩次對準
  }
  show();
}
// 已選過語言的用戶（含重載回來的）：直接跑導覽；新用戶則由 langGate 選完語言後再觸發
onboarding();

// 情境式導覽：在「當前畫面」逐一聚光介紹某功能，各有 flag，看過一次就不再跳。與主導覽 onboarding 共用 .tour CSS。
// steps: [{sel,e,h,p,center}]；opts:{scope}（限定在某容器內找目標，如詳情 sheet／小隊浮層）。長句 p 已全數翻進字典。
window.ttCoach = function (flag, rawSteps, opts) {
  opts = opts || {};
  try { if (flag && localStorage.getItem(flag)) return; } catch (e) { return; }
  if (!localStorage.getItem("tt_lang")) return;      // 還沒選語言 → 等語言選擇覆蓋層
  if (document.querySelector(".tour, .ttdlg-ov")) return;   // 主導覽/情境導覽/對話框(如權限說明卡)進行中 → 讓路（flag 不設，下次再跳）
  const T = (typeof ttT === "function") ? ttT : (s => s);
  const steps = (rawSteps || []).filter(Boolean).map(s => ({ ...s, h: T(s.h), p: T(s.p) }));
  if (!steps.length) return;
  steps[steps.length - 1].last = true;                 // 最後一步收尾
  let i = 0;
  const root = () => (opts.scope ? document.querySelector(opts.scope) : null) || document;
  const ov = document.createElement("div"); ov.className = "tour";
  const spot = document.createElement("div"); spot.className = "tour-spot";
  const tip = document.createElement("div"); tip.className = "tour-tip";
  ov.appendChild(spot); ov.appendChild(tip); document.body.appendChild(ov);
  const done = () => { try { if (flag) localStorage.setItem(flag, "1"); } catch (e) { /* */ } ov.remove(); };
  const findTarget = sel => {
    const r = root();
    for (const s of (sel || "").split(",")) { const el = r.querySelector(s.trim()); if (el && el.offsetParent !== null) return el; }
    return null;
  };
  function place(rr) {
    if (!rr) { spot.style.width = spot.style.height = "0px"; spot.style.top = "50%"; spot.style.left = "50%"; }
    else {
      const pad = 8;
      spot.style.top = (rr.top - pad) + "px"; spot.style.left = (rr.left - pad) + "px";
      spot.style.width = (rr.width + pad * 2) + "px"; spot.style.height = (rr.height + pad * 2) + "px";
    }
    tip.classList.toggle("center", !rr); tip.style.top = tip.style.bottom = "";
    if (rr) ttPlaceTip(tip, rr);
  }
  function renderTip(st) {
    const dots = steps.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("");
    const skipAll = st.last ? "" : `<button class="info-link tour-skipall" id="tourSkipAll">${T("跳過導覽")}</button>`;
    tip.innerHTML = `${st.last ? "" : `<button class="tour-skip" id="tourSkip" aria-label="${T("跳過導覽")}">✕</button>`}`
      + `<div class="tour-emoji">${st.e}</div><h3>${st.h}</h3><p>${st.p}</p>`
      + `<div class="tour-dots">${dots}</div><button class="btn primary" id="tourNext">${st.last ? T("知道了") : T("下一步")}</button>${skipAll}`;
    const nx = tip.querySelector("#tourNext"); if (nx) nx.addEventListener("click", () => { if (st.last) done(); else { i++; show(); } });
    const sk = tip.querySelector("#tourSkip"); if (sk) sk.addEventListener("click", done);
    const sa = tip.querySelector("#tourSkipAll"); if (sa) sa.addEventListener("click", done);
  }
  async function show() {
    const st = steps[i];
    renderTip(st); place(null);
    if (st.pre) { try { st.pre(); } catch (e) { /* 切分頁等前置動作失敗不擋導覽 */ } await new Promise(r => setTimeout(r, 200)); }   // 目標在隱藏分頁 → 先切過去
    let target = null;
    if (st.sel && !st.center) { for (let k = 0; k < 16 && !target; k++) { target = findTarget(st.sel); if (!target) await new Promise(r => setTimeout(r, 130)); } }
    let r = null;
    if (target) {
      try { target.scrollIntoView({ block: "center" }); } catch (e) { /* */ }
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      if (steps[i] !== st) return;
      const rr = target.getBoundingClientRect();
      const huge = rr.width > window.innerWidth * 0.92 && rr.height > window.innerHeight * 0.8;
      if (!huge && rr.width > 4 && rr.height > 4) r = rr;
    }
    place(r);
    if (r && target) [350, 900].forEach(ms => setTimeout(() => { if (steps[i] !== st || !target.isConnected) return; const q = target.getBoundingClientRect(); if (Math.abs(q.top - r.top) > 2 || Math.abs(q.left - r.left) > 2 || Math.abs(q.height - r.height) > 2) { r = q; place(q); } }, ms));
  }
  show();
};

// 首次點開步道詳情：帶著切分頁介紹各區（天氣/海拔/離線在「路線」、生態在「生態」、分享/記錄在「概覽」）。
// 目標區塊分散在隱藏分頁 → 每步用 pre 先切到該分頁，聚光燈才框得到（改版分頁化後必要）。
window.ttCoachTrail = function (hasGeo) {
  if (!document.querySelector("#detailSheet.show")) return;
  const tab = code => () => { const b = document.querySelector(`#detailNav button[data-tab="${code}"]`); if (b) b.click(); };
  window.ttCoach("tt_coach_trail", [
    { sel: "#detailNav", e: ic("book"), h: "分頁", p: "概覽、路線、生態、周邊，點上面切換。", pre: tab("ov") },
    { sel: "#weatherBox", e: ic("sun"), h: "天氣", p: "步道那邊現在的天氣和一週預報，出門前瞄一眼。", pre: tab("rt") },
    hasGeo ? { sel: "#profileBox", e: ic("mountain"), h: "海拔剖面", p: "整條路的高低起伏。曲線越陡，腿越酸。", pre: tab("rt") } : null,
    { sel: "#btnOffline", e: ic("download"), h: "離線地圖", p: "山上常常沒訊號，出發前先把地圖存起來。", pre: tab("rt") },
    { sel: "#ecoBox", e: ic("leaf"), h: "生態", p: "這一帶常見的動植物，還能看附近真的有人拍到什麼。", pre: tab("ec") },
    { sel: ".link-row", e: ic("share"), h: "這一排", p: "導航、分享、加入比較，都在這。", pre: tab("ov") },
    { sel: "#btnGoRecord", e: ic("pin"), h: "記錄健行", p: "要走這條？按這裡直接開始記錄。", pre: tab("ov") },
  ], { scope: "#detailSheet" });
};

// 首次開啟小隊浮層：介紹小隊用途、建立、加入碼、與小隊同行。
window.ttCoachTeam = function (hasActive) {
  if (!document.querySelector('[data-ov="team"]')) return;
  window.ttCoach("tt_coach_team", [
    { center: true, e: ic("users"), h: "小隊", p: "和山友組隊，在記錄地圖上即時看到彼此的位置，一起安全同行。" },
    { sel: "#tmCreate", e: ic("plus"), h: "建立小隊", p: "取個隊名按「建立」，系統會給你一組加入碼，分享給隊友。" },
    { sel: "#tmJoin, #tmCode", e: ic("users"), h: "用加入碼加入", p: "拿到隊友的加入碼？輸入後按「加入」，就成為小隊的一員。" },
    hasActive ? { sel: ".team-live", e: ic("pin"), h: "與小隊同行", p: "打開後，隊員在記錄頁的地圖上就能看到彼此的即時定位。" } : null,
  ], { scope: '[data-ov="team"]' });
};

// 登入後首次點開各社群分頁：一頁一張小卡介紹該頁用途。
window.ttCoachSocial = function (sub) {
  if (document.body.dataset.view !== "social") return;
  const M = {
    friends: { flag: "tt_coach_soc_friends", e: ic("megaphone"), h: "動態", p: "看你追蹤的山友發的貼文，可以按讚、留言，或收藏他們的路線。" },
    explore: { flag: "tt_coach_soc_explore", e: ic("compass"), h: "探索", p: "探索其他山友公開的健行足跡與旅程，替下次出遊找靈感。" },
    search: { flag: "tt_coach_soc_search", e: ic("search"), h: "搜尋山友", p: "用名稱或 @帳號找到山友，追蹤他們就能在動態看到更新。" },
    notif: { flag: "tt_coach_soc_notif", e: ic("bell"), h: "通知", p: "有人按讚、留言、追蹤你，或小隊邀請，都會出現在這裡。" },
    me: { flag: "tt_coach_soc_me", e: ic("users"), h: "我的檔案", p: "你的個人檔案和發過的貼文。上面四顆鈕：編輯資料、看收藏、揪團、隱私與通知設定。" },
  };
  const c = M[sub]; if (!c) return;
  window.ttCoach(c.flag, [{ center: true, e: c.e, h: c.h, p: c.p }], {});
};

// 首次進記錄頁（閒置）：介紹即時軌跡地圖與開始鈕。
// 看過舊版（只有地圖＋開始鈕）的人，另外補一次「安全工具」的介紹
window.ttCoachRecord = function () {
  if (document.body.dataset.view !== "record") return;
  const tools = [
    { sel: "#btnGuard", e: ic("shield"), h: "留守人", p: "出發前設預計下山時間。超過還沒按結束，會通知你指定的好友，也能把行程傳給家人。" },
    { sel: "#btnSos", e: ic("alert"), h: "求救卡", p: "迷路或受傷時打開：座標、海拔、一鍵撥 112，照著念就好。" },
  ];
  let seen = false; try { seen = !!localStorage.getItem("tt_coach_record"); } catch (e) { /* */ }
  if (seen) { window.ttCoach("tt_coach_record_tools", tools, {}); return; }
  window.ttCoach("tt_coach_record", [
    { sel: "#recMap", e: ic("map"), h: "記錄地圖", p: "開始之後，走過的路會一路畫在地圖上。" },
    { sel: "#btnStart", e: ic("play"), h: "記錄健行", p: "出發按「開始」，走完按「結束」，就存成一筆紀錄。" },
    ...tools,
  ], {});
  try { localStorage.setItem("tt_coach_record_tools", "1"); } catch (e) { /* 新使用者一次看完，不用再補 */ }
};
// 第一次打開登頂收集冊
window.ttCoachPeaks = function () {
  if (!document.querySelector('[data-ov="peaks"]')) return;
  window.ttCoach("tt_coach_peaks", [
    { sel: ".pk-tabs", e: ic("mountain"), h: "百岳與小百岳", p: "兩本收集冊，上面切換。" },
    { sel: ".pk-grid", e: ic("check"), h: "自動蓋章", p: "記錄時走到山頂附近就會蓋上；點任何一格，看登頂日期和附近步道。" },
  ], { scope: '[data-ov="peaks"]' });
};

// 浮起的小表情（按讚/表情回應時從按鈕飄起）
window.ttFloat = function (el, emoji) {
  try {
    const r = el.getBoundingClientRect();
    const s = document.createElement("span");
    s.className = "tt-float"; s.textContent = emoji;
    s.style.left = (r.left + r.width / 2) + "px"; s.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(s); setTimeout(() => s.remove(), 800);
  } catch (e) { /* */ }
};

// 全域點擊回饋：任何「可點元素」按下時都加按壓動畫 + 輕震動（不必逐一列名單）
(function () {
  const SEL = "a[href], button, [role='button'], [role='tab'], [role='link'], label, summary, .chip, .tab, .sub-tab, .seg-btn, .btn, .link-btn, .icon-btn, .feed-card, .disc-row, .notif, [data-id], [data-view], [data-sub], [data-sec], [data-tag], [data-handle], [onclick]";
  // 判定可點：符合語意選擇器，或電腦樣式 cursor 是 pointer
  function pressable(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      try { if (n.matches && n.matches(SEL)) return n; } catch (_) { }
      try { if (getComputedStyle(n).cursor === "pointer") return n; } catch (_) { }
    }
    return null;
  }
  const canVibrate = "vibrate" in navigator;
  let cur = null, last = 0;
  const release = () => { if (cur) { cur.classList.remove("tt-press"); cur = null; } };
  document.addEventListener("pointerdown", e => {
    const t = pressable(e.target); if (!t) return;
    release(); cur = t; t.classList.add("tt-press");
    if (canVibrate && e.pointerType !== "mouse") { const now = Date.now(); if (now - last > 40) { last = now; try { navigator.vibrate(8); } catch (_) { } } }
  }, { passive: true });
  // 放開 / 取消 / 移出 / 捲動 → 還原
  ["pointerup", "pointercancel", "pointerleave", "dragstart", "scroll"].forEach(ev =>
    document.addEventListener(ev, release, { passive: true, capture: true }));
})();

// ── 測試面板（開發者用）：延遲載入 js/debug.js。開啟方式：網址 ?debug=1，或連點標題 5 下 ──
// 模擬動態島（測試面板的開關，存在 tt_sim_notch）：畫一顆黑色膠囊和 Home 條，只是看位置、點不到
function simNotchMarks() {
  const on = document.documentElement.classList.contains("sim-notch");
  document.querySelectorAll(".sim-island, .sim-home").forEach(e => e.remove());
  if (on) { const a = document.createElement("div"); a.className = "sim-island"; const h = document.createElement("div"); h.className = "sim-home"; document.body.append(a, h); }
}
simNotchMarks();
window.openDebugPanel = () => ensureScript("js/debug.js").then(() => { if (typeof toggleDebugPanel === "function") toggleDebugPanel(); });
if (new URLSearchParams(location.search).get("debug") === "1") setTimeout(window.openDebugPanel, 400);
(function () {
  const brand = document.querySelector(".brand"); if (!brand) return;
  let n = 0, tm;
  brand.addEventListener("click", () => { n++; clearTimeout(tm); tm = setTimeout(() => n = 0, 1200); if (n >= 5) { n = 0; window.openDebugPanel(); } });
})();
