// PRO 功能清單（2026-10-10 優化輪 A）：升級彈窗由 premium.js 的 FEATURES 畫出來；程式裡每個 _proGate("id")／openUpgrade("id") 都要在清單裡，
// 新增 PRO 功能才不會漏列（登頂收集冊就是這樣漏掉的）。另外：彈窗不用捲就看得到購買鈕、安全功能分三組、收集冊對免費用戶上鎖但照樣蓋章
const __TTP = +process.env.TT_PORT || 8952;
const ROOT = require("path").resolve(__dirname, "../.."), fs = require("fs"), vm = require("vm"); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const files = [...fs.readdirSync(ROOT + "/web/js").filter(f => f.endsWith(".js")).map(f => "web/js/" + f), ...fs.readdirSync(ROOT + "/web/js/social").filter(f => f.endsWith(".js")).map(f => "web/js/social/" + f)];
const src = files.map(f => [f, fs.readFileSync(ROOT + "/" + f, "utf8")]);
const ctx = { window: {}, document: undefined, localStorage: { getItem: () => null } }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + "/web/js/premium.js", "utf8") + ";window.P=Premium;", ctx);
const ids = new Set(Object.keys(ctx.P.FEAT));
const used = [], bare = [], isOnUse = [];
for (const [f, s] of src) {
  for (const m of s.matchAll(/_proGate\(\s*"([a-z0-9]+)"/g)) used.push([f, m[1]]);
  for (const m of s.matchAll(/openUpgrade\(\s*"([a-z0-9]+)"/g)) used.push([f, m[1]]);
  if (/_proGate\(\s*\)/.test(s)) bare.push(f);
  if (!/premium\.js$|config\.js$|app\.js$/.test(f) && /Premium\.isOn\(\)/.test(s.replace(/typeof Premium === "undefined" \|\| Premium\.isOn\(\)/g, ""))) isOnUse.push(f);
}
const unknown = used.filter(([, id]) => !ids.has(id));
ok(used.length >= 20 && unknown.length === 0, `every PRO gate names a feature listed in the upgrade popup (${used.length} gates) ${JSON.stringify(unknown)}`);
ok(bare.length === 0, "no anonymous _proGate() left " + JSON.stringify(bare));
ok(isOnUse.length === 0, "membership checks go through isPro() " + JSON.stringify(isOnUse));
ok(["peaks", "presets", "emoji"].every(id => ids.has(id)), "popup lists summit log, saved filters and reactions");
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  for (const lang of ["zh", "en"]) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(l => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", l); localStorage.setItem("tt_debug_free", "1"); localStorage.setItem("tt_peaks", JSON.stringify({ b1: { at: "2026-01-01" }, b2: { at: "2026-01-01" }, x3: { at: "2026-02-01" } })); localStorage.setItem("tt_peaks_scan", "1"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); }, lang);
    await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p);
    await p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); document.querySelector('.tab[data-view="me"]').click(); }); await p.waitForTimeout(500);
    ok(await p.evaluate(() => { const t = document.querySelector("#btnPeaks .pro-tag"); return !!t && t.offsetParent !== null; }), `${lang}: summit log button shows the PRO tag for free users`);
    await p.evaluate(() => document.querySelector("#btnPeaks").click()); await p.waitForTimeout(900);
    const r = await p.evaluate(() => { const c = document.querySelector(".premium-card"); if (!c) return null; const go = document.querySelector("#pmGo").getBoundingClientRect(); return { book: !!document.querySelector('[data-ov="peaks"]'), feat: (document.querySelector(".pm-feat") || {}).dataset?.feat, note: (document.querySelector(".pm-note") || {}).textContent || "", goBottom: go.bottom, h: c.scrollHeight, groups: document.querySelectorAll(".pm-fg").length, alsoSafety: /附近步道|Nearby trails/.test([...document.querySelectorAll(".pm-fg li")].map(x => x.textContent).join()), rows: document.querySelectorAll(".pm-compare tbody tr:not(.pm-g)").length, cjk: lang => 0 }; });
    ok(r && !r.book && r.feat === "peaks", `${lang}: free user tapping the summit log gets the upgrade popup about it, not the book`);
    ok(r && /3/.test(r.note) && /2/.test(r.note), `${lang}: popup says how many stamps they already have: ${r && r.note}`);
    ok(r && r.goBottom < 844, `${lang}: trial button visible without scrolling (bottom ${r && Math.round(r.goBottom)})`);
    ok(r && r.h < 844 * (lang === "en" ? 1.75 : 1.45), `${lang}: popup much shorter than before (${r && r.h}px; zh was 2152)`);
    ok(r && r.groups === 3 && !r.alsoSafety, `${lang}: safety features in 3 groups, non-safety items kept out of them`);
    ok(r && r.rows === ids.size, `${lang}: comparison table has every feature (${r && r.rows})`);
    if (lang === "en") { const cjk = await p.evaluate(() => [...document.querySelectorAll(".premium-card *")].filter(e => !e.children.length && /[一-鿿]/.test(e.textContent) && !/循徑拾光/.test(e.textContent)).map(e => e.textContent.trim()).slice(0, 5)); ok(cjk.length === 0, "en: popup fully translated " + JSON.stringify(cjk)); }
    // 蓋章不受影響：免費用戶的紀錄照樣蓋
    if (lang === "zh") { const n = await p.evaluate(() => { const pk = Peaks.LISTS.b.data[3]; return Peaks.stampRecord({ id: "t", date: new Date().toISOString(), track: [{ lat: pk[3] + .01, lon: pk[4] }, { lat: pk[3], lon: pk[4] }] }, true).length; }); ok(n === 1, "free users still get summits stamped"); }
    await p.context().close();
  }
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
