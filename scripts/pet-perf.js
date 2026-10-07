// 夥伴效能量測（2026-10-07 寵物優化輪）：node scripts/pet-perf.js [階段,...]
// CPU 降速 4 倍（手機級），每一隻量三段：待機 4 秒、整段餵食、捲出畫面 4 秒（看不到時還花多少 CPU）。
// 每段報：fps、長任務（>50ms）數量與最長、腳本／樣式重算／版面的耗時（CDP Performance.getMetrics 的差）。
// 要帶 LD_LIBRARY_PATH（見 docs）；不在 test:all 裡，是改效能前後對照用的工具
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, ".."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(ROOT + "/scripts/tests/soc-mock.js", "utf8");
const PORT = +process.env.TT_PORT || 8941, KM = [0, 5, 20, 40, 90, 150, 260];
const ONLY = (process.argv[2] || "0,1,2,3,4,5,6").split(",").map(Number);
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(); const rows = [];
  for (const st of ONLY) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await require(ROOT + "/scripts/tests/fake-weather")(p);
    await p.addInitScript(o => { localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", String(o.km)); localStorage.setItem("tt_pet_berry_bonus", "20"); }, { km: KM[st] });
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove())); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(1500);
    await p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); window.__psNoIdle = true; localStorage.removeItem("tt_pet_fed_t"); renderPet(); document.querySelector(".ps-box").scrollIntoView({ block: "center" }); });
    await p.waitForTimeout(800);
    const cdp = await ctx.newCDPSession(p); await cdp.send("Performance.enable"); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await p.evaluate(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ["longtask"] }); });
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
    const seg = async (name, run) => {
      const m0 = await metrics(); await p.evaluate(() => { window.__lt.length = 0; window.__fr = 0; const gen = window.__gen = (window.__gen || 0) + 1; const t = () => { if (window.__gen !== gen) return; window.__fr++; requestAnimationFrame(t); }; requestAnimationFrame(t); window.__t0 = performance.now(); });
      await run();
      const r = await p.evaluate(() => { window.__gen++; const s = (performance.now() - window.__t0) / 1000; return { s, fps: window.__fr / s, lt: window.__lt.length, ltMax: Math.max(0, ...window.__lt) }; });
      const m1 = await metrics(), d = k => ((m1[k] - m0[k]) * 1000 / r.s);   // 每秒花幾毫秒
      rows.push({ stage: st, seg: name, sec: +r.s.toFixed(1), fps: +r.fps.toFixed(1), longTasks: r.lt, longest: Math.round(r.ltMax), scriptMsPerS: +d("ScriptDuration").toFixed(1), styleMsPerS: +d("RecalcStyleDuration").toFixed(1), layoutMsPerS: +d("LayoutDuration").toFixed(1) });
    };
    await seg("idle", () => p.waitForTimeout(4000));
    await seg("feed", async () => { await p.evaluate(() => document.querySelector("#petFeed").click()); await p.waitForFunction(() => !document.querySelector(".ps-box").classList.contains("feeding"), null, { timeout: 90000 }); await p.waitForTimeout(500); });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.evaluate(() => { const v = document.querySelector(".ps-box"); v.style.marginTop = "3000px"; v.scrollIntoView(false); window.scrollTo(0, 0); }); await p.waitForTimeout(600);
    await seg("offscreen", () => p.waitForTimeout(4000));   // 夥伴捲出畫面：理想上幾乎不花 CPU
    await ctx.close();
  }
  console.table(rows); fs.writeFileSync(process.env.PERF_OUT || "/dev/null", JSON.stringify(rows, null, 1));
  await b.close(); srv.kill();
})();
