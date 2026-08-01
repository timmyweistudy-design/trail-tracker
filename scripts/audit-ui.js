// 全面 UI 巡檢：真瀏覽器逐項驗「畫面上真的有東西、而且是對的」。
// 純單元測試抓不到的（選擇器失效、聚光燈框到空白、欄位顯示「—」）都靠這支。
// node scripts/audit-ui.js [--shot]   --shot = 順便存截圖到 scratchpad
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const localLibs = path.join(process.env.HOME, "pw-libs/root/usr/lib/x86_64-linux-gnu");
if (fs.existsSync(localLibs)) process.env.LD_LIBRARY_PATH = localLibs + ":" + (process.env.LD_LIBRARY_PATH || "");
const PORT = 8897;
const SHOT = process.argv.includes("--shot");
const SHOTDIR = path.join(ROOT, "scratchpad", "audit-shots");

const fails = [], notes = [];
const bad = m => { fails.push(m); console.log("  ✗ " + m); };
const ok = m => console.log("  ✓ " + m);

(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  if (SHOT) fs.mkdirSync(SHOTDIR, { recursive: true });
  const b = await chromium.launch();
  // 給定位權限：不給的話記錄頁會一直掛著權限說明卡（.ttdlg-ov），而 ttCoach 設計上
  // 「有對話框就讓路」，情境導覽永遠不會出現 —— 那是環境問題不是 bug，別讓巡檢誤報。
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, locale: "zh-TW",
    permissions: ["geolocation"], geolocation: { latitude: 25.0330, longitude: 121.5654 },
  });
  const p = await ctx.newPage();
  const jsErr = [];
  p.on("pageerror", e => jsErr.push(String(e.message)));
  const EXT = /net::|favicon|Failed to load resource|CORS|opentopodata|translate\.googleapis|supabase|overpass|tile\.|gstatic|googleapis/i;
  p.on("console", m => { if (m.type() === "error" && !EXT.test(m.text())) jsErr.push(m.text()); });

  // 跳過語言選擇與導覽（各自單獨驗）
  await p.addInitScript(() => {
    localStorage.setItem("tt_lang", "zh");
    localStorage.setItem("tt_onboarded_v2", "1");
  });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);

  // ---------- A. 資料載入 ----------
  console.log("\nA. 資料載入");
  const counts = await p.evaluate(() => ({
    trails: (window.TRAILS || []).length,
    withLen: (window.TRAILS || []).filter(t => t.length_km != null).length,
    withDiff: (window.TRAILS || []).filter(t => t.difficulty != null).length,
    regions: [...new Set((window.TRAILS || []).map(t => t.region))].length,
  }));
  counts.trails > 2900 ? ok(`載入 ${counts.trails} 條步道`) : bad(`步道只載入 ${counts.trails} 條`);
  counts.withLen === counts.trails ? ok("每條都有長度") : bad(`${counts.trails - counts.withLen} 條缺長度`);
  counts.withDiff === counts.trails ? ok("每條都有難度") : bad(`${counts.trails - counts.withDiff} 條缺難度`);
  counts.regions === 22 ? ok("22 個縣市") : bad(`縣市數 ${counts.regions}（應 22）`);

  // 卡片真的有渲染出來
  const cards = await p.locator("#trailList .card").count();
  cards > 0 ? ok(`探索頁渲染 ${cards} 張卡片`) : bad("探索頁沒有卡片");

  // ---------- B. 搜尋（含這次新增的步道）----------
  console.log("\nB. 搜尋");
  for (const q of ["橫嶺古道", "樟之細路", "南子吝", "千里步道", "草嶺古道"]) {
    await p.fill("#searchInput", q);
    await p.waitForTimeout(420);
    const n = await p.locator("#trailList .card").count();
    const first = n ? (await p.locator("#trailList .card").first().innerText()).split("\n")[0] : "";
    n > 0 ? ok(`「${q}」→ ${n} 筆，第一筆：${first}`) : bad(`「${q}」搜不到`);
  }
  await p.fill("#searchInput", "");
  await p.waitForTimeout(420);

  // ---------- C. 步道詳情：所有資訊欄位 ----------
  console.log("\nC. 步道詳情欄位");
  // 挑三條代表：官方(forestry)、這次新增的 relation、這次新增的 way
  const picks = await p.evaluate(() => {
    const T = window.TRAILS;
    const f = T.find(t => t.source === "forestry" && t.guide && t.pave);
    const h = T.find(t => t.name === "橫嶺古道");
    const z = T.find(t => t.name === "樟之細路");
    return [f, h, z].filter(Boolean).map(t => ({ id: t.id, name: t.name }));
  });
  for (const pick of picks) {
    await p.evaluate(id => window.openDetail && window.openDetail(id), pick.id);
    await p.waitForTimeout(1100);
    const info = await p.evaluate(() => {
      const d = document.querySelector("#detailSheet, .sheet.show");
      const txt = d ? d.innerText : document.body.innerText;
      return {
        open: !!d && d.offsetHeight > 100,
        txt,
        emptyDash: (txt.match(/—\s*(km|公里|m)\b/g) || []).length,
        hasMap: !!document.querySelector(".leaflet-container"),
      };
    });
    if (!info.open) { bad(`${pick.name}：詳情頁沒開起來`); continue; }
    // 畫面上長度寫「0.87 km」不是「公里」，難度是「1輕鬆(估)」這種組合字
    const checks = [
      ["長度", /\d+(\.\d+)?\s*(km|公里)/],
      ["難度", /輕鬆|一般|進階|挑戰|困難|雪季|無障礙/],
      ["地區", /縣|市/],
      ["資料來源", /資料來源|林業|OpenStreetMap/],
    ];
    const missing = checks.filter(([, re]) => !re.test(info.txt)).map(([k]) => k);
    missing.length ? bad(`${pick.name}：詳情缺「${missing.join("、")}」`)
      : ok(`${pick.name}：長度/難度/地區/來源齊全${info.hasMap ? "、地圖已渲染" : "、⚠️無地圖"}`);
    if (info.emptyDash) notes.push(`${pick.name} 詳情有 ${info.emptyDash} 處顯示「—」`);
    if (SHOT) await p.screenshot({ path: path.join(SHOTDIR, `detail-${pick.name}.png`) });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
  }

  // ---------- D. 導覽：逐步驗聚光燈真的框到東西 ----------
  console.log("\nD. 導覽（onboarding 逐步）");
  await p.evaluate(() => { localStorage.removeItem("tt_onboarded_v2"); });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  // 詳情若還開著，會先觸發 ttCoachTrail 而不是主導覽 → 先清乾淨
  await p.evaluate(() => {
    document.querySelectorAll(".tour, .ttdlg-ov").forEach(x => x.remove());
    document.querySelectorAll(".sheet.show").forEach(x => x.classList.remove("show"));
    window.onboarding && window.onboarding(true);
  });
  await p.waitForTimeout(900);
  let step = 0;
  for (; step < 20; step++) {
    const st = await p.evaluate(() => {
      const ov = document.querySelector(".tour");
      if (!ov) return null;
      const sp = document.querySelector(".tour-spot");
      const tip = document.querySelector(".tour-tip");
      const r = sp ? sp.getBoundingClientRect() : null;
      // 置中步驟（歡迎/結束）沒有目標元素，app.js 就是把聚光燈設成 0x0 並放在 50%/50%，
      // 那是正確行為不是破圖——用這個特徵判斷，不能單看寬高為 0。
      const centered = !!sp && sp.style.top === "50%" && sp.style.left === "50%";
      return {
        head: tip ? (tip.innerText || "").replace(/^✕\s*/, "").split("\n").filter(Boolean)[0] || "" : "",
        w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
        centered,
        tipText: tip ? tip.innerText.trim().length : 0,
      };
    });
    if (!st) break;
    // 非置中步驟的聚光燈要真的框到元素（寬高不能是 0）
    if (!st.centered && (st.w < 8 || st.h < 8)) bad(`導覽第 ${step + 1} 步「${st.head}」聚光燈框到空白（${st.w}x${st.h}）`);
    if (st.tipText < 4) bad(`導覽第 ${step + 1} 步文字是空的`);
    if (SHOT) await p.screenshot({ path: path.join(SHOTDIR, `tour-${String(step + 1).padStart(2, "0")}.png`) });
    // 下一步是 #tourNext；「button:last-of-type」會抓到「跳過導覽」，一按就整個結束
    const advanced = await p.evaluate(() => {
      const btn = document.querySelector("#tourNext");
      if (!btn) return false; btn.click(); return true;
    });
    if (!advanced) break;
    await p.waitForTimeout(700);
  }
  step > 8 ? ok(`導覽走完 ${step} 步，每步都有聚光燈與文字`) : bad(`導覽只走了 ${step} 步（應 13 步）`);

  // ---------- E. 情境導覽（步道詳情/記錄）----------
  console.log("\nE. 情境導覽");
  await p.evaluate(() => { document.querySelectorAll(".tour").forEach(x => x.remove()); });
  // 情境導覽有前置條件：ttCoachTrail 要詳情開著、ttCoachRecord 要 body.dataset.view==="record"，
  // 不先把畫面切到對的地方就直接呼叫，函式會自己 return，看起來像壞掉。
  for (const [fn, flag, label, prep] of [
    ["ttCoachTrail", "tt_coach_trail", "步道詳情", "detail"],
    ["ttCoachRecord", "tt_coach_record", "記錄", "record"],
  ]) {
    if (prep === "detail") {
      await p.evaluate(() => window.openDetail(window.TRAILS[0].id));
      await p.waitForTimeout(1100);
    } else {
      // 詳情 sheet / 導覽覆蓋層會攔截點擊 → 重新載入再切分頁最可靠
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForTimeout(1000);
      await p.evaluate(() => document.querySelectorAll(".tour, .ttdlg-ov").forEach(x => x.remove()));
      await p.locator("[data-view=record]").first().click({ timeout: 8000 }).catch(() => bad("切不到記錄頁"));
      await p.waitForTimeout(900);
    }
    const r = await p.evaluate(([fn, flag]) => {
      localStorage.removeItem(flag);
      // ttCoach 遇到 .tour 或 .ttdlg-ov 會直接 return（讓路給主導覽/對話框），兩種都要先清
      document.querySelectorAll(".tour, .ttdlg-ov").forEach(x => x.remove());
      if (typeof window[fn] !== "function") return { missing: true };
      try { window[fn](true); } catch (e) { return { err: e.message }; }
      return { ok: true };
    }, [fn, flag]);
    await p.waitForTimeout(800);
    const shown = await p.evaluate(() => {
      const t = document.querySelector(".tour-tip");
      const n = t ? t.innerText.trim().length : 0;
      document.querySelectorAll(".tour").forEach(x => x.remove());
      return n;
    });
    if (r.missing) bad(`${label}導覽函式不存在`);
    else if (r.err) bad(`${label}導覽拋錯：${r.err}`);
    else if (!shown) bad(`${label}導覽沒有顯示內容`);
    else ok(`${label}導覽正常（${shown} 字）`);
  }

  // ---------- F. 分頁切換 ----------
  console.log("\nF. 主要分頁");
  // 前面幾節會留下詳情 sheet / 導覽覆蓋層攔截點擊；重新載入是最乾淨的起點
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  for (const [sel, name] of [["[data-view=explore]", "探索"], ["[data-view=record]", "記錄"], ["[data-view=pet]", "夥伴"], ["[data-view=social]", "社群"], ["[data-view=me]", "我的"]]) {
    const el = p.locator(sel).first();
    if (!await el.count()) { bad(`找不到分頁按鈕 ${name}`); continue; }
    // headless 沒有定位權限，記錄頁會跳 GPS 錯誤對話框，覆蓋層會擋住後續所有點擊
    await p.evaluate(() => document.querySelectorAll(".ttdlg-ov, .tour").forEach(x => x.remove()));
    await el.click({ timeout: 8000 }).catch(() => bad(`分頁 ${name} 點不動（有東西擋住）`));
    await p.waitForTimeout(800);
    // 分頁是 <section id="view-xxx" class="view active">，要抓 .view.active 才是當前頁
    const r = await p.evaluate(() => {
      const v = document.querySelector(".view.active");
      return { id: v ? v.id : "(無 active)", n: v ? v.innerText.trim().length : 0 };
    });
    r.n > 10 ? ok(`${name} 頁有內容（${r.id}，${r.n} 字）`) : bad(`${name} 頁是空的（${r.id}）`);
    if (SHOT) await p.screenshot({ path: path.join(SHOTDIR, `view-${name}.png`) });
  }

  // ---------- G. JS 錯誤 ----------
  console.log("\nG. JS 錯誤");
  jsErr.length ? jsErr.slice(0, 8).forEach(e => bad("JS error: " + e.slice(0, 120))) : ok("無 JS 例外");

  await b.close(); srv.kill();
  console.log("\n" + "=".repeat(50));
  if (notes.length) { console.log("提醒（非失敗）："); notes.forEach(n => console.log("  · " + n)); }
  if (fails.length) { console.log(`✗ 巡檢發現 ${fails.length} 個問題`); process.exit(1); }
  console.log("✓ UI 巡檢全數通過");
  if (SHOT) console.log("截圖：" + SHOTDIR);
})();
