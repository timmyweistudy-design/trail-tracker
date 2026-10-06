// 夥伴餵食在 WebKit（Safari 的引擎）上的冒煙測試（2026-10-06）：iOS 的 WebKit 會把有 3D 轉動的 SVG 照畫布裁切（不管 overflow:visible），
// 老虎趴下時頭被一條看不見的線切掉——Chromium 看不到這個問題。這裡用真的 WebKit 跑七隻的餵食，邊跑邊檢查畫出來的東西都在畫布裡。
// 沒裝 WebKit 的機器（CI）就略過（FAILS 0）。本機裝法見記憶 playwright-needs-ld-library-path：系統庫解到 ~/pwlibs/root、改 MiniBrowser 包裝腳本
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, "../.."); const { webkit } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(__dirname + "/soc-mock.js", "utf8"); const PORT = +process.env.TT_PORT || 8912;
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
const pw = path.join(require("os").homedir(), "pwlibs/root/usr/lib/x86_64-linux-gnu"); if (fs.existsSync(pw) && !(process.env.LD_LIBRARY_PATH || "").includes(pw)) process.env.LD_LIBRARY_PATH = [pw, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
let fails = 0; const errs = []; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  let b; try { b = await webkit.launch(); } catch (e) { console.log("SKIP webkit not available: " + e.message.split("\n")[0]); console.log("ERRS []"); console.log("FAILS 0"); return; }
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  for (const [km, st, spots] of [[0, 0, [-34, 2, 34]], [5, 1, null], [20, 2, [-62, 8, 66]], [40, 3, [-62, 8, 66]], [90, 4, [66, 40, 18]], [150, 5, [-62, 8, 66]], [260, 6, [104, 150, 176]]]) {   // 七隻全部（幼蟲用遊戲真的落點）
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on("pageerror", e => errs.push(st + ": " + e.message));
    await p.addInitScript(o => { localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", String(o.km)); localStorage.setItem("tt_pet_berry_bonus", "20"); }, { km });
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(3000);
    await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove())); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(1500);
    const r = await p.evaluate(async s => {
      document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); window.__psNoIdle = true; window.__psSpots = s; localStorage.removeItem("tt_pet_fed_t"); renderPet(); document.querySelector(".ps-box").scrollIntoView({ block: "center" });
      await new Promise(r => setTimeout(r, 500)); document.querySelector("#petFeed").click();
      let spill = 0, seen = false; const t0 = performance.now();
      while (performance.now() - t0 < 40000) {
        const sv = document.querySelector("#petEmoji .pet-critter"), R = sv.getBoundingClientRect();
        [...sv.children].filter(g => g.tagName === "g" && getComputedStyle(g).display !== "none").forEach(g => { const q = g.getBoundingClientRect(); if (q.width) spill = Math.max(spill, R.left - q.left, q.right - R.right, R.top - q.top, q.bottom - R.bottom); });
        const n = document.querySelectorAll(".ps-berry").length; if (n) seen = true; if (seen && !n && !document.querySelector(".ps-box").classList.contains("walking")) break;
        await new Promise(r => setTimeout(r, 60));
      }
      return { spill: +spill.toFixed(1), done: seen && !document.querySelectorAll(".ps-berry").length, padded: document.querySelector("#petEmoji .pet-critter").classList.contains("pc-pad") };
    }, spots);
    ok(r.done && r.padded && r.spill <= 0, `webkit stage ${st}: feeds to the end and nothing is drawn outside the canvas ${JSON.stringify(r)}`);
    await ctx.close();
  }
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill();
})();
