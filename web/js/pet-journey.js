// 夥伴的旅行（PRO）：讓夥伴跟「真的走過的步道」綁在一起。全部從紀錄推出來——不另外存狀態，
// 換手機還原紀錄後自動回來，刪掉紀錄也跟著消失，不會有對不起來的數字。存的只有「哪幾張看過了」（新卡片的小標）
// 和「那時候的夥伴」（tt_pj_snap：第一次去的時候夥伴是哪一階、戴什麼、叫什麼——郵票定格在那一刻，之後進化也不會變）。
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
      const e = m.get(t.id) || { t, first: r.date, last: r.date, n: 0, km: 0, dates: [], km1: 0 };
      e.n++; e.km += r.distanceKm || 0; e.dates.push(r.date);
      if (r.date <= e.first) e.km1 = r.distanceKm || 0;
      if (r.date < e.first) e.first = r.date;
      if (r.date > e.last) e.last = r.date;
      m.set(t.id, e);
    }
    for (const e of m.values()) e.dates.sort();
    return [...m.values()].sort((a, b) => (a.first < b.first ? 1 : -1));
  }

  // ── 那時候的夥伴（郵票定格）──
  // 第一次去的那天夥伴是哪一階：兩天內的新卡片＝現在的樣子（含帽子、名字，最準）；
  // 以前走的（功能上線前就有的紀錄）用「到那天為止累積的里程」推回去（帽子不知道就不戴）。存起來之後就不再變。
  function snaps() { try { const o = JSON.parse(localStorage.getItem("tt_pj_snap")); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
  function snapOf(e) {
    const all = snaps(), id = String(e.t.id), old = all[id];
    if (old && old.d === e.first) return old;   // 有更早的紀錄補進來（例如同步）才重算
    const cur = stageI();
    let st = cur, hat = "none", nm = typeof petName === "function" ? petName() : "";
    if (Date.now() - new Date(e.first).getTime() < 2 * 864e5) { if (typeof petHat === "function") hat = petHat(); }
    else {
      const R = recs(), sum = R.reduce((a, r) => a + (r.distanceKm || 0), 0), life = (typeof Store !== "undefined" && Store.life && Store.life().km) || 0;
      const lost = Math.max(0, life - sum);   // 被容量保護砍掉的舊紀錄：一定比現存的都早
      const km = R.filter(r => r.date <= e.first).reduce((a, r) => a + (r.distanceKm || 0), 0) + lost + (typeof debugKm === "function" ? debugKm() : 0);
      st = Math.min(cur, typeof petStageIndex === "function" ? petStageIndex(Math.max(0, km - (typeof petBase === "function" ? petBase() : 0))) : cur);
    }
    const s = { d: e.first, s: st, h: hat, n: nm };
    all[id] = s;
    try { localStorage.setItem("tt_pj_snap", JSON.stringify(all)); } catch (err) { /* 滿了就只是不定格 */ }
    return s;
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

  // ── 明信片插畫：postcard-art.js（7 主題 × 3 構圖、時段色票、季節）；舊的平面版只在它沒載到時用 ──
  function todOf(iso) { return typeof ArtKit !== "undefined" ? ArtKit.todOf(iso) : "day"; }
  function cardArt(theme, first, id) {
    if (typeof PostcardArt !== "undefined") return PostcardArt.draw(id || theme, theme, first);
    return `<svg class="pj-art" viewBox="0 0 160 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="100" fill="#cfe6d2"/></svg>`;
  }
  const stageI = () => (typeof petStageIndex === "function" ? petStageIndex(totalKm()) : 0);

  // ── 郵票與郵戳（2026-10-04：定格，不跟著現在的夥伴變）──
  // 郵票：齒孔邊、主題色框、那時候的夥伴（不動）、面額＝那天走的公里數、縣市代碼。
  // 郵戳：雙圈，上緣縣市、中間日期、下緣時段（日／晨昏／月）；角度、位置、墨色都由步道 id 決定（每次畫都一樣）。
  const INK = { fall: "#2f5f8a", sea: "#24648f", old: "#8a3b2e", forest: "#2f6a42", lake: "#3d5f8f", peak: "#5a4a8a", hill: "#7a4a2a" };
  const FRAME = { fall: "#7fb6d9", sea: "#6fb0d6", old: "#d6a46a", forest: "#8cc08a", lake: "#8fb4dc", peak: "#b4a6dc", hill: "#d9b77a" };
  let SU = 0;
  const hsh = v => (typeof ArtKit !== "undefined" ? ArtKit.hash(v) : 7);
  const ymd = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
  function stamp(e, big) {
    const sn = snapOf(e), th = themeOf(e.t), id = "pjs" + (++SU), code = (TILE[e.t.region] || [])[2] || "TW";
    let holes = ""; for (let k = 0; k <= 8; k++) { const x = 3 + k * 6.75; holes += `<circle cx="${x}" cy="0" r="2.1"/><circle cx="${x}" cy="72" r="2.1"/>`; }
    for (let k = 1; k < 10; k++) { const y = k * 7.2; holes += `<circle cx="0" cy="${y}" r="2.1"/><circle cx="60" cy="${y}" r="2.1"/>`; }
    const pet = typeof PET_ART !== "undefined" ? PET_ART.svg(sn.s, "", sn.h).replace(/^<svg class="pet-critter[^"]*"/, '<svg x="9" y="11" width="42" height="42"') : "";
    const rot = (hsh(e.t.id) % 9) - 4;
    return `<span class="pj-stamp${big ? " big" : ""}" style="--r:${rot}deg"><svg viewBox="0 0 60 72" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <mask id="${id}"><rect width="60" height="72" fill="#fff"/><g fill="#000">${holes}</g></mask>
      <g mask="url(#${id})"><rect width="60" height="72" fill="#fffdf6"/><rect x="5" y="5" width="50" height="62" rx="1.5" fill="${FRAME[th] || FRAME.hill}" opacity=".35"/>
      <rect x="5" y="5" width="50" height="62" rx="1.5" fill="none" stroke="${INK[th] || INK.hill}" stroke-width="1.2" opacity=".7"/></g>
      ${pet}<text x="8" y="63" font-size="7.5" font-weight="800" fill="${INK[th] || INK.hill}">${(e.km1 || 0).toFixed(1)}<tspan font-size="5.5"> km</tspan></text>
      <text x="52" y="63" font-size="6" font-weight="700" text-anchor="end" fill="${INK[th] || INK.hill}" opacity=".8">${code}</text></svg></span>`;
  }
  function todGlyph(t, col) {
    if (t === "night") return `<path d="M3 -3.5 a4 4 0 1 0 0 7 a3.1 3.1 0 1 1 0 -7Z" fill="${col}"/>`;
    if (t === "dawn" || t === "dusk") return `<path d="M-5 1.5 h10 M-3.5 1.5 a3.5 3.5 0 0 1 7 0" stroke="${col}" stroke-width="1.3" fill="none"/>`;
    return `<circle r="2.6" fill="${col}"/><path d="M0 -5 v1.3 M0 5 v-1.3 M-5 0 h1.3 M5 0 h-1.3 M-3.5 -3.5 l.9 .9 M3.5 3.5 l-.9 -.9 M-3.5 3.5 l.9 -.9 M3.5 -3.5 l-.9 .9" stroke="${col}" stroke-width="1"/>`;
  }
  function postmark(e, iso, k) {
    const th = themeOf(e.t), col = INK[th] || INK.hill, h = hsh(String(e.t.id) + "|" + k), id = "pjm" + (++SU);
    const place = cjk() ? (e.t.region || "").replace(/[市縣]$/, "") : ((TILE[e.t.region] || [])[2] || "");
    const rot = (h % 36) - 18, tod = todOf(iso);
    return `<span class="pj-mark" style="--r:${rot}deg;--k:${k}"><svg viewBox="0 0 96 60" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${col}" opacity=".78">
      <circle cx="30" cy="30" r="25" stroke-width="2.2"/><circle cx="30" cy="30" r="17.5" stroke-width="1.1"/>
      <path d="M58 20 q6 -4 12 0 t12 0 t12 0 M58 30 q6 -4 12 0 t12 0 t12 0 M58 40 q6 -4 12 0 t12 0 t12 0" stroke-width="2"/></g>
      <path id="${id}" d="M9 30 a21 21 0 0 1 42 0" fill="none"/>
      <text font-size="8" font-weight="800" fill="${col}" opacity=".85" letter-spacing="1"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(place)}</textPath></text>
      <text x="30" y="33" font-size="7.2" font-weight="800" text-anchor="middle" fill="${col}" opacity=".85">${ymd(iso)}</text>
      <g transform="translate(30 44)" opacity=".85">${todGlyph(tod, col)}</g></svg></span>`;
  }
  // 每一趟一個郵戳（最多 3 個，第一趟在最上面）
  const marks = (e, n) => e.dates.slice(0, n).map((d, k) => postmark(e, d, k)).join("");
  function card(e, isNew) {
    const th = themeOf(e.t);
    return `<button class="pj-card" data-theme="${th}" data-id="${esc(e.t.id)}" aria-label="${esc(T(e.t.name))}">${cardArt(th, e.first, e.t.id)}
      ${stamp(e)}${isNew ? `<span class="pj-new">${T("新")}</span>` : ""}
      <span class="pj-cap"><b class="pj-name">${esc(T(e.t.name))}</b><span class="pj-meta">${esc(T(e.t.region || ""))}・${fmt(e.first)}${e.n > 1 ? `・×${e.n}` : ""}</span></span></button>`;
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
        <button class="pj-wrap pj-locked" id="pjPro"><span class="pj-lock-art">${cardArt("peak", "2026-01-10T06:30:00", "demo-a")}${cardArt("sea", "2026-07-10T10:00:00", "demo-b")}</span><span class="pj-lock-t">${T("走過的步道變成明信片，走遍各地區解鎖當地配件")}</span></button>`;
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
    const th = themeOf(e.t), sn = snapOf(e), stN = T(PET_STAGES[sn.s].n), nm = sn.n || stN;
    const ov = document.createElement("div"); ov.className = "pet-modal pj-card-ov"; ov.dataset.ov = "pjcard";
    ov.innerHTML = `<div class="pj-flip" role="button" tabindex="0" aria-label="${esc(T(e.t.name))}">
      <div class="pj-face pj-front">${cardArt(th, e.first, e.t.id)}${stamp(e, true)}<span class="pj-marks front">${marks(e, 1)}</span><span class="pj-front-n">${esc(T(e.t.name))}</span></div>
      <div class="pj-face pj-back">
        <div class="pj-post"><span class="pj-marks">${marks(e, 3)}</span>${stamp(e)}</div>
        <p class="pj-note">${T(NOTE[th] || NOTE.hill)}</p>
        <p class="pj-sign">— ${esc(nm)}<small>${sn.n ? `${esc(stN)} ` : ""}Lv.${sn.s + 1}</small></p>
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

  return { snapOf, walked, themeOf, regionOf, regions, counties, regionHats, hatRegion, decor, render, openAlbum, openCard, cardArt, seen, markSeen, REGION_HAT, TILE };
})();
