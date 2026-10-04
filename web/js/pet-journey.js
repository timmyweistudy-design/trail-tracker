// 夥伴的旅行（PRO）：讓夥伴跟「真的走過的步道」綁在一起。全部從紀錄推出來——不另外存狀態，
// 換手機還原紀錄後自動回來，刪掉紀錄也跟著消失，不會有對不起來的數字。唯一存的是「哪幾張看過了」（新卡片的小標）。
//  - 明信片：每走過一條步道，夥伴帶回一張。插畫依步道主題、天色依第一次走的時段；點開翻面看夥伴寫的話、郵戳、走了幾次
//  - 走過的地區：22 縣市方格地圖＋五個地區的進度；走過那個地區就解鎖當地配件
//  - 舞台裝飾：走最多的兩個主題出現在夥伴舞台上
// 只算有對應步道的行程（從步道頁開始記錄）；自由路線、模擬、搭車的不算（realRecords 已排除）。
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
  // 縣市方格地圖：[欄, 列, ISO 3166-2:TW 代碼]（示意位置，不是真實比例；外語介面顯示代碼）
  const TILE = {
    "連江縣": [0, 0, "LIE"], "金門縣": [0, 2, "KIN"], "澎湖縣": [0, 4, "PEN"],
    "桃園市": [2, 0, "TAO"], "臺北市": [3, 0, "TPE"], "基隆市": [4, 0, "KEE"],
    "新竹市": [1, 1, "HSZ"], "新竹縣": [2, 1, "HSQ"], "新北市": [3, 1, "NWT"], "宜蘭縣": [4, 1, "ILA"],
    "苗栗縣": [1, 2, "MIA"], "臺中市": [2, 2, "TXG"], "南投縣": [3, 2, "NAN"], "花蓮縣": [4, 2, "HUA"],
    "彰化縣": [1, 3, "CHA"], "雲林縣": [2, 3, "YUN"], "嘉義縣": [3, 3, "CYQ"], "臺東縣": [4, 3, "TTT"],
    "嘉義市": [1, 4, "CYI"], "臺南市": [2, 4, "TNN"], "高雄市": [3, 4, "KHH"], "屏東縣": [3, 5, "PIF"],
  };
  const SHORT = { "新竹市": "竹市", "新竹縣": "竹縣", "嘉義市": "嘉市", "嘉義縣": "嘉縣" };   // 同名的市／縣要分得出來
  const REGION_COLOR = { "北部": "#4f9a6a", "中部": "#d0913a", "南部": "#d0644f", "東部": "#4f86b8", "離島": "#8a6fb3" };
  // 明信片背面：夥伴寫的話（依主題）
  const NOTE = {
    fall: "瀑布的水聲好大，我一直想去碰水！",
    sea: "海風鹹鹹的，下次帶我去看日落好不好？",
    old: "石階好多階，走在前人走過的路上好神奇。",
    forest: "樹林裡好涼，我聞到了芬多精的味道。",
    lake: "湖面好安靜，倒影裡也有我們兩個。",
    peak: "好高好冷！雲就在腳下，我們好厲害。",
    hill: "今天的小山剛剛好，下次再一起來。",
  };

  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const icon = n => (typeof ic === "function" ? ic(n) : "");
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s));
  const pro = () => typeof Premium !== "undefined" && Premium.isOn();
  const cjk = () => (typeof ttCJK === "function" ? ttCJK() : true);
  const fmt = iso => { try { return new Date(iso).toLocaleDateString(typeof ttLocale === "function" ? ttLocale() : "zh-TW", { year: "numeric", month: "numeric", day: "numeric" }); } catch (e) { return ""; } };

  let _byId = null, _byIdN = -1;
  function trail(id) {
    const L = typeof TRAILS !== "undefined" ? TRAILS : [];
    if (!_byId || _byIdN !== L.length) { _byId = new Map(L.map(t => [String(t.id), t])); _byIdN = L.length; }
    return _byId.get(String(id));
  }
  const recs = () => (typeof realRecords === "function" ? realRecords() : []);
  // 走過的步道：[{ t, first, last, n, km }]，最近第一次走的在前
  function walked() {
    const m = new Map();
    for (const r of recs()) {
      if (!r.trailId) continue;
      const t = trail(r.trailId); if (!t) continue;
      const e = m.get(t.id) || { t, first: r.date, last: r.date, n: 0, km: 0 };
      e.n++; e.km += r.distanceKm || 0;
      if (r.date < e.first) e.first = r.date;
      if (r.date > e.last) e.last = r.date;
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
  function counties() { const s = new Set(); walked().forEach(e => { if (TILE[e.t.region]) s.add(e.t.region); }); return s; }
  function regions() { return new Set(walked().map(e => regionOf(e.t)).filter(Boolean)); }
  function regionHats() { return [...regions()].map(r => REGION_HAT[r]).filter(Boolean); }
  function hatRegion(id) { return Object.keys(REGION_HAT).find(r => REGION_HAT[r] === id) || ""; }
  // 舞台裝飾（PRO）：主題走過的趟數，最多兩樣
  function decor() {
    if (!pro()) return [];
    const cnt = {};
    for (const e of walked()) { const k = themeOf(e.t); if (["fall", "sea", "old", "forest", "lake"].includes(k)) cnt[k] = (cnt[k] || 0) + e.n; }
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
  }

  // ── 看過了哪幾張（「新」小標）：第一次用時把現有的都算看過，不然一升級全部都是新的 ──
  function seen() {
    let s = null; try { s = JSON.parse(localStorage.getItem("tt_pj_seen")); } catch (e) { /* */ }
    if (!Array.isArray(s)) { s = walked().map(e => String(e.t.id)); localStorage.setItem("tt_pj_seen", JSON.stringify(s)); }
    return new Set(s);
  }
  function markSeen(ids) { const s = seen(); ids.forEach(i => s.add(String(i))); localStorage.setItem("tt_pj_seen", JSON.stringify([...s])); }

  // ── 明信片插畫（viewBox 160×100）：主題決定風景、第一次走的時段決定天色 ──
  const SKY = {
    dawn: ["#f4c3a8", "#fbe8da"], day: ["#a8d4ee", "#e9f5f6"], dusk: ["#8a6fa8", "#f2b48a"], night: ["#1c2a4a", "#3d5878"],
  };
  const ART = {
    fall: `<path d="M0 100 V58 L40 36 L58 54 V100Z" fill="#5c8a6a"/><path d="M160 100 V50 L118 34 L100 52 V100Z" fill="#4f7d5e"/><path d="M64 30 Q62 60 60 88 H98 Q96 60 94 30Z" fill="#e9f6fb"/><path d="M70 34 v50 M79 32 v54 M88 34 v50" stroke="#bfe2f0" stroke-width="2.4"/><ellipse cx="79" cy="90" rx="30" ry="7" fill="#d9eef6"/><path d="M0 100 V88 Q80 80 160 88 V100Z" fill="#3f6e50"/>`,
    sea: `<rect x="0" y="56" width="160" height="44" fill="#5aa9d6"/><path d="M0 64 q20-5 40 0 t40 0 t40 0 t40 0 M0 76 q20-5 40 0 t40 0 t40 0 t40 0" stroke="#e8f6fd" stroke-width="2" fill="none"/><path d="M104 100 V62 q8-16 24-18 q20 0 32 18 V100Z" fill="#6f8f5a"/><rect x="126" y="30" width="8" height="18" fill="#fff"/><path d="M124 30 h12 l-6 -8Z" fill="#d9534f"/>`,
    old: `<path d="M0 100 V60 Q50 44 90 58 T160 50 V100Z" fill="#7a9a5e"/><path d="M60 100 L74 86 L70 74 L84 64 L80 54 L94 46" stroke="#c9b48a" stroke-width="9" fill="none" stroke-linejoin="round"/><path d="M62 96 h14 M68 84 h12 M74 72 h12 M80 62 h12" stroke="#a89068" stroke-width="2.4"/><circle cx="36" cy="66" r="14" fill="#4f7d4a"/><rect x="34" y="72" width="4" height="14" fill="#6b4a2a"/>`,
    forest: `<path d="M0 100 V70 Q80 58 160 70 V100Z" fill="#4f8a5c"/><g fill="#2f6b45"><path d="M24 84 l-14 0 l14 -34 l14 34Z"/><path d="M56 80 l-12 0 l12 -40 l12 40Z"/><path d="M104 82 l-13 0 l13 -42 l13 42Z"/><path d="M138 86 l-12 0 l12 -32 l12 32Z"/></g><path d="M80 88 l-10 0 l10 -26 l10 26Z" fill="#3d7d52"/>`,
    lake: `<path d="M0 100 V54 L36 34 L70 52 L104 30 L160 56 V100Z" fill="#7aa38a"/><ellipse cx="80" cy="80" rx="64" ry="14" fill="#7cc3dc"/><path d="M40 78 h22 M92 84 h26" stroke="#e8f7fb" stroke-width="2" stroke-linecap="round"/>`,
    peak: `<path d="M0 100 V72 L46 26 L70 50 L98 16 L160 76 V100Z" fill="#6b8bb0"/><path d="M98 16 L86 32 L94 30 L98 36 L104 28 L110 30Z M46 26 L38 36 L46 34 L52 38Z" fill="#f4f8fc"/><path d="M0 100 V84 Q80 72 160 86 V100Z" fill="#4f7d5e"/>`,
    hill: `<path d="M0 100 V64 Q40 40 80 58 T160 52 V100Z" fill="#7fb07c"/><path d="M0 100 V80 Q80 66 160 80 V100Z" fill="#5c9a62"/><circle cx="122" cy="62" r="10" fill="#4f8a55"/><rect x="120" y="68" width="4" height="10" fill="#6b4a2a"/>`,
  };
  function todOf(iso) { const h = new Date(iso).getHours(); return h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 16 ? "day" : h >= 16 && h < 19 ? "dusk" : "night"; }
  let _gid = 0;
  function cardArt(theme, tod) {
    const s = SKY[tod] || SKY.day, id = "pjs" + (++_gid);
    const sun = tod === "night" ? `<circle cx="132" cy="18" r="6" fill="#f4eecf"/><circle cx="135" cy="16" r="5" fill="${s[0]}"/><circle cx="30" cy="14" r="1" fill="#fff"/><circle cx="62" cy="22" r="1" fill="#fff"/><circle cx="100" cy="10" r="1.2" fill="#fff"/>`
      : tod === "day" ? `<circle cx="134" cy="18" r="8" fill="#fff6c8"/>` : `<circle cx="${tod === "dawn" ? 28 : 132}" cy="44" r="10" fill="#ffd08a" opacity=".9"/>`;
    const dim = tod === "night" ? `<rect width="160" height="100" fill="#0b1630" opacity=".38"/>` : tod === "dusk" ? `<rect width="160" height="100" fill="#6a3a5a" opacity=".12"/>` : "";
    return `<svg class="pj-art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s[0]}"/><stop offset="1" stop-color="${s[1]}"/></linearGradient></defs><rect width="160" height="100" fill="url(#${id})"/>${sun}${ART[theme] || ART.hill}${dim}</svg>`;
  }
  const stageI = () => (typeof petStageIndex === "function" ? petStageIndex(totalKm()) : 0);
  function card(e, isNew) {
    const th = themeOf(e.t);
    return `<button class="pj-card" data-theme="${th}" data-id="${esc(e.t.id)}" aria-label="${esc(e.t.name)}">${cardArt(th, todOf(e.first))}
      <span class="pj-stamp">${typeof PET_ART !== "undefined" ? PET_ART.svg(stageI()) : ""}</span>${isNew ? `<span class="pj-new">${T("新")}</span>` : ""}
      <span class="pj-cap"><b class="pj-name">${esc(e.t.name)}</b><span class="pj-meta">${esc(e.t.region || "")}・${fmt(e.first)}${e.n > 1 ? `・×${e.n}` : ""}</span></span></button>`;
  }

  // ── 縣市方格地圖 ──
  function tileMap(got) {
    const tiles = Object.entries(TILE).map(([name, [c, r, code]]) => {
      const reg = REGIONS.find(([, l]) => l.includes(name))[0], on = got.has(name);
      const lbl = cjk() ? (SHORT[name] || name.replace(/[市縣]$/, "")) : code;
      return `<span class="pj-tile${on ? " on" : ""}" style="grid-column:${c + 1};grid-row:${r + 1};${on ? `--rc:${REGION_COLOR[reg]}` : ""}" title="${esc(name)}">${esc(lbl)}</span>`;
    }).join("");
    return `<div class="pj-map" role="img" aria-label="${T("走過的縣市")} ${got.size}/22">${tiles}</div>`;
  }
  function regionRows(got) {
    const regs = regions(), st = stageI();
    return REGIONS.map(([r, list]) => {
      const n = list.filter(c => got.has(c)).length, has = regs.has(r), id = REGION_HAT[r];
      return `<div class="pj-rrow${has ? " on" : ""}" style="--rc:${REGION_COLOR[r]}">
        <div class="hat-prev">${typeof PET_ART !== "undefined" ? PET_ART.svg(st, "", id) : ""}</div>
        <div class="pj-rtxt"><b>${T(r)}</b><span>${T(PET_ART.HAT_LABEL[id])}${has ? "" : `・${T("走過這個地區的步道就會解鎖")}`}</span>
          <div class="pj-rbar"><i style="width:${Math.round(n / list.length * 100)}%"></i></div></div>
        <span class="pj-rn">${n}<small>/${list.length}</small></span></div>`;
    }).join("");
  }

  // ── 夥伴頁區塊 ──
  function render() {
    const box = document.getElementById("petJourney"); if (!box) return;
    if (!pro()) {   // PRO 功能：免費版只放一張說明卡，點了開升級面板
      box.innerHTML = `<div class="section-title pj-title">${icon("map")} ${T("夥伴的旅行")} <span class="pro-tag">PRO</span></div>
        <button class="pj-wrap pj-locked" id="pjPro"><span class="pj-lock-art">${cardArt("peak", "dawn")}${cardArt("sea", "day")}</span><span class="pj-lock-t">${T("走過的步道變成明信片，走遍各地區解鎖當地配件")}</span></button>`;
      box.querySelector("#pjPro").addEventListener("click", () => { if (typeof _proGate === "function") _proGate(); });
      return;
    }
    const w = walked(), got = counties(), sn = seen();
    const nNew = w.filter(e => !sn.has(String(e.t.id))).length;
    const cards = w.length
      ? `<div class="pj-strip">${w.slice(0, 8).map(e => card(e, !sn.has(String(e.t.id)))).join("")}</div>`
      : `<div class="pj-empty">${T("走完一條步道，夥伴就會帶回一張明信片")}</div>`;
    box.innerHTML = `<div class="section-title pj-title">${icon("map")} ${T("夥伴的旅行")}</div>
      <div class="pj-wrap">
        <div class="pj-stats">
          <button class="pj-stat" id="pjCards"><b>${w.length}${nNew ? `<em class="pj-dot">+${nNew}</em>` : ""}</b><span>${T("明信片")}</span></button>
          <button class="pj-stat" id="pjRegions"><b>${got.size}<small>/22</small></b><span>${T("走過的縣市")}</span></button>
          <button class="pj-stat" id="pjHats"><b>${regions().size}<small>/5</small></b><span>${T("地區配件")}</span></button>
        </div>
        ${cards}
      </div>`;
    box.querySelector("#pjCards").addEventListener("click", () => openAlbum("cards"));
    box.querySelector("#pjRegions").addEventListener("click", () => openAlbum("regions"));
    box.querySelector("#pjHats").addEventListener("click", () => openAlbum("regions"));
    box.querySelectorAll(".pj-strip .pj-card").forEach(c => c.addEventListener("click", () => openCard(c.dataset.id)));
  }
  const rerender = () => { try { render(); } catch (e) { /* */ } };

  // ── 相簿：明信片（依地區分組）／走過的地區（方格地圖＋五區進度＋配件） ──
  function openAlbum(tab) {
    if (!pro()) { if (typeof _proGate === "function") _proGate(); return; }
    if (document.querySelector('[data-ov="pjalbum"]')) return;
    const w = walked(), got = counties(), sn = seen();
    const groups = REGIONS.map(([r]) => [r, w.filter(e => regionOf(e.t) === r)]).filter(([, l]) => l.length);
    const cardsHtml = w.length
      ? groups.map(([r, l]) => `<div class="pj-gh" style="--rc:${REGION_COLOR[r]}"><b>${T(r)}</b><span>${l.length}</span></div><div class="pj-grid">${l.map(e => card(e, !sn.has(String(e.t.id)))).join("")}</div>`).join("")
      : `<div class="pj-empty">${T("走完一條步道，夥伴就會帶回一張明信片")}</div>`;
    const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "pjalbum";
    ov.innerHTML = `<div class="pet-modal-card pj-album"><button class="sheet-close" id="pjClose" aria-label="${T("關閉")}">${icon("x")}</button>
      <h2>${icon("map")} ${T("夥伴的旅行")}</h2>
      <div class="seg pj-seg" role="tablist"><button class="seg-btn${tab !== "regions" ? " on" : ""}" data-t="cards" role="tab">${T("明信片")} <small>${w.length}</small></button><button class="seg-btn${tab === "regions" ? " on" : ""}" data-t="regions" role="tab">${T("走過的縣市")} <small>${got.size}/22</small></button></div>
      <div class="pj-pane" data-p="cards"${tab === "regions" ? " hidden" : ""}>${cardsHtml}</div>
      <div class="pj-pane" data-p="regions"${tab === "regions" ? "" : " hidden"}>${tileMap(got)}<p class="dex-intro">${T("走過那個地區的步道就會解鎖，在裝扮裡換上")}</p><div class="pj-rlist">${regionRows(got)}</div></div>
    </div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); rerender(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#pjClose" });
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#pjClose").addEventListener("click", close);
    ov.querySelectorAll(".pj-seg .seg-btn").forEach(b => b.addEventListener("click", () => {
      ov.querySelectorAll(".pj-seg .seg-btn").forEach(x => x.classList.toggle("on", x === b));
      ov.querySelectorAll(".pj-pane").forEach(p => { p.hidden = p.dataset.p !== b.dataset.t; });
    }));
    ov.querySelectorAll(".pj-grid .pj-card").forEach(c => c.addEventListener("click", () => openCard(c.dataset.id)));
    if (tab !== "regions") markSeen(w.map(e => e.t.id));   // 打開明信片簿＝都看過了
  }

  // ── 單張明信片：點一下翻面（正面插畫／背面夥伴寫的話＋郵戳＋走了幾次） ──
  function openCard(id) {
    if (!pro()) { if (typeof _proGate === "function") _proGate(); return; }
    const e = walked().find(x => String(x.t.id) === String(id)); if (!e) return;
    if (document.querySelector('[data-ov="pjcard"]')) return;
    markSeen([e.t.id]);
    const th = themeOf(e.t), nm = typeof petName === "function" && petName() ? petName() : T(PET_STAGES[stageI()].n);
    const ov = document.createElement("div"); ov.className = "pet-modal pj-card-ov"; ov.dataset.ov = "pjcard";
    ov.innerHTML = `<div class="pj-flip" role="button" tabindex="0" aria-label="${esc(e.t.name)}">
      <div class="pj-face pj-front">${cardArt(th, todOf(e.first))}<span class="pj-stamp big">${typeof PET_ART !== "undefined" ? PET_ART.svg(stageI()) : ""}</span><span class="pj-front-n">${esc(e.t.name)}</span></div>
      <div class="pj-face pj-back">
        <div class="pj-post"><span class="pj-pm">${esc((e.t.region || "").replace(/[市縣]$/, ""))}<br><small>${fmt(e.first)}</small></span><span class="pj-stamp">${typeof PET_ART !== "undefined" ? PET_ART.svg(stageI()) : ""}</span></div>
        <p class="pj-note">${T(NOTE[th] || NOTE.hill)}</p>
        <p class="pj-sign">— ${esc(nm)}</p>
        <div class="pj-facts"><span>${icon("footprints")} ${e.n} ${T("次")}</span><span>${icon("route")} ${e.km.toFixed(1)} km</span>${e.n > 1 ? `<span>${icon("calendar")} ${fmt(e.last)}</span>` : ""}</div>
        <button class="btn primary pj-go" id="pjGo">${T("看這條步道")}</button>
      </div></div>
      <button class="sheet-close pj-cclose" id="pjCClose" aria-label="${T("關閉")}">${icon("x")}</button>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); rerender(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#pjCClose" });
    const flip = ov.querySelector(".pj-flip");
    const turn = () => flip.classList.toggle("turned");
    flip.addEventListener("click", ev => { if (ev.target.closest("#pjGo")) return; turn(); });
    flip.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); turn(); } });
    ov.addEventListener("click", ev => { if (ev.target === ov) close(); });
    ov.querySelector("#pjCClose").addEventListener("click", close);
    ov.querySelector("#pjGo").addEventListener("click", () => {
      close(); const al = document.querySelector('[data-ov="pjalbum"]'); if (al) al.remove();
      if (typeof openDetail === "function") openDetail(e.t.id);
    });
    setTimeout(() => flip.classList.add("turned"), 650);   // 先看正面一眼，再自動翻到背面
  }

  return { walked, themeOf, regionOf, regions, counties, regionHats, hatRegion, decor, render, openAlbum, openCard, cardArt, seen, markSeen, REGION_HAT, TILE };
})();
