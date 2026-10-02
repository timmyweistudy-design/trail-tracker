// 外觀與介面設定（從 app.js 拆出，2026-10）：外觀主題（淺色／深色／陽光高對比）、字體大小、配色、無障礙彈窗工具…。
// 一般 script，和 app.js 共用全域；載入順序在 detail.js 之後。
// ---------- 外觀主題 ----------
// 只有三種：light（淺色）／dark（深色，晚上與夜爬用：地圖壓暗、畫面帶一點暖橘、不刺眼）／sun（陽光高對比：強制淺色＋加粗）
// 以前分兩排共六個選項（淺色／深色／跟隨系統＋標準／陽光／紅光），重複又難懂 → 合併。舊設定在 themeMode() 自動換過來。
function themeMode() {
  let t = null, v = null;
  try { t = localStorage.getItem("tt_theme"); v = localStorage.getItem("tt_vis"); } catch (e) { /* */ }
  if (v) {   // 舊版的戶外顯示：紅光→深色、陽光→陽光高對比
    t = v === "red" ? "dark" : v === "sun" ? "sun" : t;
    try { localStorage.removeItem("tt_vis"); if (t) localStorage.setItem("tt_theme", t); } catch (e) { /* */ }
  }
  if (t === "auto") {   // 舊版「跟隨系統」：照當下手機的深淺色定下來
    t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    try { localStorage.setItem("tt_theme", t); } catch (e) { /* */ }
  }
  return t === "dark" || t === "sun" ? t : "light";
}
function applyTheme(mode) {
  if (mode !== "dark" && mode !== "sun") mode = "light";
  const dark = mode === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  if (mode === "sun") document.documentElement.setAttribute("data-vis", "sun"); else document.documentElement.removeAttribute("data-vis");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#13160f" : "#16301f");
  document.querySelectorAll("[data-theme-opt]").forEach(b => { const on = b.dataset.themeOpt === mode; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}
function setTheme(mode) {
  try { localStorage.setItem("tt_theme", mode); } catch (e) { /* */ }
  applyTheme(mode);
}
if (typeof window !== "undefined") { window.setTheme = setTheme; window.themeMode = themeMode; }
// 其他地方（例如天黑提示）放的「切到深色」鈕：data-set-theme="dark"
document.addEventListener("click", e => { const b = e.target.closest("[data-set-theme]"); if (!b) return; setTheme(b.dataset.setTheme); toast(ttT("切到深色了：地圖變暗、畫面不刺眼")); });
// 季節點綴色（春櫻/夏綠/秋楓/冬雪）：沒選 PRO 主題配色時的預設 --accent
function applySeason() {
  const m = new Date().getMonth() + 1;
  const col = m >= 3 && m <= 5 ? "#d2799a" : m >= 6 && m <= 8 ? "#3f8f6a" : m >= 9 && m <= 11 ? "#c2683d" : "#5a86b0";
  document.documentElement.style.setProperty("--accent", col);
}
// PRO 主題配色：一次覆蓋整組品牌色（--brand 家族 + --accent），讓「整個 App」換色而不是只有幾個字變色。
// 實際色值定義在 CSS 的 html[data-palette="X"]（含淺／深色兩版）；這裡只負責存鍵值與切換 data-palette。
const PALETTES = [   // 加上「森綠」預設共 9 個 → 設定頁排成整齊的 3×3
  ["ocean", "海洋", "#1f6390", "#d98a3d"],
  ["teal", "青碧", "#17807a", "#d98a3d"],
  ["twilight", "暮紫", "#6a4fa3", "#d38bb0"],
  ["maple", "楓紅", "#b0492f", "#cc9a3d"],
  ["coral", "珊瑚", "#c85a45", "#3f8f6a"],
  ["amber", "琥珀", "#a67c1e", "#3f8f6a"],
  ["rose", "玫瑰", "#b0426e", "#6b8fc2"],
  ["slate", "石墨", "#45566a", "#c2683d"],
];
function applyPalette() {
  const root = document.documentElement;
  const key = localStorage.getItem("tt_palette");
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const valid = pro && key && PALETTES.some(p => p[0] === key);
  if (valid) { root.dataset.palette = key; root.style.removeProperty("--accent"); }   // 交給 CSS 整組換色；清掉季節 inline accent 才不會蓋過 palette
  else { delete root.dataset.palette; applySeason(); }
}
if (typeof window !== "undefined") window.applyPalette = applyPalette;
// PRO 徽章配色（會員）：套用到自己的 PRO 標籤
const PRO_STYLES = [["#ffe07a", "#f0a91e", "#5a3a00", "金"], ["#dfe4ea", "#9aa3ad", "#2a2f36", "銀"], ["#7be0a3", "#2faa6b", "#0c3d24", "翡翠"], ["#ff9a9a", "#e0444f", "#5a0f14", "紅寶"], ["#9ec2ff", "#4f7fe0", "#0f1f4a", "藍寶"], ["#ffb3d1", "#e060a0", "#5a1338", "玫瑰"]];
const PRO_FRAMES = [["#f0a91e", "金"], ["#9aa3ad", "銀"], ["#2faa6b", "翡翠"], ["#e0444f", "紅寶"], ["#4f7fe0", "藍寶"], ["#e060a0", "玫瑰"], ["#2c5d3f", "松綠"]];
function applyProColor() {
  const r = document.documentElement.style;
  const s = PRO_STYLES[+(localStorage.getItem("tt_pro_color") || 0)] || PRO_STYLES[0];
  r.setProperty("--pro-c1", s[0]); r.setProperty("--pro-c2", s[1]); r.setProperty("--pro-ink", s[2]);
  const f = PRO_FRAMES[+(localStorage.getItem("tt_pro_frame") || 0)] || PRO_FRAMES[0];
  r.setProperty("--pro-f", f[0]);
}
function renderProColor() {
  const el = $("#proColorWrap"); if (!el) return;
  if (!(typeof Premium !== "undefined" && Premium.isOn())) { el.innerHTML = ""; return; }
  const cb = +(localStorage.getItem("tt_pro_color") || 0), cf = +(localStorage.getItem("tt_pro_frame") || 0);
  // 選中：兩排都用同一種外圈＋勾勾圖示（以前一個是細框、一個是文字「✓」）
  el.innerHTML = `<div class="accent-head">${ttT("PRO 徽章配色")}</div>
    <div class="proc-row">${PRO_STYLES.map((s, i) => `<button class="proc-sw${i === cb ? " on" : ""}" data-b="${i}" title="${ttT(s[3])}" aria-label="${ttT(s[3])}" aria-pressed="${i === cb}" style="background:linear-gradient(135deg,${s[0]},${s[1]});color:${s[2]}">PRO</button>`).join("")}</div>
    <div class="accent-head">${ttT("頭像框配色")}</div>
    <div class="proc-row">${PRO_FRAMES.map((s, i) => `<button class="acc-sw frame-sw${i === cf ? " on" : ""}" data-f="${i}" title="${ttT(s[1])}" aria-label="${ttT(s[1])}" aria-pressed="${i === cf}" style="box-shadow:0 0 0 3px ${s[0]} inset;color:${s[0]}">${i === cf ? ic("check") : ""}</button>`).join("")}</div>`;
  el.querySelectorAll(".proc-sw[data-b]").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pro_color", b.dataset.b); applyProColor(); renderProColor();
    if (typeof toast === "function") toast(ttT("已套用徽章配色"));
  }));
  el.querySelectorAll(".frame-sw[data-f]").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pro_frame", b.dataset.f); applyProColor(); renderProColor();
    if (typeof toast === "function") toast(ttT("已套用頭像框配色"));
  }));
}
// 共用個人卡頭部（「我的」頁與社群頁同一設計；chip 會 flex-wrap，放大字級也不跑版）
function ttProfileHero(prof, opts) {
  opts = opts || {};
  const esc = s => (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const ps = (typeof petStats === "function") ? petStats() : null;
  const lvl = ps ? ps.level : 0;
  const av = prof.avatar_url
    ? `<img class="prof-av${pro ? " pro-av" : ""}" src="${esc(prof.avatar_url)}" alt="">`
    : `<div class="prof-av prof-av-ph${pro ? " pro-av" : ""}">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
  let title = "";
  try { if (typeof achScore === "function") { const s = achScore(); const ci = (typeof ACH_TIER_IC !== "undefined" && typeof ic === "function") ? ic(ACH_TIER_IC[s.rankIdx]) : ""; title = `<span class="prof-title rkt-${s.rankIdx}">${ci} ${ttT(s.rank)}</span>`; } } catch (e) { /* */ }
  const lvChip = lvl ? `<span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span>` : "";
  // Lv 與寵物一組
  const petHtml = ps ? `<div class="prof-pet">${lvChip}${typeof PET_ART !== "undefined" ? PET_ART.svg((ps.level || 1) - 1) : ps.emoji}<span class="prof-pet-t">${esc(petName() ? ps.name : ttT(ps.name))} · ${ttT("已走")} <b>${ps.km}</b> km</span></div>` : (lvChip ? `<div class="prof-pet">${lvChip}</div>` : "");
  let ach = "";
  if (opts.ach !== false) { try { if (typeof achScore === "function") { const s = achScore(); ach = `<button class="prof-ach" data-prof-ach="1" aria-label="${ttT("成就")} ${s.got}/${s.total} · ${ttT("成就分數")} ${s.score}">${ic("medal")} <b>${s.got}/${s.total}</b> · <b>${s.score}</b> ›</button>`; } } catch (e) { /* */ } }
  // 稱號與成就一組
  const achRow = (title || ach) ? `<div class="prof-achrow">${title}${ach}</div>` : "";
  return `<div class="prof-hero">${av}
    <div class="prof-hero-info">
      <div class="prof-name"><span class="prof-nm">${esc(prof.display_name || prof.handle)}</span>${pro ? ` <span class="pro-tag pro-id pro-mine">PRO</span>` : ""}</div>
      <div class="prof-handle">@${esc(prof.handle)}</div>
      ${petHtml}${achRow}
    </div>
  </div>`;
}
function bindProfAch(root) {
  (root || document).querySelectorAll('[data-prof-ach]').forEach(b => b.onclick = () => { const t = document.querySelector('.tab[data-view="pet"]'); if (t) t.click(); setTimeout(() => { if (typeof openAchTree === "function") openAchTree(); }, 260); });
}
if (typeof window !== "undefined") { window.ttProfileHero = ttProfileHero; window.bindProfAch = bindProfAch; }
// #8 modal 無障礙：dialog 語意＋Escape 關閉＋Tab 焦點鎖在 modal 內＋關閉後焦點歸位
function ttModalA11y(overlay, closeFn, opts) {
  if (!overlay) return () => { };
  opts = opts || {};
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const prev = document.activeElement;
  const focusables = () => [...overlay.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  const first = opts.focus ? overlay.querySelector(opts.focus) : focusables()[0];
  // 用手指／滑鼠打開的彈窗：焦點移進去但不畫焦點框（以前一打開關閉鈕就套著一圈綠框）；用鍵盤打開才畫
  if (first) setTimeout(() => { try { first.focus({ focusVisible: !!window.__ttKbd }); } catch (e) { /* */ } }, 40);
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); if (closeFn) closeFn(); return; }
    if (e.key !== "Tab") return;
    const f = focusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }
  overlay.addEventListener("keydown", onKey);
  return () => { overlay.removeEventListener("keydown", onKey); try { prev && prev.focus && prev.focus(); } catch (e) { /* */ } };
}
if (typeof window !== "undefined") window.ttModalA11y = ttModalA11y;
// 全域 Escape：關掉最上層的 [data-ov] 動態面板（成就 modal 自己已 preventDefault，這裡略過已處理的）
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (document.querySelector(".ttdlg-ov")) return;   // 確認框自己會收（以前 Esc 取消確認框時，底下的面板也跟著被關／返回）
  const ovs = [...document.querySelectorAll("[data-ov]")].filter(m => m.getClientRects().length > 0);   // 不能用 offsetParent：覆蓋層是 position:fixed，offsetParent 永遠是 null，以前 Esc 一個都關不掉
  if (!ovs.length) return;
  const top = ovs[ovs.length - 1];
  const btn = top.querySelector('.sheet-close, .lb-close, .lb-x, .comp-x, [id$="Close"], button[aria-label="關閉"], button[aria-label="Close"]');
  if (btn) { e.preventDefault(); btn.click(); }
});
// 「我的」頂部：夥伴＋今年走了多少（沒登入也有個主角，不再一打開就是一條登入提示）
function meYearCard(loginHint) {
  const y = new Date().getFullYear(), recs = realRecords().filter(r => new Date(r.date).getFullYear() === y);
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const ps = typeof petStats === "function" ? petStats() : null;
  const art = (ps && typeof PET_ART !== "undefined") ? PET_ART.svg(ps.level - 1) : "";
  let rank = ""; try { const sc = achScore(); rank = `<button class="prof-ach" data-prof-ach="1">${ic(ACH_TIER_IC[sc.rankIdx])} ${ttT(sc.rank)} ›</button>`; } catch (e) { /* */ }
  return `<div class="me-card me-year">
    <div class="my-pet">${art}</div>
    <div class="my-body">
      <div class="my-h">${(() => { try { return new Intl.DateTimeFormat(ttLocale(), { year: "numeric" }).format(new Date()); } catch (e) { return y + " 年"; } })()}</div>
      <div class="my-big"><b>${km.toFixed(1)}</b> km<span>・${ttCount(recs.length, "trip")}</span></div>
      <div class="my-sub">${rank}</div>
    </div>
  </div>${loginHint ? `<button class="me-login" id="meCardLogin">${ic("backup")} ${loginHint} ›</button>` : ""}`;
}
// 我的分頁頂端：社群個人檔案摘要（頭像/名字/稱號/handle/寵物里程/成就）
async function renderMeProfileCard() {
  const el = $("#meProfileCard"); if (!el) return;
  if (typeof Supa === "undefined" || !Supa.ready() || typeof Auth === "undefined") { el.innerHTML = ""; return; }
  const sess = await Auth.session().catch(() => null);
  // 社群功能關掉時：登入只為了雲端備份，登入後這張卡就不用出現了
  if (socialHidden() || !sess) {
    el.innerHTML = meYearCard(sess ? "" : (socialHidden() ? ttT("登入一下，之後每趟都自動備份到雲端") : ttT("登入社群，看到自己的個人檔案")));
    const b = $("#meCardLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); });
    bindProfAch(el);
    return;
  }
  const prof = await Auth.myProfile().catch(() => null);
  if (!prof) { el.innerHTML = `<div class="me-card me-card-guest" id="meCardLogin">${ttT("完成社群註冊以顯示個人檔案 ›")}</div>`; const b = $("#meCardLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }); return; }
  el.innerHTML = `<div class="me-card">${ttProfileHero(prof)}</div>`;
  bindProfAch(el);
}
// 社群功能開關（我的 → 外觀）：關掉＝收起社群分頁、小隊、揪團、分享到社群、好友比較、好友的夥伴。
// 只是藏入口，資料與登入都在（雲端備份仍要登入）。狀態存 tt_hide_social，開機時 index.html 就先套 class。
function socialHidden() { return document.documentElement.classList.contains("hide-social"); }
(function wireSocialToggle() {
  const cb = document.getElementById("socialToggle"); if (!cb) return;
  cb.checked = !socialHidden();
  cb.addEventListener("change", () => {
    const hide = !cb.checked;
    try { localStorage.setItem("tt_hide_social", hide ? "1" : "0"); } catch (e) { /* */ }
    document.documentElement.classList.toggle("hide-social", hide);
    renderMeProfileCard();
    toast(hide ? ttT("社群功能已收起") : ttT("社群功能回來了"));
  });
})();
// 健行提醒開關（只在原生 App 顯示；網頁版沒有本地排程通知外掛）
function renderReminderToggle() {
  const el = $("#reminderWrap"); if (!el) return;
  if (typeof Reminders === "undefined" || !Reminders.available()) { el.innerHTML = ""; return; }
  const isOn = Reminders.on();
  el.innerHTML = `<div class="accent-head" style="margin-top:16px">${ttT("健行提醒")}</div>
    <label class="sim-toggle"><input type="checkbox" id="reminderToggle" ${isOn ? "checked" : ""}> ${ttT("提醒我保持連續天數、每週看足跡回顧")}</label>`;
  const cb = el.querySelector("#reminderToggle");
  if (cb) cb.addEventListener("change", async () => {
    if (cb.checked) { const ok = await Reminders.enable(); cb.checked = ok; if (ok && typeof toast === "function") toast(ttT("已開啟健行提醒")); }
    else { await Reminders.disable(); if (typeof toast === "function") toast(ttT("已關閉健行提醒")); }
  });
}
if (typeof window !== "undefined") window.renderReminderToggle = renderReminderToggle;
function renderPalette() {
  const row = $("#accentRow"); if (!row) return;
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const cur = localStorage.getItem("tt_palette") || "";
  // 每個色票用「品牌色→點綴色」漸層預覽，暗示選了會整組換色（不是只有一個小圓點）
  const sw = (k, n, b, a) => `<button class="pal-sw${cur === k ? " on" : ""}" data-pal="${k}" title="${n}" style="background:linear-gradient(135deg,${b} 56%,${a})"><span class="pal-nm">${n}</span></button>`;
  row.innerHTML = sw("", ttT("森綠"), "#2c5d3f", "#c2683d")
    + PALETTES.map(p => sw(p[0], ttT(p[1]), p[2], p[3])).join("")
    + (pro ? "" : `<div class="acc-lock">${ttT("升級 Premium 解鎖")}</div>`);
  row.querySelectorAll(".pal-sw").forEach(b => b.addEventListener("click", () => {
    if (!pro) { if (typeof Premium !== "undefined") Premium.openUpgrade(); return; }
    const k = b.dataset.pal;
    if (k) localStorage.setItem("tt_palette", k); else localStorage.removeItem("tt_palette");
    applyPalette(); renderPalette();
    if (typeof toast === "function") toast(ttT("已套用主題配色"));
  }));
}
let _themeBound = false;   // .theme-opt / .fs-opt 是靜態元素：initTheme 在還原備份後會再被呼叫，
                           // 不擋的話每還原一次就多疊一組 click 監聽器
function initTheme() {
  applyPalette();
  applyProColor();
  const mode = themeMode();   // 預設淺色
  applyTheme(mode);
  document.querySelectorAll("[data-theme-opt]").forEach(b => {
    b.classList.toggle("on", b.dataset.themeOpt === mode);
    if (!_themeBound) b.addEventListener("click", () => setTheme(b.dataset.themeOpt));
  });
  // 字體大小（無障礙）：四檔 1.2/1.35/1.5/1.65 → 設 --fs 倍率，只放大文字不動地圖版面
  // （舊值由 index.html 開機腳本遷移到最近的新檔）
  const curFs = (() => { try { return localStorage.getItem("tt_fontscale") || "1.2"; } catch (e) { return "1.2"; } })();
  document.querySelectorAll(".fs-opt").forEach(b => {
    b.classList.toggle("on", b.dataset.fs === curFs);
    if (!_themeBound) b.addEventListener("click", () => {
      try { localStorage.setItem("tt_fontscale", b.dataset.fs); } catch (e) { /* */ }
      document.documentElement.style.setProperty("--fs", b.dataset.fs); document.documentElement.toggleAttribute("data-fs-big", +b.dataset.fs >= 1.5); document.documentElement.toggleAttribute("data-fs-mid", +b.dataset.fs >= 1.35);
      document.querySelectorAll(".fs-opt").forEach(x => x.classList.toggle("on", x === b));
    });
  });
  _themeBound = true;   // 之後再呼叫（雲端還原/匯入備份）只更新選中狀態，不再重複綁定
  // 語言清單（設定頁）：搜尋框 + 可捲動清單（國旗＋原名＋英文名），高度上限避免頁面過長
  const curLang = (typeof I18n !== "undefined") ? I18n.lang() : "zh";
  const row = document.getElementById("langRow");
  if (row) {
    const itemHtml = ([c, f, n, sub]) =>
      `<button class="lang-item${c === curLang ? " on" : ""}" data-lang-opt="${c}" data-search="${(n + " " + sub + " " + c).toLowerCase()}">
        <span class="flag">${f}</span><span class="names"><span class="native">${n}</span>${n === sub ? "" : ` <span class="sub">${sub}</span>`}</span><span class="tick">✓</span>
      </button>`;
    const cur = TT_LANGS.find(x => x[0] === curLang) || TT_LANGS[0], lc = document.getElementById("langCur");
    if (lc) {
      lc.innerHTML = `<span class="lang-cur-n">${cur[2]}${cur[2] === cur[3] ? "" : ` <small>${cur[3]}</small>`}</span><button class="btn ghost lang-change" id="langChange" aria-expanded="false">${ttT("更換")}</button>`;
      const lb = document.getElementById("langChange");
      lb.addEventListener("click", () => { row.hidden = !row.hidden; lb.setAttribute("aria-expanded", row.hidden ? "false" : "true"); if (!row.hidden) { const sr = document.getElementById("langSearch"); if (sr) sr.focus({ preventScroll: true }); } });
    }
    row.innerHTML = `<input type="search" class="lang-search" id="langSearch" placeholder="${ttT("搜尋語言")}" autocomplete="off">
      <div class="lang-scroll" id="langScroll">${TT_LANGS.map(itemHtml).join("")}</div>`;
    const bind = b => b.addEventListener("click", () => {
      if (b.dataset.langOpt !== curLang && typeof I18n !== "undefined") I18n.set(b.dataset.langOpt);
    });
    row.querySelectorAll("[data-lang-opt]").forEach(bind);
    const sc = document.getElementById("langScroll"), sr = document.getElementById("langSearch");
    if (sr) sr.addEventListener("input", () => {
      const q = sr.value.trim().toLowerCase();
      sc.querySelectorAll(".lang-item").forEach(b => { b.style.display = (!q || b.dataset.search.includes(q)) ? "" : "none"; });
      // 目前選中的語言捲到最上，方便看見
      const on = sc.querySelector(".lang-item.on"); if (on && !q) sc.scrollTop = Math.max(0, on.offsetTop - 60);
    });
    const on = sc.querySelector(".lang-item.on"); if (on) sc.scrollTop = Math.max(0, on.offsetTop - 60);
  }
}
// 語言清單單一事實來源（設定頁與首次選擇覆蓋層共用）：[代碼, 國旗, 原名, 英文名]
const TT_LANGS = [
  ["zh", "🇹🇼", "繁體中文", "Traditional Chinese"], ["cn", "🇨🇳", "简体中文", "Simplified Chinese"],
  ["en", "🇬🇧", "English", "English"], ["es", "🇪🇸", "Español", "Spanish"],
  ["ja", "🇯🇵", "日本語", "Japanese"], ["ko", "🇰🇷", "한국어", "Korean"],
  ["fr", "🇫🇷", "Français", "French"], ["de", "🇩🇪", "Deutsch", "German"],
  ["pt", "🇧🇷", "Português", "Portuguese"], ["it", "🇮🇹", "Italiano", "Italian"],
  ["ru", "🇷🇺", "Русский", "Russian"], ["th", "🇹🇭", "ไทย", "Thai"],
  ["vi", "🇻🇳", "Tiếng Việt", "Vietnamese"], ["id", "🇮🇩", "Bahasa Indonesia", "Indonesian"],
  ["tl", "🇵🇭", "Filipino", "Filipino"], ["ms", "🇲🇾", "Bahasa Melayu", "Malay"],
  ["nl", "🇳🇱", "Nederlands", "Dutch"], ["pl", "🇵🇱", "Polski", "Polish"],
  ["tr", "🇹🇷", "Türkçe", "Turkish"], ["hi", "🇮🇳", "हिन्दी", "Hindi"],
  ["my", "🇲🇲", "မြန်မာ", "Burmese"], ["km", "🇰🇭", "ខ្មែរ", "Khmer"],
  ["ne", "🇳🇵", "नेपाली", "Nepali"], ["mn", "🇲🇳", "Монгол", "Mongolian"],
  ["uk", "🇺🇦", "Українська", "Ukrainian"],
];
if (typeof window !== "undefined") window.TT_LANGS = TT_LANGS;
