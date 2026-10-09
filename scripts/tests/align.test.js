// 排版對齊（2026-10-09）：置中的標題底下，靠左的次要文字不能比標題更往左（scripts/tests/align-rule.js）
// 守住這次修過的：夥伴手冊、活力和親密說明、山社、回報路況。全站掃描用 node scripts/align-scan.js
const __TTP = +process.env.TT_PORT || 8935;
const ROOT = require("path").resolve(__dirname, "../.."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = require("fs").readFileSync(__dirname + "/soc-mock.js", "utf8"); const SCAN = require("./align-rule"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", "95"); });
  await p.addInitScript(MOCK); await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p); await p.evaluate(() => window.__installFakeSupa({}));
  const kill = () => p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov,.pet-modal,#debugPanel").forEach(e => e.remove()));
  const check = async (name, fn) => { await kill(); await fn(); await p.waitForTimeout(700); const r = await p.evaluate(SCAN); ok(r.length === 0, `${name}: subtext never sticks out left of a centered title ${r.length ? JSON.stringify(r) : ""}`); };
  await check("pet handbook", async () => { await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(600); await p.click("#petDex"); });
  await check("vigor/affinity help", async () => { await p.click("#petHelp"); });
  const dbg = lb => async () => { await p.evaluate(async () => { await ensureScript("js/debug.js"); window.ttIsOwner = async () => true; if (!document.getElementById("debugPanel")) await window.openDebugPanel(); }); await p.waitForSelector("#debugPanel button", { timeout: 5000, state: "attached" }); await p.evaluate(lb => [...document.querySelectorAll("#debugPanel button")].find(x => x.textContent.includes(lb)).click(), lb); };
  await check("clubs sheet", dbg("山社"));
  await check("trail report", dbg("回報路況"));
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
