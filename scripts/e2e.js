#!/usr/bin/env node
// E2E 冒煙測試（node scripts/e2e.js）：Playwright 無頭瀏覽器實開 App，
// 抓「檢查器抓不到的執行期錯誤」——載入、切五個分頁、開步道詳情、開分級說明、切英文。
// 不掛在 pre-commit（較慢），重大改動後手動跑或放 CI。
const { execSync, spawn } = require("child_process");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = 8899;

(async () => {
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
    page.on("pageerror", e => errors.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error" && !/net::|favicon|404 \(|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });

    const ok = (name, cond) => { console.log((cond ? "✓" : "✗") + " " + name); if (!cond) errors.push("assert: " + name); };

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    ok("App 載入、標題正確", (await page.title()).includes("循徑拾光"));
    ok("步道列表有卡片", await page.locator(".trail-card").count() > 0);

    // 切五個分頁
    for (const v of ["record", "pet", "me", "social", "explore"]) {
      await page.click(`.tab[data-view="${v}"]`);
      await page.waitForTimeout(600);
      ok(`分頁 ${v} 顯示`, await page.locator(`#view-${v}.active`).count() === 1);
    }

    // 開步道詳情 → 關閉
    await page.click(".trail-card");
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
  } catch (e) {
    errors.push("fatal: " + e.message);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (errors.length) { console.error(`\n✗ E2E 未通過（${errors.length}）：`); errors.slice(0, 10).forEach(e => console.error("  • " + e)); process.exit(1); }
  console.log("\n✓ E2E 冒煙測試全部通過");
})();
