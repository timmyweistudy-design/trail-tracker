// 夥伴的旅行：讓夥伴跟「真的走過的步道」綁在一起。全部從紀錄推出來——不另外存狀態，
// 換手機還原紀錄後自動回來，刪掉紀錄也跟著消失，不會有對不起來的數字。
//  - 明信片：每走過一條步道，夥伴帶回一張（主題插畫＋步道名＋縣市＋第一次走的日期）
//  - 發現的生物：走過的步道沿線常見物種（ecology-data：iNaturalist 真實觀察烘焙）
//  - 棲地裝飾：走過瀑布／海景／古道／森林／湖泊主題的步道，舞台上多一樣東西（最多兩樣，走最多的優先）
//  - 地區配件：走過北／中／南／東部、離島的步道，解鎖當地配件（不用果實、不用 PRO）
window.PetJourney = (function () {
  const THEME = { "瀑布": "fall", "海景": "sea", "古道": "old", "森林": "forest", "湖泊": "lake" };
  const REGIONS = [
    ["北部", ["基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"]],
    ["中部", ["苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣"]],
    ["南部", ["嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣"]],
    ["東部", ["花蓮縣", "臺東縣"]],
    ["離島", ["澎湖縣", "金門縣", "連江縣"]],
  ];
  const REGION_HAT = { "北部": "silvergrass", "中部": "maple", "南部": "pineapple", "東部": "wave", "離島": "shell" };
  const CATN = { mammal: ["paw", "哺乳類"], bird: ["bird", "鳥類"], insect: ["bug", "昆蟲"], herp: ["frog", "兩棲爬蟲"] };

  let _byId = null, _byIdN = -1;
  function trail(id) {
    const T = typeof TRAILS !== "undefined" ? TRAILS : [];
    if (!_byId || _byIdN !== T.length) { _byId = new Map(T.map(t => [String(t.id), t])); _byIdN = T.length; }
    return _byId.get(String(id));
  }
  const recs = () => (typeof realRecords === "function" ? realRecords() : []);
  // 走過的步道：[{ t, first, n, km }]，最近第一次走的在前
  function walked() {
    const m = new Map();
    for (const r of recs()) {
      if (!r.trailId) continue;
      const t = trail(r.trailId); if (!t) continue;
      const e = m.get(t.id) || { t, first: r.date, n: 0, km: 0 };
      e.n++; e.km += r.distanceKm || 0;
      if (r.date < e.first) e.first = r.date;
      m.set(t.id, e);
    }
    return [...m.values()].sort((a, b) => (a.first < b.first ? 1 : -1));
  }
  function themeOf(t) {
    const tags = typeof tagsOf === "function" ? tagsOf(t) : [];
    for (const g of tags) if (THEME[g]) return THEME[g];
    return (t.alt_high || 0) >= 2000 ? "peak" : "hill";
  }
  function regionOf(t) { const c = t.region || ""; const g = REGIONS.find(([, l]) => l.includes(c)); return g ? g[0] : ""; }
  function regions() { return new Set(walked().map(e => regionOf(e.t)).filter(Boolean)); }
  function regionHats() { return [...regions()].map(r => REGION_HAT[r]).filter(Boolean); }
  function hatRegion(id) { return Object.keys(REGION_HAT).find(r => REGION_HAT[r] === id) || ""; }
  // 舞台裝飾：主題走過的趟數，最多兩樣
  function decor() {
    const cnt = {};
    for (const e of walked()) { const k = themeOf(e.t); if (["fall", "sea", "old", "forest", "lake"].includes(k)) cnt[k] = (cnt[k] || 0) + e.n; }
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
  }
  function species() {
    const out = {}; Object.keys(CATN).forEach(k => out[k] = new Set());
    if (typeof Ecology === "undefined") return out;
    for (const e of walked()) {
      const s = Ecology.speciesFor(e.t).species || {};
      for (const k of Object.keys(CATN)) (s[k] || []).forEach(n => out[k].add(n));
    }
    return out;
  }

  // ── 明信片插畫（viewBox 160×100）：依步道主題 ──
  const SKY = { fall: ["#bfe3ef", "#e9f5ee"], sea: ["#9fd3ee", "#e5f4fb"], old: ["#f2dcb6", "#f7efdf"], forest: ["#c6e2c8", "#eef6e8"], lake: ["#b9dcee", "#eaf5f2"], peak: ["#a9c4e6", "#e8eef8"], hill: ["#cfe6d2", "#f1f7ec"] };
  const ART = {
    fall: `<path d="M0 100 V58 L40 36 L58 54 V100Z" fill="#5c8a6a"/><path d="M160 100 V50 L118 34 L100 52 V100Z" fill="#4f7d5e"/><rect x="62" y="30" width="34" height="58" fill="#e9f6fb"/><path d="M68 32 v52 M78 30 v56 M88 32 v52" stroke="#bfe2f0" stroke-width="3"/><ellipse cx="79" cy="90" rx="30" ry="7" fill="#d9eef6"/><path d="M0 100 V88 Q80 80 160 88 V100Z" fill="#3f6e50"/>`,
    sea: `<rect x="0" y="56" width="160" height="44" fill="#5aa9d6"/><path d="M0 64 q20-5 40 0 t40 0 t40 0 t40 0 M0 76 q20-5 40 0 t40 0 t40 0 t40 0" stroke="#e8f6fd" stroke-width="2" fill="none"/><path d="M104 100 V62 q8-16 24-18 q20 0 32 18 V100Z" fill="#6f8f5a"/><rect x="126" y="30" width="8" height="18" fill="#fff"/><path d="M124 30 h12 l-6 -8Z" fill="#d9534f"/>`,
    old: `<path d="M0 100 V60 Q50 44 90 58 T160 50 V100Z" fill="#7a9a5e"/><path d="M60 100 L74 86 L70 74 L84 64 L80 54 L94 46" stroke="#c9b48a" stroke-width="9" fill="none" stroke-linejoin="round"/><path d="M62 96 h14 M68 84 h12 M74 72 h12 M80 62 h12" stroke="#a89068" stroke-width="2.4"/><circle cx="36" cy="66" r="14" fill="#4f7d4a"/><rect x="34" y="72" width="4" height="14" fill="#6b4a2a"/>`,
    forest: `<path d="M0 100 V70 Q80 58 160 70 V100Z" fill="#4f8a5c"/><g fill="#2f6b45"><path d="M24 84 l-14 0 l14 -34 l14 34Z"/><path d="M56 80 l-12 0 l12 -40 l12 40Z"/><path d="M104 82 l-13 0 l13 -42 l13 42Z"/><path d="M138 86 l-12 0 l12 -32 l12 32Z"/></g><g fill="#3d7d52"><path d="M80 88 l-10 0 l10 -26 l10 26Z"/></g>`,
    lake: `<path d="M0 100 V54 L36 34 L70 52 L104 30 L160 56 V100Z" fill="#7aa38a"/><ellipse cx="80" cy="80" rx="64" ry="14" fill="#7cc3dc"/><path d="M40 78 h22 M92 84 h26" stroke="#e8f7fb" stroke-width="2" stroke-linecap="round"/>`,
    peak: `<path d="M0 100 V72 L46 26 L70 50 L98 16 L160 76 V100Z" fill="#6b8bb0"/><path d="M98 16 L86 32 L94 30 L98 36 L104 28 L110 30Z M46 26 L38 36 L46 34 L52 38Z" fill="#f4f8fc"/><path d="M0 100 V84 Q80 72 160 86 V100Z" fill="#4f7d5e"/>`,
    hill: `<path d="M0 100 V64 Q40 40 80 58 T160 52 V100Z" fill="#7fb07c"/><path d="M0 100 V80 Q80 66 160 80 V100Z" fill="#5c9a62"/><circle cx="122" cy="62" r="10" fill="#4f8a55"/><rect x="120" y="68" width="4" height="10" fill="#6b4a2a"/>`,
  };
  function cardArt(theme) {
    const s = SKY[theme] || SKY.hill;
    return `<svg class="pj-art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="pjs-${theme}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s[0]}"/><stop offset="1" stop-color="${s[1]}"/></linearGradient></defs><rect width="160" height="100" fill="url(#pjs-${theme})"/>${ART[theme] || ART.hill}</svg>`;
  }
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s));
  const fmt = iso => { try { return new Date(iso).toLocaleDateString(typeof ttLocale === "function" ? ttLocale() : "zh-TW", { year: "numeric", month: "numeric", day: "numeric" }); } catch (e) { return ""; } };
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  function card(e, stageI) {
    const th = themeOf(e.t);
    return `<div class="pj-card" data-theme="${th}" data-id="${esc(e.t.id)}">${cardArt(th)}
      <span class="pj-stamp">${typeof PET_ART !== "undefined" ? PET_ART.svg(stageI) : ""}</span>
      <div class="pj-cap"><b class="pj-name">${esc(e.t.name)}</b><span class="pj-meta">${esc(e.t.region || "")}・${fmt(e.first)}${e.n > 1 ? `・×${e.n}` : ""}</span></div></div>`;
  }

  // ── 夥伴頁區塊 ──
  function render() {
    const box = document.getElementById("petJourney"); if (!box) return;
    const w = walked(), sp = species(), stageI = typeof petStageIndex === "function" ? petStageIndex(totalKm()) : 0;
    const nSp = Object.values(sp).reduce((a, s) => a + s.size, 0), regs = regions();
    const icon = n => (typeof ic === "function" ? ic(n) : "");
    const cards = w.length
      ? `<div class="pj-strip">${w.slice(0, 8).map(e => card(e, stageI)).join("")}</div>`
      : `<div class="pj-empty">${T("走完一條步道，夥伴就會帶回一張明信片")}</div>`;
    box.innerHTML = `<div class="section-title pj-title">${icon("map")} ${T("夥伴的旅行")}</div>
      <div class="pj-wrap">
        <div class="pj-stats">
          <button class="pj-stat" id="pjCards"><b>${w.length}</b><span>${T("明信片")}</span></button>
          <button class="pj-stat" id="pjSpecies"><b>${nSp}</b><span>${T("發現的生物")}</span></button>
          <div class="pj-stat pj-regs"><b>${regs.size}<small>/5</small></b><span>${T("走過的地區")}</span></div>
        </div>
        ${cards}
      </div>`;
    box.querySelector("#pjCards").addEventListener("click", () => openAlbum("cards"));
    box.querySelector("#pjSpecies").addEventListener("click", () => openAlbum("species"));
    box.querySelectorAll(".pj-strip .pj-card").forEach(c => c.addEventListener("click", () => openAlbum("cards")));
  }

  function openAlbum(tab) {
    if (document.querySelector('[data-ov="pjalbum"]')) return;
    const w = walked(), sp = species(), stageI = typeof petStageIndex === "function" ? petStageIndex(totalKm()) : 0;
    const icon = n => (typeof ic === "function" ? ic(n) : "");
    const regs = regions();
    const cardsHtml = w.length ? `<div class="pj-grid">${w.map(e => card(e, stageI)).join("")}</div>` : `<div class="pj-empty">${T("走完一條步道，夥伴就會帶回一張明信片")}</div>`;
    const spHtml = Object.keys(CATN).map(k => {
      const list = [...sp[k]];
      return `<div class="pj-cat"><div class="pj-cat-h">${icon(CATN[k][0])} ${T(CATN[k][1])} <b>${list.length}</b></div>${list.length ? `<div class="pj-chips">${list.map(n => `<span class="pj-chip">${esc(n)}</span>`).join("")}</div>` : `<div class="pj-none">—</div>`}</div>`;
    }).join("");
    const regHtml = REGIONS.map(([r]) => {
      const id = REGION_HAT[r], has = regs.has(r);
      return `<div class="pj-reg${has ? " on" : ""}"><div class="hat-prev">${typeof PET_ART !== "undefined" ? PET_ART.svg(stageI, "", id) : ""}</div><div class="pj-reg-n">${T(r)}</div><div class="pj-reg-h">${T(PET_ART.HAT_LABEL[id])}</div></div>`;
    }).join("");
    const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "pjalbum";
    ov.innerHTML = `<div class="pet-modal-card pj-album"><button class="sheet-close" id="pjClose" aria-label="${T("關閉")}">${icon("x")}</button>
      <h2>${icon("map")} ${T("夥伴的旅行")}</h2>
      <div class="seg pj-seg" role="tablist"><button class="seg-btn${tab !== "species" ? " on" : ""}" data-t="cards" role="tab">${T("明信片")}</button><button class="seg-btn${tab === "species" ? " on" : ""}" data-t="species" role="tab">${T("發現的生物")}</button></div>
      <div class="pj-pane" data-p="cards"${tab === "species" ? " hidden" : ""}>${cardsHtml}
        <div class="dex-sec">${T("地區配件")}</div><p class="dex-intro">${T("走過那個地區的步道就會解鎖，在裝扮裡換上")}</p><div class="pj-regs-grid">${regHtml}</div></div>
      <div class="pj-pane" data-p="species"${tab === "species" ? "" : " hidden"}><p class="dex-intro">${T("走過的步道沿線常見的生物（iNaturalist 真實觀察）")}</p>${spHtml}</div>
    </div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#pjClose" });
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#pjClose").addEventListener("click", close);
    ov.querySelectorAll(".pj-seg .seg-btn").forEach(b => b.addEventListener("click", () => {
      ov.querySelectorAll(".pj-seg .seg-btn").forEach(x => x.classList.toggle("on", x === b));
      ov.querySelectorAll(".pj-pane").forEach(p => { p.hidden = p.dataset.p !== b.dataset.t; });
    }));
  }

  return { walked, themeOf, regionOf, regions, regionHats, hatRegion, decor, species, render, openAlbum, cardArt, REGION_HAT };
})();
