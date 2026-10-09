// 英文＋最大字級（2026-10-09 收尾掃描 scripts/ui-sweep.js 抓到的）：視窗裡不能左右滑、明信片的縣市要翻譯
//   拜訪卡三顆按鈕放不下一排要換行（以前擠出卡片）、擺設格子的長英文要斷、夥伴的旅行上面的分頁鈕要換行
const __TTP = +process.env.TT_PORT || 8939;
const ROOT = require("path").resolve(__dirname, "../.."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = require("fs").readFileSync(__dirname + "/soc-mock.js", "utf8"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  for (const [lang, fsz] of [["en", "1.65"], ["en", "1.2"], ["zh", "1.65"]]) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" })).newPage(); /* SW 不是這裡要測的：擋掉，免得中途接手重整頁面 */ await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(o => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", "1"); localStorage.setItem("tt_lang", o.lang); localStorage.setItem("tt_fontscale", o.fsz); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", "95"); }, { lang, fsz });
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${__TTP}/`);
    // 切語言會重整一次（時間不一定）：等到連續 2 秒沒有換頁才開始
    let nav = Date.now(); p.on("framenavigated", f => { if (f === p.mainFrame()) nav = Date.now(); });
    while (Date.now() - nav < 2000) await p.waitForTimeout(250);
    await require(__dirname + "/ready")(p);
    await p.evaluate(() => { window.__installFakeSupa({}); document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); });
    await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(800);
    const wide = () => p.evaluate(() => { const c = document.querySelector(".pet-modal-card"); return c ? c.scrollWidth - c.clientWidth : -1; });
    const close = () => p.evaluate(() => document.querySelectorAll(".pet-modal,[data-ov]").forEach(e => e.remove()));
    const tag = `${lang} ${fsz}`;
    await p.evaluate(() => Pets.visit(window.__fakeT.profiles.find(x => x.id === "u1"), false, null)); await p.waitForTimeout(500);
    ok(await wide() === 0, `${tag}: visit card doesn't scroll sideways (${await wide()}px)`); await close();
    await p.click("#petDress"); await p.waitForTimeout(400); await p.evaluate(() => document.querySelectorAll('[data-ov="pethat"] .dr-tabs button')[2].click()); await p.waitForTimeout(300);
    ok(await wide() === 0, `${tag}: decor pane doesn't scroll sideways (${await wide()}px)`); await close();
    // 分成幾小步、各自重試：一次 await 很久（載測試面板＋社群模組）偶爾會碰到 Playwright 的「執行環境被換掉」（頁面其實沒換）
    const step = async (fn, arg) => { for (let k = 0; ; k++) try { return await p.evaluate(fn, arg); } catch (e) { if (k >= 3 || !/Execution context was destroyed/.test(e.message)) throw e; await p.waitForTimeout(600); } };
    await step(() => ensureScript("js/debug.js"));
    await step(() => { if (!window.__ufTrails) { window.__ufTrails = 1; for (const t of TRAILS.filter(t => /新北|宜蘭/.test(t.region || "")).slice(0, 2)) ttDebug.addTrail(t, 3); } });
    await step(async () => { window.ttIsOwner = async () => true; if (!document.getElementById("debugPanel")) await window.openDebugPanel(); });
    await p.waitForSelector("#debugPanel button", { state: "attached" });
    await p.evaluate(() => [...document.querySelectorAll("#debugPanel button")].find(x => /明信片簿|Postcard/.test(x.textContent)).click()); await p.waitForTimeout(1000);
    ok(await wide() === 0, `${tag}: postcard album doesn't scroll sideways (${await wide()}px)`);
    if (lang === "en") { const m = await p.evaluate(() => [...document.querySelectorAll(".pj-meta")].map(e => e.textContent)); ok(m.length > 0 && m.every(t => !/[一-鿿]/.test(t)), "en: postcard county names are translated " + JSON.stringify(m.slice(0, 2))); }
    await p.context().close();
  }
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
