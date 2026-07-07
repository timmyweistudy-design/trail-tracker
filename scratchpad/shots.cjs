const { spawn } = require("child_process");
const path = require("path"), fs = require("fs");
const ROOT = process.cwd(), PORT = 8913;
const OUT = path.join(ROOT, "store-assets", "ios-screenshots");
(async () => {
  const localLibs = path.join(process.env.HOME || "", "pw-libs", "root", "usr", "lib", "x86_64-linux-gnu");
  if (fs.existsSync(localLibs)) process.env.LD_LIBRARY_PATH = localLibs + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
  const { chromium } = require("playwright");
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch();
  const log = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem("tt_onboarded_v2","1"); localStorage.setItem("tt_lang","zh"); localStorage.setItem("tt_pro","1"); } catch(e){} });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);

    // ---- 1) 記錄中地圖 ----
    await page.click('.tab[data-view="record"]'); await page.waitForTimeout(600);
    await page.check('#simToggle'); await page.waitForTimeout(200);
    await page.click('#btnStart');
    await page.waitForTimeout(5000);                 // sim 跑到中段，地圖有軌跡
    await page.screenshot({ path: path.join(OUT, "05-recording.png") });
    log.push("05-recording ✓ time=" + (await page.textContent('#stTime')));

    // ---- 2) 結算 ----
    await page.waitForFunction(() => Recorder.snapshot().simDone === true, { timeout: 12000 }).catch(()=>{});
    await page.click('#btnStop');
    await page.waitForSelector('#trackSheet.show', { timeout: 20000 });   // DEM 校正後開結算
    await page.waitForTimeout(4500);                 // 結算地圖圖磚載入
    await page.screenshot({ path: path.join(OUT, "06-summary.png") });
    log.push("06-summary ✓");
    await page.evaluate(() => { document.querySelector('#trackSheet').classList.remove('show'); document.querySelector('#trackMask').classList.remove('show'); });
    await page.waitForTimeout(400);

    // ---- 3) 3D 地形（試幾張卡片直到有路線可 3D）----
    await page.click('.tab[data-view="explore"]'); await page.waitForTimeout(800);
    let done3d = false;
    const n = Math.min(6, await page.locator('.card.jcard').count());
    for (let i = 0; i < n && !done3d; i++) {
      await page.locator('.card.jcard').nth(i).click();
      await page.waitForSelector('#detailSheet.show', { timeout: 5000 }).catch(()=>{});
      await page.waitForTimeout(1800);
      const btn = page.locator('.map-3d-btn');
      if (await btn.count()) {
        await btn.first().click();
        const shown = await page.waitForFunction(() => { const m = document.querySelector('#map3d'); return m && !m.hidden; }, { timeout: 6000 }).then(()=>true).catch(()=>false);
        if (shown) {
          await page.waitForTimeout(9000);           // 等地形＋衛星圖磚渲染
          await page.screenshot({ path: path.join(OUT, "07-3d-terrain.png") });
          log.push("07-3d-terrain ✓ (card #" + i + ")");
          done3d = true;
          await page.evaluate(() => { const m=document.querySelector('#map3d'); if(m) m.hidden=true; });
        }
      }
      // close detail
      await page.evaluate(() => { const d=document.querySelector('#detailSheet'); if(d) d.classList.remove('show'); });
      await page.waitForTimeout(500);
    }
    if (!done3d) log.push("07-3d-terrain ✗ 沒找到有路線的步道可 3D");
  } catch (e) { log.push("EXC: " + e.message); }
  finally { await browser.close(); server.kill(); }
  console.log(log.join("\n"));
})();
