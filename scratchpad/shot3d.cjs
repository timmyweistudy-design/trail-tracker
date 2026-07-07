const { spawn } = require("child_process");
const path = require("path"), fs = require("fs");
const ROOT = process.cwd(), PORT = 8914;
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
    page.on("console", m => { if (/3D|maplibre|WebGL/i.test(m.text())) log.push("[con] " + m.text()); });
    await page.addInitScript(() => { try { localStorage.setItem("tt_onboarded_v2","1"); localStorage.setItem("tt_lang","zh"); localStorage.setItem("tt_premium","1"); } catch(e){} });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    // 載入全部縣市幾何分片，挑一條有路線且點數多的知名步道開 3D
    await page.evaluate(async () => { await ensureGeo(); });
    const picked = await page.evaluate(() => {
      const cnt = g => (g||[]).reduce((s,seg)=>s+(seg?seg.length:0),0);
      let best=null,bn=0;
      for (const t of TRAILS){ const g=geoOf(t); const c=cnt(g); if(c>bn && c<4000){best=t;bn=c;} }
      if(!best) return null;
      selectedTrailId = best.id;
      Premium.gate = () => true; Premium.isOn = () => true;
      open3D(best);
      return best.name + " (pts=" + bn + ")";
    });
    log.push("picked: " + picked);
    if (!picked) throw new Error("no trail with geometry");
    await page.waitForFunction(() => { const m=document.querySelector('#map3d'); return m && !m.hidden; }, { timeout: 12000 });
    // 等 maplibre 地形+衛星圖磚渲染 idle
    await page.waitForTimeout(11000);
    await page.screenshot({ path: path.join(OUT, "07-3d-terrain.png") });
    log.push("07-3d-terrain saved");
  } catch (e) { log.push("EXC: " + e.message); }
  finally { await browser.close(); server.kill(); }
  console.log(log.join("\n"));
})();
