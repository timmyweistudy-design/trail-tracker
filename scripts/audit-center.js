// 置中排版稽核：找「父層 text-align:center，但子元素是 block/flex 且沒被置中」的元素。
//
// 這類 bug 在畫面上很明顯（按鈕孤零零貼左），但單元測試抓不到，因為它是「算出來的版面」問題。
// 根因幾乎都同一個：全域 `.btn { display:block; width:100% }`，某處覆寫成 `width:auto`
// 卻忘了補 `margin-inline:auto` —— block 元素不吃父層的 text-align:center。
//
// node scripts/audit-center.js [--shot]
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const localLibs = path.join(process.env.HOME, "pw-libs/root/usr/lib/x86_64-linux-gnu");
if (fs.existsSync(localLibs)) process.env.LD_LIBRARY_PATH = localLibs + ":" + (process.env.LD_LIBRARY_PATH || "");
const PORT = 8901;
const SHOT = process.argv.includes("--shot");
const SHOTDIR = path.join(ROOT, "scratchpad", "center-shots");

// 偵測器：在頁面內跑，回傳所有「該置中卻沒置中」的元素
const DETECT = () => {
  const out = [];
  const TOL = 6;          // 左右留白差 ≤6px 視為置中
  const MIN_GAP = 12;     // 元素比父層窄至少 12px 才有「置中與否」的問題
  const skip = new Set(["HTML", "BODY", "SCRIPT", "STYLE", "SVG", "PATH", "BR", "HR"]);
  for (const el of document.querySelectorAll("*")) {
    if (skip.has(el.tagName)) continue;
    const p = el.parentElement;
    if (!p) continue;
    const cs = getComputedStyle(el), ps = getComputedStyle(p);
    if (ps.textAlign !== "center") continue;                 // 父層沒宣告置中 → 不管
    // 父層是 flex/grid 時，子元素位置由 justify-content 決定，text-align 根本不相干。
    // 不排除的話，按鈕裡「圖示在字前面」的 inline-flex 版面會被大量誤報（實測誤報 5 個）。
    if (/flex|grid/.test(ps.display)) continue;
    if (!/^(block|flex|grid)$/.test(cs.display)) continue;    // inline 系會被 text-align 置中，沒問題
    if (cs.position === "absolute" || cs.position === "fixed") continue;  // 絕對定位另有規則
    if (cs.float !== "none") continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (!r.width || !r.height) continue;                      // 沒渲染
    if (r.width < 8 || r.height < 8) continue;
    const padL = parseFloat(ps.paddingLeft) || 0, padR = parseFloat(ps.paddingRight) || 0;
    const innerL = pr.left + padL, innerR = pr.right - padR;
    const innerW = innerR - innerL;
    if (innerW - r.width < MIN_GAP) continue;                 // 幾乎滿版 → 沒有置中問題
    const gapL = r.left - innerL, gapR = innerR - r.right;
    if (Math.abs(gapL - gapR) <= TOL) continue;               // 已置中
    // 有明確的 margin 設定（作者刻意靠邊）就不算 bug；只抓 margin 兩側都是 0/auto 卻沒置中的
    const mL = cs.marginLeft, mR = cs.marginRight;
    const deliberate = (mL !== "0px" && mL !== "auto") || (mR !== "0px" && mR !== "auto");
    if (deliberate) continue;
    const sel = el.tagName.toLowerCase()
      + (el.id ? "#" + el.id : "")
      + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
    out.push({
      kind: "offcenter",
      sel,
      parent: p.tagName.toLowerCase() + (p.id ? "#" + p.id : "")
        + (p.className && typeof p.className === "string" ? "." + p.className.trim().split(/\s+/).slice(0, 3).join(".") : ""),
      text: (el.innerText || "").trim().slice(0, 24),
      display: cs.display, width: Math.round(r.width), inner: Math.round(innerW),
      gapL: Math.round(gapL), gapR: Math.round(gapR),
    });
  }
  return out;
};

// 同一類的版面 bug：元素比容器寬 → 溢出（字被切、按鈕突出卡片外）
const DETECT_OVERFLOW = () => {
  const out = [];
  const TOL = 2;
  const skip = new Set(["HTML", "BODY", "SCRIPT", "STYLE", "BR", "HR"]);
  for (const el of document.querySelectorAll("*")) {
    if (skip.has(el.tagName)) continue;
    const p = el.parentElement;
    if (!p) continue;
    const cs = getComputedStyle(el), ps = getComputedStyle(p);
    if (cs.position === "absolute" || cs.position === "fixed" || cs.position === "sticky") continue;
    if (/auto|scroll|hidden/.test(ps.overflowX)) continue;     // 父層自己會捲/裁 → 設計如此
    // 負 margin 是刻意的「出血」版面（橫向捲動條貼齊容器邊緣），不是溢出 bug
    if ((parseFloat(cs.marginLeft) || 0) < 0 || (parseFloat(cs.marginRight) || 0) < 0) continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (!r.width || !r.height || !pr.width) continue;
    const padL = parseFloat(ps.paddingLeft) || 0, padR = parseFloat(ps.paddingRight) || 0;
    const over = Math.max((pr.left + padL) - r.left, r.right - (pr.right - padR));
    if (over <= TOL) continue;
    if (over > 400) continue;                                   // 版面根層級的量測雜訊
    const sel = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "")
      + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
    out.push({
      kind: "overflow", sel,
      parent: p.tagName.toLowerCase() + (p.id ? "#" + p.id : "")
        + (p.className && typeof p.className === "string" ? "." + p.className.trim().split(/\s+/).slice(0, 3).join(".") : ""),
      text: (el.innerText || "").trim().slice(0, 24),
      display: cs.display, width: Math.round(r.width), inner: Math.round(pr.width - padL - padR),
      over: Math.round(over),
    });
  }
  return out;
};

(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  if (SHOT) fs.mkdirSync(SHOTDIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, locale: "zh-TW",
    permissions: ["geolocation"], geolocation: { latitude: 25.0330, longitude: 121.5654 },
  });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    localStorage.setItem("tt_lang", "zh");
    localStorage.setItem("tt_onboarded_v2", "1");
  });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);

  const all = new Map();   // sel -> {場景, ...}
  const scan = async label => {
    await p.waitForTimeout(500);
    const hits = [...await p.evaluate(DETECT), ...await p.evaluate(DETECT_OVERFLOW)];
    // 去重鍵要含父層與文字：像 <svg> 這種沒 id/class 的元素，只用標籤名會把不同元素併成一筆
    let fresh = 0;
    for (const h of hits) {
      const key = `${h.kind}|${h.sel}|${h.parent}|${h.text}`;
      if (!all.has(key)) { all.set(key, { ...h, where: label }); fresh++; }
    }
    if (SHOT && fresh) await p.screenshot({ path: path.join(SHOTDIR, label.replace(/[/:]/g, "_") + ".png") });
    console.log(`  ${label}: ${hits.length ? "✗ " + hits.length + " 個（新 " + fresh + "）" : "✓"}`);
  };

  const clean = () => p.evaluate(() => document.querySelectorAll(".tour, .ttdlg-ov").forEach(x => x.remove()));

  console.log("掃描各畫面：");
  await scan("探索");
  // 步道詳情四個分頁
  await p.evaluate(() => window.openDetail(window.TRAILS.find(t => t.geometryReady !== false).id));
  await p.waitForTimeout(1400); await clean();
  await scan("步道詳情-概覽");
  for (const [i, nm] of [[1, "路線"], [2, "生態"], [3, "周邊"]]) {
    await p.evaluate(i => { const t = document.querySelectorAll(".detail-tabs button, .detail-tabs .dt"); if (t[i]) t[i].click(); }, i);
    await p.waitForTimeout(1100);
    await scan("步道詳情-" + nm);
  }
  await p.evaluate(() => document.querySelectorAll(".sheet.show").forEach(x => x.classList.remove("show")));

  // 分頁
  for (const [sel, nm] of [["[data-view=record]", "記錄"], ["[data-view=pet]", "夥伴"], ["[data-view=social]", "社群"], ["[data-view=me]", "我的"]]) {
    await clean();
    await p.locator(sel).first().click({ timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(900);
    await scan(nm);
  }

  // 各種彈窗／子頁面：這些是「只有點進去才看得到」的畫面，最容易漏掉排版問題
  const overlays = [
    ["Premium 升級面板", () => Premium.openUpgrade()],
    ["分級說明", () => openGradeInfo()],
    ["成就步道", () => openAchTree()],
    ["進化圖鑑", () => openPetDex()],
    ["足跡地圖", () => openFootprintMap()],
    ["帽子選擇", () => openHatPicker()],
    ["步道比較", () => openCompareSheet()],
    ["對話框", () => window.ttDialog
      ? window.ttDialog({ title: "測試標題", body: "這是一段測試內容，用來量測對話框裡的按鈕排版。", okText: "確定", cancelText: "取消" })
      : null],
  ];
  for (const [label, fn] of overlays) {
    await clean();
    const opened = await p.evaluate(async src => {
      try { const f = eval("(" + src + ")"); await f(); return true; } catch (e) { return String(e.message); }
    }, fn.toString());
    if (opened !== true) { console.log(`  ${label}: —（開不起來：${opened}）`); continue; }
    await p.waitForTimeout(1100);
    await scan(label);
    await p.evaluate(() => {
      document.querySelectorAll(".sheet.show").forEach(x => x.classList.remove("show"));
      document.querySelectorAll(".ttdlg-ov, .lightbox, .overlay.show").forEach(x => x.remove());
    });
  }

  // 進階分析 / 年度回顧（延遲載入的 analytics.js）
  for (const [label, fn] of [["進階分析", "openAnalytics"], ["年度回顧", "openYearReview"]]) {
    await clean();
    const opened = await p.evaluate(async fn => {
      try { await ensureScript("js/analytics.js"); window[fn](); return true; } catch (e) { return String(e.message); }
    }, fn);
    if (opened !== true) { console.log(`  ${label}: —（開不起來：${opened}）`); continue; }
    await p.waitForTimeout(1300);
    await scan(label);
    await p.evaluate(() => document.querySelectorAll(".sheet.show, .ana-wrap, .yr-wrap").forEach(x => x.classList.remove("show")));
  }

  // 行程結算頁（含 #18 破紀錄升級卡）—— 平常要走完一趟才會出現，這裡直接注入真實 HTML 量測
  await clean();
  await p.evaluate(() => {
    document.querySelectorAll(".sheet.show").forEach(x => x.classList.remove("show"));
    const body = document.querySelector("#trackBody");
    const sheet = document.querySelector("#trackSheet");
    if (!body || !sheet) return;
    body.innerHTML = `
      <h2>信賢步道</h2>
      <div class="track-date">2026/8/2 下午2:20:10</div>
      <div class="pb-burst"><span class="pb-badge">📏 <b>破紀錄·最長距離</b></span><span class="pb-badge">⛰️ <b>破紀錄·最多爬升</b></span></div>
      <div class="track-upsell" id="trackUpsell">
        <button class="tu-x" id="tuDismiss" aria-label="關閉">✕</button>
        <div class="tu-h">✨ 這一刻，值得更多</div>
        <div class="tu-b">升級 PRO：進階分析・無限離線地圖・專屬主題・3D 地形</div>
        <button class="btn primary tu-go" id="tuUpgrade">升級 PRO</button>
      </div>`;
    sheet.classList.add("show");
  });
  await p.waitForTimeout(700);
  await scan("行程結算(含升級卡)");

  await b.close(); srv.kill();

  console.log("\n" + "=".repeat(60));
  const list = [...all.values()];
  if (!list.length) { console.log("✓ 沒有發現「該置中卻沒置中」的元素"); return; }
  const oc = list.filter(h => h.kind === "offcenter"), ov = list.filter(h => h.kind === "overflow");
  if (oc.length) {
    console.log(`✗ 該置中卻沒置中 ${oc.length} 個：\n`);
    for (const h of oc) {
      console.log(`  [${h.where}] ${h.sel}`);
      console.log(`      文字「${h.text}」 display:${h.display} 寬 ${h.width}/${h.inner}px  左留 ${h.gapL} / 右留 ${h.gapR}`);
      console.log(`      父層 ${h.parent}（text-align:center）`);
    }
    console.log("  修法：補 margin-inline:auto（block 元素不吃父層的 text-align:center）\n");
  }
  if (ov.length) {
    console.log(`✗ 溢出容器 ${ov.length} 個：\n`);
    for (const h of ov) {
      console.log(`  [${h.where}] ${h.sel}  超出 ${h.over}px（寬 ${h.width}/${h.inner}）`);
      console.log(`      文字「${h.text}」父層 ${h.parent}`);
    }
  }
  process.exit(1);
})();
