// 主動 QA 巡檢：真瀏覽器把主要互動流程走一遍，收集 console error / pageerror / App 內錯誤日誌。
// 一次性稽核工具（不進 CI）。node scripts/qa-crawl.js
const { chromium } = require("playwright");
const path = require("path"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const localLibs = path.join(process.env.HOME, "pw-libs/root/usr/lib/x86_64-linux-gnu");
if (require("fs").existsSync(localLibs)) process.env.LD_LIBRARY_PATH = localLibs + ":" + (process.env.LD_LIBRARY_PATH || "");
const PORT = 8896;
const EXT = /net::|favicon|404 \(|Failed to load resource|CORS|opentopodata|translate\.googleapis|mymemory|supabase|overpass|tile\.|Access to fetch|gstatic|googleapis/i;

(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(() => localStorage.setItem("tt_onboarded_v2", "1"));
  const errs = [];
  const mark = s => `${cur} | ${s}`;
  let cur = "load";
  p.on("pageerror", e => errs.push(mark("pageerror: " + e.message)));
  p.on("console", m => { if (m.type() === "error" && !EXT.test(m.text())) errs.push(mark("console: " + m.text().slice(0, 160))); });

  const step = async (label, fn) => { cur = label; try { await fn(); await p.waitForTimeout(500); } catch (e) { errs.push(mark("STEP THREW: " + e.message.slice(0, 120))); } };
  const click = async sel => { const el = p.locator(sel).first(); if (await el.count()) { await el.scrollIntoViewIfNeeded().catch(() => {}); await el.click({ timeout: 4000 }).catch(e => errs.push(mark("click fail " + sel))); } };
  // 關掉任何開著的浮層（ESC 或已知關閉鈕），避免殘留遮擋後續步驟
  const closeAny = async () => {
    for (const id of ["#anaX", "#yrX", "#closeDetailBtn"]) { const e = p.locator(id); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
    await p.keyboard.press("Escape").catch(() => {});
    await p.evaluate(() => document.querySelectorAll(".pet-modal, .ttdlg-ov").forEach(o => o.remove()));
    await p.waitForTimeout(200);
  };

  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);

  await step("探索:搜尋", async () => { await p.fill("#searchInput", "古道"); await p.waitForTimeout(600); await p.fill("#searchInput", ""); });
  await step("探索:篩選面板", async () => { await click("#btnFilter"); await p.waitForTimeout(500); await click("#filterSheet .sheet-close"); });
  await step("探索:地圖檢視", async () => { await click('.seg-btn[data-mode="map"]'); await p.waitForTimeout(1200); await click('.seg-btn[data-mode="list"]'); });
  await step("探索:主題輯", async () => { await click(".collections .col-card, .collection-card, [data-collection]"); await p.waitForTimeout(600); });
  await step("探索:篩選 chip", async () => { for (const f of ["family", "fav", "done", "all"]) { await click(`.chip[data-filter="${f}"]`); await p.waitForTimeout(300); } });

  await step("詳情:開卡", async () => { await click(".card.jcard"); await p.waitForTimeout(1500); });
  await step("詳情:子頁", async () => { for (const s of ["天氣", "海拔", "景點", "美食", "概覽"]) { await p.locator(`#detailSheet button:has-text("${s}"), #detailSheet .sub-tab:has-text("${s}")`).first().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(700); } });
  await step("詳情:跳到底部鈕", async () => { await click("#detailJump"); await p.waitForTimeout(600); });
  await step("詳情:關閉", async () => { await click("#closeDetailBtn"); });

  await step("寵物:分頁", async () => { await click('.tab[data-view="pet"]'); await p.waitForTimeout(800); });
  await step("寵物:餵食", async () => { await p.locator('button:has-text("餵食"), #btnFeed').first().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(600); });
  await step("寵物:任務/成就/手冊", async () => { for (const t of ["每日任務", "成就", "夥伴手冊", "圖鑑", "帶我去走"]) { await p.locator(`button:has-text("${t}"), .link-btn:has-text("${t}")`).first().click({ timeout: 2500 }).catch(() => {}); await p.waitForTimeout(500); const x = p.locator(".pet-modal .sheet-close, .pet-modal-card .sheet-close").first(); if (await x.count()) await x.click().catch(() => {}); } });

  await step("_clean1", closeAny);
  await step("記錄:分頁", async () => { await click('.tab[data-view="record"]'); await p.waitForTimeout(700); });
  await step("記錄:模擬走一小段", async () => {
    // 模擬模式是 PRO 功能 → 巡檢時先取得會員身分（假造 Supabase 訂閱查詢），
    // 否則點模擬會彈出升級面板，遮罩會擋掉後面所有點擊，整輪巡檢失效
    await p.evaluate(async () => {
      Supa.ready = () => true;
      Supa.client = () => ({
        auth: { getUser: async () => ({ data: { user: { id: "qa" } } }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "active", current_period_end: null }, error: null }) }) }) }),
      });
      await Premium.refresh();
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const t = document.getElementById("simToggle"); if (t && !t.checked) t.click(); });
    await click("#btnStart"); await p.waitForTimeout(4000); await click("#btnStop"); await p.waitForTimeout(2000);
    await click("#trackSheet .sheet-close");
  });

  await step("_clean2", closeAny);
  await step("我的:分頁", async () => { await click('.tab[data-view="me"]'); await p.waitForTimeout(700); });
  await step("我的:進階分析渲染", async () => { const e = await p.evaluate(() => { try { openAnalytics(); return null; } catch (x) { return x.message; } }); if (e) errs.push(mark("openAnalytics THREW: " + e)); await p.waitForTimeout(900); await click("#anaX"); });
  await step("_clean3", closeAny);
  await step("我的:年度回顧渲染", async () => { const e = await p.evaluate(() => { try { openYearReview(); return null; } catch (x) { return x.message; } }); if (e) errs.push(mark("openYearReview THREW: " + e)); await p.waitForTimeout(900); await click("#yrX"); });
  await step("我的:切語言(ja)再切回", async () => {
    await p.evaluate(() => localStorage.setItem("tt_lang", "ja")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
    await p.evaluate(() => localStorage.setItem("tt_lang", "zh")); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(2000);
  });

  await step("社群:分頁(未登入)", async () => { await click('.tab[data-view="social"]'); await p.waitForTimeout(3000); });

  // App 內部錯誤日誌
  const ttErrs = await p.evaluate(() => (window.ttErrors ? window.ttErrors() : []));
  ttErrs.forEach(e => { if (!EXT.test(e.m)) errs.push("ttError | " + e.m.slice(0, 160)); });

  await b.close(); srv.kill();
  const uniq = [...new Set(errs)];
  if (uniq.length) { console.log(`\n✗ 巡檢發現 ${uniq.length} 個問題：`); uniq.forEach(e => console.log("  • " + e)); process.exit(1); }
  console.log("\n✓ QA 巡檢：所有流程無 console 錯誤／例外／App 錯誤日誌");
})();
