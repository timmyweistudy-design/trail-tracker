#!/usr/bin/env node
// E2E 冒煙測試（node scripts/e2e.js）：Playwright 無頭瀏覽器實開 App，
// 抓「檢查器抓不到的執行期錯誤」——載入、切五個分頁、開步道詳情、開分級說明、切英文。
// 不掛在 pre-commit（較慢），重大改動後手動跑或放 CI。
const { execSync, spawn } = require("child_process");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = 8899;

(async () => {
  // WSL 無 sudo 安裝的系統函式庫：用使用者目錄的本地副本（~/pw-libs，apt-get download + dpkg -x）
  const localLibs = path.join(process.env.HOME || "", "pw-libs", "root", "usr", "lib", "x86_64-linux-gnu");
  if (require("fs").existsSync(localLibs)) {
    process.env.LD_LIBRARY_PATH = localLibs + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
  }
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch { console.error("✗ 請先安裝：npm i -D playwright && npx playwright install chromium"); process.exit(2); }

  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));

  const errors = [];
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => { try { localStorage.setItem("tt_onboarded_v2", "1"); } catch (e) { } });   // 跳過首次導覽浮層
    page.on("pageerror", e => errors.push("pageerror: " + e.message));
    // 忽略外部服務在無頭測試環境的網路/CORS 失敗（線上皆有 try/catch＋後備）：海拔 DEM、翻譯、Supabase、Overpass、圖磚
    const EXT_NOISE = /net::|favicon|404 \(|Failed to load resource|CORS policy|opentopodata|translate\.googleapis|mymemory|supabase|overpass|tile\.|Access to fetch/i;
    page.on("console", m => { if (m.type() === "error" && !EXT_NOISE.test(m.text())) errors.push("console: " + m.text()); });

    const ok = (name, cond) => { console.log((cond ? "✓" : "✗") + " " + name); if (!cond) errors.push("assert: " + name); };

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    ok("App 載入、標題正確", (await page.title()).includes("循徑拾光"));
    ok("步道列表有卡片", await page.locator(".card.jcard").count() > 0);

    // 切五個分頁
    for (const v of ["record", "pet", "me", "social", "explore"]) {
      await page.click(`.tab[data-view="${v}"]`);
      await page.waitForTimeout(600);
      ok(`分頁 ${v} 顯示`, await page.locator(`#view-${v}.active`).count() === 1);
    }

    // 開步道詳情 → 關閉
    await page.click(".card.jcard");
    await page.waitForTimeout(1500);
    ok("步道詳情開啟", await page.locator("#detailSheet.show").count() === 1);
    await page.click("#closeDetailBtn");
    await page.waitForTimeout(400);

    // 分級說明
    await page.click("#btnGradeInfo").catch(() => {});
    await page.waitForTimeout(400);

    // 切英文重載，確認翻譯層生效
    await page.evaluate(() => localStorage.setItem("tt_lang", "en"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const tabText = await page.locator('.tab[data-view="explore"]').innerText();
    ok("英文介面生效（Explore 分頁）", /Explore/i.test(tabText));

    const ttErrs = await page.evaluate(() => (window.ttErrors ? window.ttErrors() : []));
    ok("App 內錯誤日誌乾淨", ttErrs.length === 0);
    if (ttErrs.length) ttErrs.slice(0, 5).forEach(e => console.log("  ttError:", e.m));

    // 四語言凍結回歸（v241 日文同形詞條無限迴圈事故）：每個語言載入後主執行緒必須 3 秒內有回應
    for (const lng of ["es", "ja", "ko", "fr", "de", "cn", "pt", "it", "ru", "th", "vi", "id", "zh"]) {
      await page.evaluate(l => localStorage.setItem("tt_lang", l), lng).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const alive = await Promise.race([
        page.evaluate(() => 1 + 1).then(v => v === 2),
        new Promise(r => setTimeout(() => r(false), 3000)),
      ]);
      ok(`語言 ${lng}：載入後主執行緒有回應（無凍結）`, alive);
      if (!alive) break;
    }
    // 首次語言選擇覆蓋層：用全新 context（無跳過導覽的 initScript、儲存空白）→ 應出現 .lang-gate
    const fresh = await browser.newContext();
    const fp = await fresh.newPage({ viewport: { width: 390, height: 844 } });
    await fp.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await fp.waitForTimeout(2000);
    ok("首次進入顯示語言選擇", await fp.locator(".lang-gate").count() === 1);
    ok("語言選擇有 14 種", await fp.locator(".lang-gate [data-lg]").count() === 14);
    await fp.click('.lang-gate [data-lg="en"]');
    await fp.waitForTimeout(2500);
    ok("選英文後套用（Explore 分頁）", /Explore/i.test(await fp.locator('.tab[data-view="explore"]').innerText()));
    await fresh.close();
  } catch (e) {
    errors.push("fatal: " + e.message);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (errors.length) { console.error(`\n✗ E2E 未通過（${errors.length}）：`); errors.slice(0, 10).forEach(e => console.error("  • " + e)); process.exit(1); }
  console.log("\n✓ E2E 冒煙測試全部通過");
})();
