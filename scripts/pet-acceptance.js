// 七隻視覺驗收（2026-10-08 修正案 A7）：每隻跑同一套固定序列，拍成一張「接觸表」給人看——
//   待機 → 戴帽子 → 餵 3 顆（固定落點）→ 玩松果 → 抱抱 → 睡著 → 叫醒
// 每一格下面印「序列 · 秒數 · PetStage.phase()」（跟錄影標籤同一套名字），逐格數字檢查在 pet-motion.test.js。
// 用法：node scripts/pet-acceptance.js [階段,...]   （要帶 LD_LIBRARY_PATH，見 docs/pet-handoff.md）
// 輸出：scripts/tests/out/acc/sheet-<階段>.png（一隻一張）＋ index.html（全部）＋ acc.json（每格的時間與階段）
// 不在 test:all 裡：這是「給人看」的工具。結論寫在 docs/pet-plan.md 第 4 節的驗收表
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, ".."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(ROOT + "/scripts/tests/soc-mock.js", "utf8");
const PORT = +process.env.TT_PORT || 8942, KM = [0, 5, 20, 40, 90, 150, 260];
const NAME = ["蛋", "幼蟲", "蝴蝶", "狐", "虎", "幼龍", "神龍"];
const SPOT = { 3: null, 4: null, 6: [82, 108, 136] }, DEF = [-62, 8, 66];   // 跟 pet-motion 的第一組一樣；神龍是雲上的 x；狐、虎用真實落點（前掌前方 ±24，null＝不指定）
const ONLY = (process.argv[2] || "0,1,2,3,4,5,6").split(",").map(Number);
const OUT = path.join(ROOT, "scripts/tests/out/acc") + "/"; fs.mkdirSync(OUT, { recursive: true });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(); const all = {};
  const ver = (fs.readFileSync(ROOT + "/web/sw.js", "utf8").match(/trail-tracker-(v\d+)/) || [])[1];
  for (const st of ONLY) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Asia/Taipei" }); const p = await ctx.newPage(); await require(ROOT + "/scripts/tests/fake-weather")(p);
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(km => { localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1"));
      localStorage.setItem("tt_pet_woke", String(Date.now())); localStorage.setItem("tt_test_diary", "1"); localStorage.setItem("tt_debug_km", String(km)); localStorage.setItem("tt_pet_berry_bonus", "40"); window.__psNoIdle = true; window.__ps = { tod: "day", season: "spring", wx: "" }; }, KM[st]);
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove())); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(1500);
    await p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); document.querySelector(".ps-box").scrollIntoView({ block: "center" }); }); await p.waitForTimeout(600);
    const frames = []; let t0 = Date.now(), n = 0;
    const shot = async seq => { const ph = await p.evaluate(() => PetStage.phase()); const f = `s${st}-${String(n++).padStart(3, "0")}.png`; await p.locator(".ps-box").screenshot({ path: OUT + f }); frames.push({ seq, t: +((Date.now() - t0) / 1000).toFixed(1), ph, f }); };
    // 動作進行中每 ~280ms 拍一張，直到條件成立（最多 max 張）
    const film = async (seq, until, max = 40) => { t0 = Date.now(); for (let k = 0; k < max; k++) { await shot(seq); if (await p.evaluate(until)) break; await p.waitForTimeout(200); } };
    t0 = Date.now(); await shot("待機");
    await p.evaluate(() => { localStorage.setItem("tt_pet_hat", "straw"); renderPet(); }); await p.waitForTimeout(500); await shot("戴帽子");
    await p.evaluate(() => { localStorage.removeItem("tt_pet_hat"); renderPet(); }); await p.waitForTimeout(500);
    await p.evaluate(xs => { window.__psSpots = xs; PetStage.feed(BERRY_SVG); }, st in SPOT ? SPOT[st] : DEF); await p.waitForTimeout(100);
    await film("餵食", () => !document.querySelector(".ps-box").classList.contains("feeding"), 120); await shot("餵食完");
    await p.evaluate(() => { PetStage.play(BERRY_SVG); });   // 大括號：不要把 Promise 回傳給 evaluate（不然會等到動作播完才往下拍） await p.waitForTimeout(100);
    await film("玩松果", () => !document.querySelector(".ps-box").classList.contains("playing"), 60);
    await p.evaluate(() => { PetStage.react("hug"); }); await film("抱抱", () => !document.querySelector("#petEmoji").classList.contains("pb-hug"), 8);
    await p.evaluate(() => PetStage.sleep()); await p.waitForTimeout(800); t0 = Date.now(); await shot("睡著");
    await p.evaluate(() => { PetStage.wake(); }); await p.waitForTimeout(80); await film("叫醒", () => PetStage.phase() === "待機", 14);
    all[st] = { frames, errs };
    // 接觸表：一頁 HTML → 拍成一張 PNG
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;padding:12px;font:12px system-ui,sans-serif;background:#f4f1ea;width:1560px}h1{font-size:18px;margin:0 0 8px}
      .g{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}.c{background:#fff;border-radius:6px;padding:3px;text-align:center}.c img{width:100%;display:block;border-radius:4px}
      .c b{display:block;font-size:11px;margin-top:2px}.c i{font-style:normal;color:#666;font-size:10.5px}.e{color:#b00;margin:6px 0}</style>
      <h1>第 ${st} 階 ${NAME[st]} · ${ver} · ${frames.length} 格${errs.length ? `<div class=e>頁面錯誤：${esc(errs.join(" / "))}</div>` : ""}</h1>
      <div class=g>${frames.map(x => `<div class=c><img src="${x.f}"><b>${esc(x.seq)} ${x.t}s</b><i>${esc(x.ph)}</i></div>`).join("")}</div>`;
    fs.writeFileSync(OUT + `sheet-${st}.html`, html);
    const sp = await b.newPage({ viewport: { width: 1584, height: 800 } }); await sp.goto("file://" + OUT + `sheet-${st}.html`); await sp.waitForTimeout(300);
    await sp.screenshot({ path: OUT + `sheet-${st}.png`, fullPage: true }); await sp.close();
    console.log(`第 ${st} 階 ${NAME[st]}：${frames.length} 格 → ${OUT}sheet-${st}.png${errs.length ? "　頁面錯誤 " + errs.length : ""}`);
    await ctx.close();
  }
  fs.writeFileSync(OUT + "acc.json", JSON.stringify({ ver, at: new Date().toISOString(), stages: all }, null, 1));
  fs.writeFileSync(OUT + "index.html", `<!doctype html><meta charset=utf-8><title>七隻驗收 ${ver}</title>` + ONLY.map(s => `<h2>${s} ${NAME[s]}</h2><img src="sheet-${s}.png" style="max-width:100%">`).join(""));
  await b.close(); srv.kill();
})();
